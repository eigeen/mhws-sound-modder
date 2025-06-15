import { BnkData } from '@/models/bnk'
import { stringToU32LE } from '@/utils'
import { invoke } from '@tauri-apps/api/core'

export async function bnkLoadFile(
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

export async function getExePath(): Promise<string> {
  return invoke('get_exe_path')
}

export async function envGetVar(name: string): Promise<string | null> {
  return invoke('env_get_var', { name })
}

export class Transcode {
  public static async autoTranscode(
    input: string,
    output: string
  ): Promise<void> {
    return invoke('transcode_auto_transcode', { input, output })
  }
}
