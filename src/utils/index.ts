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
