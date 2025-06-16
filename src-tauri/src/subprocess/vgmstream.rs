use std::{
    env, io,
    path::{Path, PathBuf},
    process::Command,
};

type Result<T> = std::result::Result<T, VgmstreamError>;

#[derive(Debug, thiserror::Error)]
pub enum VgmstreamError {
    #[error("VgmStream module IO error: {0}")]
    IO(#[from] io::Error),

    #[error("vgmstream-cli executable not found.")]
    CliNotFound,
    #[error("Command failed: {code:?}\n{stdout}\n{stderr}")]
    CommandFailed {
        code: Option<i32>,
        stdout: String,
        stderr: String,
    },
    #[error("Command execution failed: {0}")]
    CommandExecutionFailed(io::Error),
}

impl VgmstreamError {
    fn command_failed(code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> Self {
        VgmstreamError::CommandFailed {
            code,
            stdout: String::from_utf8_lossy(stdout).to_string(),
            stderr: String::from_utf8_lossy(stderr).to_string(),
        }
    }
}

#[derive(Default)]
pub struct VgmstreamCli {
    path: Option<String>,
}

impl VgmstreamCli {
    pub fn set_path(&mut self, path: &str) {
        self.path = Some(path.to_string());
    }

    pub fn wem_to_wav(&self, input: impl AsRef<Path>, output: impl AsRef<Path>) -> Result<()> {
        let input = input.as_ref();
        let output = output.as_ref();

        let Some(program_path) = self.path.as_ref() else {
            return Err(VgmstreamError::CliNotFound);
        };
        let result = Command::new(program_path)
            .args([input.to_str().unwrap(), "-o", output.to_str().unwrap()])
            .output()
            .map_err(VgmstreamError::CommandExecutionFailed)?;

        if !result.status.success() {
            return Err(VgmstreamError::command_failed(
                Some(result.status.code().unwrap()),
                &result.stdout,
                &result.stderr,
            ));
        }

        Ok(())
    }

    pub fn test_cli(path: impl AsRef<Path>) -> bool {
        let path = path.as_ref();
        let result = Command::new(path).args(["-h"]).output();
        let Ok(result) = result else {
            return false;
        };

        result.status.code() == Some(1)
    }

    pub fn auto_detect() -> Result<String> {
        let mut try_paths = vec![];
        let vgmstream_root = "vgmstream-win64";
        // inside exe dir
        let exe_path = env::current_exe()?;
        let exe_dir = exe_path.parent().unwrap();
        try_paths.push(exe_dir.join(vgmstream_root).join("vgmstream-cli"));
        // inside cwd
        let cwd = env::current_dir()?;
        try_paths.push(cwd.join(vgmstream_root).join("vgmstream-cli"));
        // global
        try_paths.push(PathBuf::from("vgmstream-cli"));

        for path in try_paths {
            if Self::test_cli(&path) {
                return Ok(path.to_str().unwrap().to_string());
            };
        }

        Err(VgmstreamError::CliNotFound)
    }
}
