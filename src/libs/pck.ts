import { PckApi } from '@/api/tauri'
import { PckHeader } from '@/models/pck'
import { LocalDir } from './localDir'
import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

export class Pck {
  public header: PckHeader
  public name: string = ''
  public filePath: string = ''
  public extractDataDir: string | null = null

  constructor(header: PckHeader) {
    this.header = header
  }

  public async extractData(rootDir?: string): Promise<void> {
    if (this.extractDataDir) return
    // get output dir
    let outputRoot = rootDir || (await LocalDir.getTempDir())
    let outputDir = await join(outputRoot, this.name)
    if (await exists(outputDir)) {
      let i = 1
      while (true) {
        outputDir = `${this.name}-${i}`
        if (!(await exists(outputDir))) {
          break
        }
      }
    }
    // do extraction
    await PckApi.extractData(this.filePath, outputDir)
    this.extractDataDir = outputDir
  }

  public async saveFile(outputPath: string): Promise<void> {
    if (!this.extractDataDir) {
      await this.extractData()
    }
    return PckApi.saveFile(this.header, this.extractDataDir!, outputPath)
  }
}
