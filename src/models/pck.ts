export interface PckHeader {
  header_length: number
  unk2: number
  string_table: PckString[]
  bnk_table_data: number[]
  wem_entries: PckWemEntry[]
  unk_struct_data: number[]
}

export interface PckString {
  index: number
  value: string
}

export interface PckWemEntry {
  id: number
  one: number
  length: number
  offset: number
  language_id: number
}
