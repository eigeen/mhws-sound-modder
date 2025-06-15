use std::path::Path;

use eyre::Context;
use parking_lot::Mutex;

use crate::subprocess::{FFmpegCli, VgmstreamCli, WwiseConsole, WwiseSource};

pub struct TranscodeService {
    ffmpeg: Mutex<FFmpegCli>,
    wwise: Mutex<WwiseConsole>,
    vgmstream: Mutex<VgmstreamCli>,
}

impl TranscodeService {
    pub fn new() -> Self {
        // auto detect subprocess paths
        let mut ffmpeg = FFmpegCli::default();
        match FFmpegCli::auto_detect() {
            Ok(path) => ffmpeg.set_path(path),
            Err(e) => log::error!("{e}\nYou may not able to transcode audio files."),
        }
        let mut wwise = WwiseConsole::default();
        match WwiseConsole::auto_detect() {
            Ok(path) => wwise.set_path(path),
            Err(e) => log::error!("{e}\nYou may not able to transcode audio to Wem."),
        }
        let mut vgmstream = VgmstreamCli::default();
        match VgmstreamCli::auto_detect() {
            Ok(path) => vgmstream.set_path(&path),
            Err(e) => log::error!(
                "{e}\nYou may not able to transcode Wem to audio, and playback audio files."
            ),
        }

        Self {
            ffmpeg: Mutex::new(ffmpeg),
            wwise: Mutex::new(wwise),
            vgmstream: Mutex::new(vgmstream),
        }
    }

    pub fn set_ffmpeg_path(&self, path: impl AsRef<Path>) {
        self.ffmpeg.lock().set_path(path);
    }

    pub fn set_wwise_path(&self, path: impl AsRef<Path>) {
        self.wwise.lock().set_path(path);
    }

    pub fn set_vgmstream_path(&self, path: &str) {
        self.vgmstream.lock().set_path(path);
    }

    pub fn auto_transcode(
        &self,
        input: impl AsRef<Path>,
        output: impl AsRef<Path>,
    ) -> eyre::Result<()> {
        let input = input.as_ref();
        let output = output.as_ref();

        log::info!(
            "converting from '{}' to '{}'",
            input.display(),
            output.display()
        );

        // get file extension
        let input_ext = input
            .extension()
            .ok_or(eyre::eyre!("Input file has no extension"))?
            .to_str()
            .unwrap();
        let output_ext = output
            .extension()
            .ok_or(eyre::eyre!("Output file has no extension"))?
            .to_str()
            .unwrap();
        if input_ext == output_ext {
            return Err(eyre::eyre!("Input and output file extension are the same"));
        }

        match (input_ext, output_ext) {
            ("wem", "wav") => self
                .wem2wav(input, output)
                .context("convering .wem to .wav")?,
            ("wav", "wem") => self
                .wav2wem(input, output)
                .context("convering .wav to .wem")?,
            (_, "wem") => {
                let wav_path = output.with_extension("wav");
                // audio -> .wav
                self.auto_transcode(input, &wav_path)?;
                // .wav -> .wem
                self.auto_transcode(&wav_path, output)?;
            }
            ("wem", _) => {
                let wav_path = output.with_extension("wav");
                // .wem -> .wav
                self.auto_transcode(input, &wav_path)?;
                // .wav -> audio
                self.auto_transcode(&wav_path, output)?;
            }
            (other_i, other_o) => {
                // just ffmpeg magic
                let ffmpeg = self.ffmpeg.lock();
                ffmpeg
                    .simple_transcode(input, output)
                    .context(format!("converting .{} to .{}", other_i, other_o))?;
            }
        }

        Ok(())
    }

    fn wav2wem(&self, input: impl AsRef<Path>, output: impl AsRef<Path>) -> eyre::Result<()> {
        let input = input.as_ref();
        let output = output.as_ref();

        let wwise = self.wwise.lock();
        let project = wwise.acquire_temp_project()?;
        let mut wsource =
            WwiseSource::new(input.parent().unwrap_or(Path::new("")).to_str().unwrap());
        wsource.add_source(input.to_str().unwrap());
        project.convert_external_source(
            &wsource,
            output.parent().unwrap_or(Path::new("")).to_str().unwrap(),
        )?;

        // check output file
        let output_name = output
            .with_extension("wem")
            .file_name()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let expect_output_path = output
            .parent()
            .unwrap_or(Path::new(""))
            .join("Windows")
            .join(output_name);
        if !expect_output_path.exists() {
            return Err(eyre::eyre!(
                "Output file not found in expected path: {}",
                expect_output_path.display()
            ));
        }

        // rename output file
        std::fs::rename(expect_output_path, output)?;

        Ok(())
    }

    fn wem2wav(&self, input: impl AsRef<Path>, output: impl AsRef<Path>) -> eyre::Result<()> {
        let input = input.as_ref();
        let output = output.as_ref();

        let vgmstream = self.vgmstream.lock();
        vgmstream.wem_to_wav(input, output)?;

        Ok(())
    }
}
