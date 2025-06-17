use std::{
    fs::{self, File},
    io::{self, Write},
    path::Path,
};

use eyre::Context;
use indexmap::IndexMap;
use re_sound::bnk::SectionPayload;
use serde::{Deserialize, Serialize};
use tauri::State;

use crate::service::TranscodeService;

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
pub fn bnk_save_file(path: &str, mut bnk: re_sound::bnk::Bnk) -> Result<(), String> {
    map_result(|| {
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
            eyre::bail!("No data found in Bnk file. This Bnk may not contains actual sound data.");
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

#[tauri::command]
pub fn pck_load_header(path: &str) -> Result<re_sound::pck::PckHeader, String> {
    map_result(|| {
        let file = File::open(path)?;
        let mut reader = io::BufReader::new(file);

        Ok(re_sound::pck::PckHeader::from_reader(&mut reader)?)
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
    src_wem_path: &str,
    dst_path: &str,
) -> Result<(), String> {
    let result = map_result(|| {
        let src_wem_path = Path::new(src_wem_path);
        if !src_wem_path.exists() {
            eyre::bail!("Source Wem dir not found.");
        }

        // collect wem files
        struct WemMetadata {
            id: u32,
            file_size: u32,
            file_path: Option<String>,
            data: Option<Vec<u8>>,
        }
        let mut wem_metadata_map = IndexMap::new();
        for entry in fs::read_dir(src_wem_path)? {
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
            let metadata = wem_metadata_map.get(&entry.id).unwrap();
            entry.offset = offset;
            entry.length = metadata.file_size;
            offset += metadata.file_size;
        }

        let file = File::create(dst_path)?;
        let mut writer = io::BufWriter::new(file);
        // write header
        header.write_to(&mut writer)?;

        // write wem data
        for metadata in wem_metadata_map.values() {
            if let Some(data) = &metadata.data {
                writer.write_all(data)?;
            } else if let Some(file_path) = &metadata.file_path {
                let mut input_file = File::open(file_path)?;
                io::copy(&mut input_file, &mut writer)?;
            } else {
                eyre::bail!(
                    "Internal: both data and file_path are None for Wem file: {}",
                    metadata.id
                );
            }
        }

        Ok(())
    });
    if result.is_err() {
        // clean up if failed
        std::fs::remove_file(dst_path).ok();
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
