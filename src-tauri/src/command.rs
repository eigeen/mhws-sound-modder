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
        let file = std::fs::File::open(path)?;
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
        let file = std::fs::File::create(path)?;
        let mut writer = std::io::BufWriter::new(file);
        bnk.write_to(&mut writer)?;

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
