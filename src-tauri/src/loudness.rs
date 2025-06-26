use std::{fs::File, io};

use bs1770::{ChannelLoudnessMeter, Power, Windows100ms};
use serde::Serialize;

type Result<T> = std::result::Result<T, LoudnessError>;

#[derive(Debug, thiserror::Error)]
pub enum LoudnessError {
    #[error("Failed to open file: {0}")]
    Io(#[from] io::Error),
    #[error("Failed to read wav file: {0}")]
    WavRead(#[from] hound::Error),

    #[error("Unsupported wav format: {0}")]
    UnsupportedWavFormat(String),
}

#[derive(Debug, Serialize)]
pub struct LoudnessInfo {
    #[serde(rename = "peakDB")]
    pub peak_db: f32,
    #[serde(rename = "lufs")]
    pub lufs: Option<f32>,
}

pub fn get_loadness_info(path: &str) -> Result<LoudnessInfo> {
    let file = File::open(path)?;
    let mut reader = hound::WavReader::new(io::BufReader::new(file))?;

    let all_samples = read_to_f32_samples(&mut reader)?;

    // 计算所有声道中的最大峰值
    let peak_db = calculate_peak_db(&all_samples);
    // 计算LUFS
    let lufs = calculate_lufs(&all_samples, reader.spec().sample_rate);

    Ok(LoudnessInfo { peak_db, lufs })
}

/// 计算LUFS
fn calculate_lufs(all_samples: &[Vec<f32>], sample_rate: u32) -> Option<f32> {
    let meters = all_samples
        .iter()
        .map(|channel_samples| {
            let mut meter = ChannelLoudnessMeter::new(sample_rate);
            meter.push(channel_samples.iter().cloned());
            meter
        })
        .collect::<Vec<_>>();

    // 获取所有通道的100ms窗口
    let meters = meters
        .iter()
        .map(|m| m.clone().into_100ms_windows())
        .collect::<Vec<_>>();

    // 根据通道数计算LUFS
    let num_channels = all_samples.len();
    // 确保所有通道的窗口数相同
    let num_windows = meters[0].len();
    for meter in &meters {
        if meter.len() != num_windows {
            return None;
        }
    }

    // 定义通道权重 (根据BS.1770标准)
    let weights: Vec<f32> = match num_channels {
        1 => vec![1.0],
        2 => vec![1.0, 1.0],
        3 => vec![1.0, 1.0, 1.0],
        4 => vec![1.0, 1.0, 1.41, 1.41],
        5 => vec![1.0, 1.0, 1.0, 1.41, 1.41],
        6 => vec![1.0, 1.0, 1.0, 0.0, 1.41, 1.41], // 第4个通道是低频通道，权重为0
        _ => vec![1.0; num_channels],              // 默认所有通道权重为1.0
    };

    // 计算加权总功率
    let mut total_power = vec![Power(0.0); num_windows];
    for (ch_idx, meter) in meters.iter().enumerate() {
        let weight = weights.get(ch_idx).copied().unwrap_or(0.0);
        for (i, power) in meter.inner.iter().enumerate() {
            total_power[i].0 += power.0 * weight;
        }
    }

    // 计算门限平均功率
    bs1770::gated_mean(Windows100ms {
        inner: &total_power,
    })
    .map(|power| power.loudness_lkfs())
}

fn calculate_peak_db(all_samples: &[Vec<f32>]) -> f32 {
    // 找出所有声道中的最大峰值
    let peak_amplitude = all_samples
        .iter()
        .map(|channel| channel.iter().map(|&x| x.abs()).fold(0.0f32, f32::max))
        .fold(0.0f32, f32::max);

    // 将峰值振幅转换为分贝
    if peak_amplitude > 0.0 {
        20.0 * peak_amplitude.log10()
    } else {
        f32::NEG_INFINITY
    }
}

/// 读取wav文件并转换为f32 samples
fn read_to_f32_samples<R>(reader: &mut hound::WavReader<R>) -> Result<Vec<Vec<f32>>>
where
    R: io::Read,
{
    let spec = reader.spec();

    let mut all_samples: Vec<Vec<f32>> = vec![vec![]; spec.channels as usize];
    let mut sample_index = 0;

    // 读取并将所有sample转换为f32
    match spec.sample_format {
        hound::SampleFormat::Float => {
            for sample in reader.samples::<f32>() {
                let channel_idx = sample_index % spec.channels as usize;
                all_samples[channel_idx].push(sample.unwrap_or(0.0));
                sample_index += 1;
            }
        }
        hound::SampleFormat::Int => match spec.bits_per_sample {
            8 => {
                for sample in reader.samples::<i8>() {
                    let channel_idx = sample_index % spec.channels as usize;
                    all_samples[channel_idx].push(sample.unwrap_or(0) as f32 / i8::MAX as f32);
                    sample_index += 1;
                }
            }
            16 => {
                for sample in reader.samples::<i16>() {
                    let channel_idx = sample_index % spec.channels as usize;
                    all_samples[channel_idx].push(sample.unwrap_or(0) as f32 / i16::MAX as f32);
                    sample_index += 1;
                }
            }
            24 | 32 => {
                for sample in reader.samples::<i32>() {
                    let channel_idx = sample_index % spec.channels as usize;
                    all_samples[channel_idx].push(sample.unwrap_or(0) as f32 / i32::MAX as f32);
                    sample_index += 1;
                }
            }
            _ => {
                return Err(LoudnessError::UnsupportedWavFormat(format!(
                    "Unsupported bits per sample: {}",
                    spec.bits_per_sample
                )));
            }
        },
    };

    Ok(all_samples)
}
