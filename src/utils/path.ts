export function getParentPath(path: string): string | null {
  // '/' or '\'
  const lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  if (lastSlashIndex === -1) {
    return null
  }
  return path.substring(0, lastSlashIndex)
}

export function getFileName(path: string): string {
  let lastSlashIndex = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'))
  return path.substring(lastSlashIndex + 1)
}

export function getFileStem(path: string): string {
  const fileName = getFileName(path)
  const firstDotIndex = fileName.indexOf('.')
  if (firstDotIndex === -1) {
    return fileName
  }
  return fileName.substring(0, firstDotIndex)
}

export function getFullExtension(path: string): string | null {
  const fileName = getFileName(path)
  const firstDotIndex = fileName.indexOf('.')
  if (firstDotIndex === -1) {
    return null
  }
  return fileName.substring(firstDotIndex + 1)
}

export function getExtension(path: string): string | null {
  const fileName = getFileName(path)
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return null
  }
  return fileName.substring(lastDotIndex + 1)
}
