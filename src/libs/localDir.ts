import { getExePath } from '@/api/tauri'
import { getParentPath } from '@/utils/path'
import { join } from '@tauri-apps/api/path'
import { exists, mkdir, remove } from '@tauri-apps/plugin-fs'

const LOCAL_DIR_NAME = '.'

export class LocalDir {
  public static async getRoot(create: boolean = true): Promise<string> {
    const exePath = await getExePath()
    const exeDir = getParentPath(exePath)
    if (!exeDir) {
      throw new Error('Failed to get exe directory')
    }

    const dirPath = await join(exeDir, LOCAL_DIR_NAME)
    if (create && !(await exists(dirPath))) {
      await mkdir(dirPath, { recursive: true })
    }
    return dirPath
  }

  public static async getTempDir(create: boolean = true): Promise<string> {
    const root = await LocalDir.getRoot()
    const dirPath = await join(root, 'temp')
    if (create && !(await exists(dirPath))) {
      await mkdir(dirPath, { recursive: true })
    }
    return dirPath
  }

  public static async clearTempDir(): Promise<void> {
    const tempDir = await LocalDir.getTempDir(false)
    if (tempDir && (await exists(tempDir))) {
      await remove(tempDir, { recursive: true })
    }
  }

  public static async getExeDir(): Promise<string> {
    const exePath = await getExePath()
    const exeDir = getParentPath(exePath)
    if (!exeDir) {
      throw new Error('Failed to get exe directory')
    }
    return exeDir
  }
}
