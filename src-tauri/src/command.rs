fn map_result<F, V>(f: F) -> std::result::Result<V, String>
where
    F: FnOnce() -> std::result::Result<V, eyre::Error>,
{
    f().map_err(|e| e.to_string())
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
