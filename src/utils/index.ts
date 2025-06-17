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
