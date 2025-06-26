import type { BnkData } from '@/models/bnk'
import type { PckHeader } from '@/models/pck'
import { stringToU32LE } from '@/utils'
import { invoke } from '@tauri-apps/api/core'

export interface PckBasicData {
  header: PckHeader
  hasData: boolean
}

export interface LoudnessInfo {
  peakDB: number
  lufs?: number
}

export class BnkApi {
  public static async loadFile(
    path: string,
    sectionFilter?: number[]
  ): Promise<BnkData> {
    if (!sectionFilter) {
      sectionFilter = [
        stringToU32LE('BKHD'),
        stringToU32LE('DIDX'),
        stringToU32LE('HIRC'),
      ]
    }

    return invoke('bnk_load_file', { path, sectionFilter })
  }

  public static async extractData(
    path: string,
    targetPath: string
  ): Promise<void> {
    return invoke('bnk_extract_data', { path, targetPath })
  }

  public static async saveFile(
    path: string,
    bnk: BnkData,
    dataDir?: string
  ): Promise<void> {
    return invoke('bnk_save_file', { path, bnk, dataDir })
  }
}

export class PckApi {
  public static async loadBasicData(path: string): Promise<PckBasicData> {
    return invoke('pck_load_basic_data', { path })
  }

  public static async extractData(
    path: string,
    targetPath: string
  ): Promise<void> {
    return invoke('pck_extract_data', { path, targetPath })
  }

  public static async saveFile(
    header: PckHeader,
    outputPath: string,
    dataPath?: string
  ): Promise<void> {
    return invoke('pck_save_file', { header, outputPath, dataPath })
  }
}

export async function getExePath(): Promise<string> {
  return invoke('get_exe_path')
}

export async function envGetVar(name: string): Promise<string | null> {
  return invoke('env_get_var', { name })
}

export async function getLoudnessInfo(path: string): Promise<LoudnessInfo> {
  return invoke('loudness_get_info', { path })
}

export class Transcode {
  public static async autoTranscode(
    input: string,
    output: string
  ): Promise<void> {
    return invoke('transcode_auto_transcode', { input, output })
  }
}
