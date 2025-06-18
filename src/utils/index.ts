import { open } from '@tauri-apps/plugin-fs'

export function stringToU32LE(str: string): number {
  if (str.length !== 4) {
    throw new Error('Input string must be exactly 4 characters')
  }

  const buffer = new ArrayBuffer(4)
  const view = new DataView(buffer)

  // 按小端序写入字节（字符串第一个字符在最低地址）
  for (let i = 0; i < 4; i++) {
    view.setUint8(i, str.charCodeAt(i))
  }

  // 以小端序读取为 u32 数字
  return view.getUint32(0, true)
}

export async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)

  const hashBuffer = await crypto.subtle.digest('SHA-256', data)

  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')

  return hashHex
}

export async function readFileMagic(path: string): Promise<number[]> {
  const file = await open(path, { read: true })
  try {
    const buffer = new Uint8Array(4)
    const readSize = await file.read(buffer)
    if (readSize !== 4) {
      throw new Error('Failed to read magic number: failed to fill buffer.')
    }
    return Array.from(buffer)
  } catch (err) {
    file.close()
    throw err
  }
}

export function arrayCompare<T>(arr1: T[], arr2: T[]) {
  if (arr1.length !== arr2.length) {
    return false
  }
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) {
      return false
    }
  }
  return true
}
