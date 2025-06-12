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
    console.log('filter', sectionFilter)
  }

  return invoke('bnk_load_file', { path, sectionFilter })
}
