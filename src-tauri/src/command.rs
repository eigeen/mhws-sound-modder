use std::{
    fs::{self, File},
    io::{self, Write},
    path::{Path, PathBuf},
};

use eyre::Context;
use indexmap::IndexMap;
use re_sound::bnk::SectionPayload;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::{
    loudness::{self, LoudnessInfo},
    service::TranscodeService,
};

fn map_result<F, V>(f: F) -> std::result::Result<V, String>
where
    F: FnOnce() -> std::result::Result<V, eyre::Error>,
{
    f().map_err(|e| format!("{:#}", e))
}

#[tauri::command]
pub fn bnk_load_file(
    path: &str,
    section_filter: Option<Vec<u32>>,
) -> Result<re_sound::bnk::Bnk, String> {
    map_result(|| {
        let file = File::open(path)?;
        let mut reader = std::io::BufReader::new(file);
        let mut bnk = re_sound::bnk::Bnk::from_reader(&mut reader)?;
        // use filter to remove sections
        if let Some(filter) = section_filter {
            let mut remove_indexes = vec![];
            for (i, section) in bnk.sections.iter_mut().enumerate() {
                let sec_magic_number = u32::from_le_bytes(section.magic);
                if filter.iter().all(|&f| sec_magic_number != f) {
                    // Data: only clear content, keep section header
                    if let SectionPayload::Data { data_list } = &mut section.payload {
                        data_list.clear();
                    } else {
                        remove_indexes.push(i);
                    }
                }
            }

            // remove sections
            for i in remove_indexes.iter().rev() {
                bnk.sections.remove(*i);
            }
        }

        Ok(bnk)
    })
}

#[tauri::command]
pub fn bnk_save_file(
    path: &str,
    mut bnk: re_sound::bnk::Bnk,
    data_dir: Option<&str>,
) -> Result<(), String> {
    map_result(|| {
        // load override sound data
        if let Some(data_dir) = data_dir {
            let dir_path = Path::new(data_dir);
            if !dir_path.is_dir() {
                eyre::bail!(
                    "Override data path not found or not a directory: {}",
                    data_dir
                );
            }

            // 收集所有 wem 文件
            let mut wem_files = vec![];
            for entry in fs::read_dir(dir_path)? {
                let entry = entry?;
                let path = entry.path();
                if !path.is_file() || path.extension().unwrap_or_default() != "wem" {
                    continue;
                }
                wem_files.push(path);
            }

            // 更新 bnk 数据
            update_bnk_data(&mut bnk, &wem_files)?;
            log::info!("Bnk data updated.")
        }

        let file = File::create(path)?;
        let mut writer = std::io::BufWriter::new(file);
        bnk.write_to(&mut writer)?;

        Ok(())
    })
}

