import { PckApi } from '@/api/tauri'
import type { PckHeader } from '@/models/pck'
import { getFileName } from '@/utils/path'
import { sha256 } from '@/utils'
import { SourceManager } from '@/libs/source'
import { exists, rename } from '@tauri-apps/plugin-fs'
import { Transcoder, type TargetFormat } from '@/libs/transcode'

export class Pck {
  public header: PckHeader
  public name: string = ''
  public filePath: string = ''
  private _hasData: boolean
  private _label: string = ''

  constructor(header: PckHeader, hasData: boolean) {
    this.header = header
    this._hasData = hasData
  }

  public static async load(filePath: string): Promise<Pck> {
    const { header, hasData } = await PckApi.loadBasicData(filePath)
    const pck = new Pck(header, hasData)
    pck.filePath = filePath
    pck.name = getFileName(filePath)
    pck._label = (await sha256(filePath)).substring(0, 8)
    return pck
  }

  public hasData(): boolean {
    return this._hasData
  }

  public getLabel(): string {
    return this._label
  }

  public async extractData(outputDir: string): Promise<void> {
    return PckApi.extractData(this.filePath, outputDir)
  }

  /**
   * 将指定ID的音频源转码为目标格式
   * @param sourceId 音频源ID
   * @param format 目标格式，例如 'wav'
   * @returns 转码后的文件路径
   */
  public async transcodeSource(
    sourceId: number,
    format: TargetFormat
  ): Promise<string> {
    const wemFilePath =
      await SourceManager.getInstance().getSourceFilePath(sourceId)
    if (!wemFilePath) {
      throw new Error(`Source ID ${sourceId} not found in SourceManager.`)
    }

    const targetPath = wemFilePath.replace('.wem', `.${format}`)
    if (await exists(targetPath)) {
      return targetPath
    }

    // 转码
    const tempPath = await Transcoder.getInstance().transcode(
      wemFilePath,
      format
    )
    await rename(tempPath, targetPath)
    return targetPath
  }

  /**
   * 批量转码音频源
   * @param format 目标格式，例如 'wav'
   * @param sourceIds 要转码的音频源ID列表，如果不提供则转码所有音频源
   * @returns 转码后的文件路径列表
   */
  public async transcodeMultipleSources(
    format: TargetFormat,
    sourceIds?: number[]
  ): Promise<string[]> {
    const ids = sourceIds || this.header.wem_entries.map((entry) => entry.id)
    const results: string[] = []

    for (const id of ids) {
      try {
        const path = await this.transcodeSource(id, format)
        results.push(path)
      } catch (err) {
        console.error(`Failed to transcode source ${id}: ${err}`)
      }
    }

    return results
  }

  // public async saveFile(outputPath: string): Promise<void> {
  //   if (!this.extractDataDir) {
  //     await this.extractData()
  //   }
  //   return PckApi.saveFile(this.header, this.extractDataDir!, outputPath)
  // }
}
