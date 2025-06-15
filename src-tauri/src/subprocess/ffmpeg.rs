use std::{
    env, io,
    path::{Path, PathBuf},
    process::Command,
};

type Result<T> = std::result::Result<T, FFmpegError>;

#[derive(Debug, thiserror::Error)]
pub enum FFmpegError {
    #[error("Wwise module IO error: {0}")]
    IO(#[from] std::io::Error),

    #[error("ffmpeg executable not found.")]
    FFmpegNotFound,
    #[error("Command failed: {code:?}\n{stdout}\n{stderr}")]
    CommandFailed {
        code: Option<i32>,
        stdout: String,
        stderr: String,
    },
    #[error("Command execution failed: {0}")]
    CommandExecutionFailed(io::Error),
}

impl FFmpegError {
    fn command_failed(code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Self {
        FFmpegError::CommandFailed {
            code,
            stdout: String::from_utf8_lossy(stdout).to_string(),
            stderr: String::from_utf8_lossy(stderr).to_string(),
        }
    }
}

#[derive(Default)]
pub struct FFmpegCli {
    path: Option<PathBuf>,
}

impl FFmpegCli {
    pub fn set_path(&mut self, path: impl AsRef<Path>) {
        self.path = Some(path.as_ref().to_path_buf());
    }

    /// Simple transcode, only provide input and output file path.
    pub fn simple_transcode(
        &self,
        input: impl AsRef<Path>,
        output: impl AsRef<Path>,
    ) -> Result<()> {
        let input = input.as_ref();
        let output = output.as_ref();

        let Some(program_path) = self.path.as_ref() else {
            return Err(FFmpegError::FFmpegNotFound);
        };
        let result = Command::new(program_path)
            .args([
                "-hide_banner",
                "-loglevel",
                "warning",
                "-i",
                input.to_str().unwrap(),
                "-y",
                output.to_str().unwrap(),
            ])
            .output()
            .map_err(FFmpegError::CommandExecutionFailed)?;

        if !result.status.success() {
            return Err(FFmpegError::command_failed(
                Some(result.status.code().unwrap()),
                &result.stdout,
                &result.stderr,
            ));
        }

        Ok(())
    }

    /// Test if the ffmpeg can be executed.
    pub fn test_ffmpeg_cli(path: impl AsRef<Path>) -> bool {
        let path = path.as_ref();
        let result = Command::new(path).args(["-version"]).output();
        let Ok(result) = result else {
            return false;
        };

        result.status.success()
    }

    pub fn auto_detect() -> Result<String> {
        let mut try_paths = vec![];
        // env
        if let Ok(path) = env::var("FFMPEG_PATH") {
            try_paths.push(PathBuf::from(path));
        }
        // inside exe dir
        let exe_path = env::current_exe()?;
        let exe_dir = exe_path.parent().unwrap();
        try_paths.push(exe_dir.join("ffmpeg"));
        // inside cwd
        let cwd = env::current_dir()?;
        try_paths.push(cwd.join("ffmpeg"));
        // global
        try_paths.push(PathBuf::from("ffmpeg"));

        for path in try_paths {
            if Self::test_ffmpeg_cli(&path) {
                return Ok(path.to_str().unwrap().to_string());
            };
        }

        Err(FFmpegError::FFmpegNotFound)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ffmpeg_auto_detect() {
        let result = FFmpegCli::auto_detect();
        eprintln!("result: {:?}", result);
    }
}
