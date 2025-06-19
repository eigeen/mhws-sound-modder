import type { HircEntry } from './hirc'

export interface BnkData {
  sections: Section[]
}

export type Section =
  | BkhdSection
  | DidxSection
  | HircSection
  | DataSection
  | UnkSection

export interface BaseSection {
  magic: number[] // 4-character code like "BKHD", "DIDX", etc.
  section_length: number
}

export interface BkhdSection extends BaseSection {
  type: 'Bkhd'
  version: number
  id: number
  unknown: number[]
}

export interface DidxSection extends BaseSection {
  type: 'Didx'
  entries: DidxEntry[]
}

export interface HircSection extends BaseSection {
  type: 'Hirc'
  entries: HircEntry[]
}

export interface DataSection extends BaseSection {
  type: 'Data'
  data_list: number[][]
}

export interface UnkSection extends BaseSection {
  type: 'Unk'
  data: number[]
}

export interface DidxEntry {
  id: number
  offset: number
  length: number
}
