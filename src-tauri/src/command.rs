use std::{fs::File, io::Write, path::Path};

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
            for (i, section) in bnk.sections.iter().enumerate() {
                let sec_magic_number = u32::from_le_bytes(section.magic);
                if filter.iter().all(|&f| sec_magic_number != f) {
                    remove_indexes.push(i);
                }
            }

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
        let file = std::fs::File::open(path)?;
        let mut reader = std::io::BufReader::new(file);

        Ok(re_sound::pck::PckHeader::from_reader(&mut reader)?)
    })
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