/// Extract all Wem data from specified Bnk file to target_path.
#[tauri::command]
pub fn bnk_extract_data(path: &str, target_path: &str) -> Result<(), String> {
    map_result(|| {
        let file = std::fs::File::open(path)?;
        let mut reader = std::io::BufReader::new(file);
        let bnk = re_sound::bnk::Bnk::from_reader(&mut reader)?;

        let target_path = Path::new(target_path);
        if !target_path.exists() {
            std::fs::create_dir_all(target_path)?;
        }

        // get all data
        let mut wem_ids = vec![];
        let mut data = None;
        for section in bnk.sections.iter() {
            match &section.payload {
                SectionPayload::Didx { entries } => {
                    wem_ids.extend(entries.iter().map(|e| e.id));
                }
                SectionPayload::Data { data_list } => data = Some(data_list),
                _ => {}
            }
        }
        let Some(data) = data else {
            eyre::bail!("No data found in Bnk file. This Bnk may not contain actual sound data.");
        };
        if wem_ids.len() != data.len() {
            eyre::bail!("Number of Wem IDs and data entries do not match.");
        }

        // save all data
        for (id, data) in wem_ids.iter().zip(data.iter()) {
            let file_path = target_path.join(format!("{}.wem", id));
            let mut file = File::create(&file_path)?;
            file.write_all(data)?;
        }

        Ok(())
    })
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PckBasicData {
    header: re_sound::pck::PckHeader,
    has_data: bool,
}

#[tauri::command]
pub fn pck_load_basic_data(path: &str) -> Result<PckBasicData, String> {
    map_result(|| {
        let mut pck = re_sound::pck::Pck::from_file(path)?;
        let has_data = pck.has_data();

        Ok(PckBasicData {
            header: pck.header().clone(),
            has_data,
        })
    })
}

#[tauri::command]
pub fn pck_extract_data(path: &str, target_path: &str) -> Result<(), String> {
    map_result(|| {
        let target_path = Path::new(target_path);
        let mut pck = re_sound::pck::Pck::from_file(path)?;

        let target_path = Path::new(target_path);
        if !target_path.exists() {
            std::fs::create_dir_all(target_path)?;
        }

        for i in 0..pck.header().wem_entries.len() {
            let entry = &pck.header().wem_entries[i];
            let file_name = format!("{}.wem", entry.id);
            let file_path = target_path.join(file_name);
            let mut file = File::create(&file_path)
                .context("Failed to create wem output file")
                .context(format!("Path: {}", file_path.display()))?;

            let mut wem_reader = pck.wem_reader(i).unwrap();
            io::copy(&mut wem_reader, &mut file).context("Failed to write wem data to file")?;
        }

        Ok(())
    })
}

#[tauri::command]
pub fn pck_save_file(
    mut header: re_sound::pck::PckHeader,
    output_path: &str,
    data_path: Option<&str>,
) -> Result<(), String> {
    let result = map_result(|| {
        // If data_path is provided, use it to update header.
        let mut wem_metadata_map = IndexMap::new();
        if let Some(data_path) = data_path {
            let data_path = Path::new(data_path);
            if !data_path.exists() {
                eyre::bail!("Source Wem dir provided but not found.");
            }

            // collect wem files
            struct WemMetadata {
                id: u32,
                file_size: u32,
                file_path: Option<String>,
                data: Option<Vec<u8>>,
            }
            for entry in fs::read_dir(data_path)? {
                let entry = entry?;
                let path = entry.path();
                if !path.is_file() || path.extension().unwrap_or_default() != "wem" {
                    continue;
                }

                // 解析wem文件名
                let file_stem = path.file_stem().unwrap().to_string_lossy();
                let id: u32 = file_stem.parse()?;
                wem_metadata_map.insert(
                    id,
                    WemMetadata {
                        id,
                        file_size: path.metadata()?.len() as u32,
                        file_path: Some(path.to_string_lossy().to_string()),
                        data: None,
                    },
                );
            }

            // update header with new wem entries
            let mut offset = header.get_wem_offset_start();
            for entry in header.wem_entries.iter_mut() {
                let metadata = wem_metadata_map.get(&entry.id).ok_or_else(|| {
                    eyre::eyre!("Wem id not found in source wem dir: {}", entry.id)
                })?;
                entry.offset = offset;
                entry.length = metadata.file_size;
                offset += metadata.file_size;
            }
        }

        let file = File::create(output_path)?;
        let mut writer = io::BufWriter::new(file);
        // write header
        header.write_to(&mut writer)?;

        // write wem data
        if data_path.is_some() {
            for metadata in wem_metadata_map.values() {
                if let Some(data) = &metadata.data {
                    writer.write_all(data)?;
                } else if let Some(file_path) = &metadata.file_path {
                    let mut input_file = File::open(file_path)?;
                    io::copy(&mut input_file, &mut writer)?;
                } else {
                    // No data, skip
                    log::info!("No data for wem file: {}", metadata.id);
                }
            }
        }

        Ok(())
    });
    if result.is_err() {
        // clean up if failed
        std::fs::remove_file(output_path).ok();
    }

    result
}

#[tauri::command]
pub fn get_exe_path() -> Result<String, String> {
    map_result(|| {
        let path = std::env::current_exe()?;
        Ok(path.to_str().unwrap().to_string())
    })
}

#[tauri::command]
pub fn env_get_var(name: &str) -> Option<String> {
    std::env::var(name).ok()
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranscodePaths {
    pub ffmpeg: Option<String>,
    pub wwise_console: Option<String>,
    pub vgmstream: Option<String>,
}

#[tauri::command]
pub fn transcode_set_paths(
    service: State<TranscodeService>,
    paths: TranscodePaths,
) -> Result<(), String> {
    if let Some(path) = paths.ffmpeg {
        service.set_ffmpeg_path(path);
    }
    if let Some(path) = paths.wwise_console {
        service.set_wwise_path(path);
    }
    if let Some(path) = paths.vgmstream {
        service.set_vgmstream_path(&path);
    }

    Ok(())
}

#[tauri::command]
pub fn transcode_auto_detect_paths(
    _service: State<TranscodeService>,
) -> Result<TranscodePaths, String> {
    Err("Not implemented yet".to_string())
}

/// Check shell path settings can work.
/// Returns: Some(path) if it works, None if it fails or not set.
#[tauri::command]
pub fn transcode_check(_service: State<TranscodeService>) -> Result<TranscodePaths, String> {
    Err("Not implemented yet".to_string())
}

#[tauri::command]
pub fn transcode_auto_transcode(
    service: State<TranscodeService>,
    input: &str,
    output: &str,
) -> Result<(), String> {
    map_result(|| service.auto_transcode(input, output))
}

#[tauri::command]
pub async fn loudness_get_info(path: &str) -> Result<LoudnessInfo, String> {
    map_result(|| Ok(loudness::get_loadness_info(path)?))
}

fn update_bnk_data(bnk: &mut re_sound::bnk::Bnk, wem_files: &[PathBuf]) -> eyre::Result<()> {
    // Locate DATA and DIDX sections
    let (data_section, didx_section) =
        bnk.sections
            .iter_mut()
            .fold((None, None), |(data, didx), section| {
                match &mut section.payload {
                    SectionPayload::Data { .. } => (Some(section), didx),
                    SectionPayload::Didx { .. } => (data, Some(section)),
                    _ => (data, didx),
                }
            });

    let (Some(data_section), Some(didx_section)) = (data_section, didx_section) else {
        log::warn!("No DATA or DIDX section found in Bnk file. Ignore update.");
        return Ok(());
    };
    let SectionPayload::Data { data_list } = &mut data_section.payload else {
        unreachable!();
    };
    let SectionPayload::Didx {
        entries: didx_entries,
    } = &mut didx_section.payload
    else {
        unreachable!();
    };

    // 收集所有 wem 文件并按 ID 索引
    let mut wem_files_map = IndexMap::new();
    for path in wem_files {
        let id = path
            .file_stem()
            .unwrap()
            .to_string_lossy()
            .parse::<u32>()
            .map_err(|_| eyre::eyre!("Invalid wem file name: {}", path.display()))?;
        wem_files_map.insert(id, path);
    }

    // 检查是否所有 didx 条目都有对应的 wem 文件
    for entry in didx_entries.iter() {
        if !wem_files_map.contains_key(&entry.id) {
            eyre::bail!("Missing wem file for id {} in override directory", entry.id);
        }
    }

    // 按照 didx 顺序创建有序的文件列表
    let mut wem_files_ordered = Vec::new();
    for entry in didx_entries.iter() {
        wem_files_ordered.push(wem_files_map.get(&entry.id).ok_or_else(|| {
            eyre::eyre!("Missing wem file for id {} in override directory", entry.id)
        })?);
    }

    // 按照 didx 顺序更新数据
    for path in wem_files_ordered {
        let data = fs::read(path)?;
        data_list.push(data);
        // didx section will fixed automatically by re-sound
    }

    Ok(())
}
