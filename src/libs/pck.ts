import { PckApi } from '@/api/tauri'
import type { PckHeader } from '@/models/pck'
import { getExtension, getFileName } from '@/utils/path'
import { sha256 } from '@/utils'
import { SourceManager } from '@/libs/source'
import { exists, rename, mkdir, remove, copyFile } from '@tauri-apps/plugin-fs'
import { Transcoder, type TargetFormat } from '@/libs/transcode'
import { reactive, type Reactive } from 'vue'
import type { OverrideSource } from '@/libs/bnk'
import { LocalDir } from '@/libs/localDir'
import { join } from '@tauri-apps/api/path'
import { v4 as uuidv4 } from 'uuid'
import { useWorkspaceStore } from '@/stores/workspace'

export class Pck {
  public header: PckHeader
  public name: string = ''
  public filePath: string = ''
  public overrideMap: Reactive<Record<number, OverrideSource>> = reactive({})
  private _hasData: boolean
  private _label: string = ''
  private workspace = useWorkspaceStore()

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
   * 导出 PCK 文件到指定路径，包含音源替换处理
   * @param exportPath 导出文件路径
   * @param logger 可选的日志记录器
   */
  public async exportFile(
    exportPath: string,
    logger?: {
      debug: (message: string, data?: any) => void
      info: (message: string, data?: any) => void
    }
  ): Promise<void> {
    logger?.debug(`Processing PCK file: ${this.getLabel()}`)

    // 收集需要替换的音源
    const replacedSources = Object.values(this.overrideMap)
    logger?.debug(`Found ${replacedSources.length} audio sources to replace`, {
      replacedSourceIds: replacedSources.map((s) => s.id),
    })

    let tempSourceDir: string | undefined

    // 如果PCK包含数据，则替换音源，否则直接导出
    if (this.hasData()) {
      logger?.debug(
        'PCK file contains data, need to process audio source replacement'
      )

      logger?.info(`Need to replace ${replacedSources.length} audio sources`, {
        replacedSourceIds: replacedSources.map((s) => s.id),
      })

      // 创建临时目录存放替换的音源
      const tempDir = await LocalDir.getTempDir()
      tempSourceDir = await join(tempDir, 'export', this.getLabel())
      if (await exists(tempSourceDir)) {
        await remove(tempSourceDir, { recursive: true })
        logger?.debug('Cleaned up existing temporary directory')
      }
      await mkdir(tempSourceDir, { recursive: true })
      logger?.debug(`Created temporary directory: ${tempSourceDir}`)

      // 先提取PCK内容
      logger?.debug('Starting to extract PCK data')
      await this.extractData(tempSourceDir)
      logger?.debug('PCK data extraction completed')

      // 复制替换的音源到临时目录,覆盖已提取的内容
      for (const source of replacedSources) {
        const sourcePath = source.path
        const targetPath = await join(tempSourceDir, `${source.id}.wem`)
        await copyFile(sourcePath, targetPath)
        logger?.debug(`Replaced audio source: ${source.id}.wem`, {
          sourcePath,
          targetPath,
        })
      }
    } else {
      logger?.debug('PCK file does not contain data, exporting directly')
    }

    // 保存PCK文件
    logger?.debug('Starting to save PCK file')
    await PckApi.saveFile(this.header, exportPath, tempSourceDir)
    logger?.info(`PCK file saved successfully: ${exportPath}`)
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

  /**
   * Add override audio.
   * Can only override existing audio. Adding is not allowed.
   */
  public async addOverrideAudio(id: number, filePath: string): Promise<void> {
    // check if id exists
    if (!this.header.wem_entries.some((entry) => entry.id === id)) {
      throw new Error(`Audio ID ${id} not found in this PCK file`)
    }

    const ext = getExtension(filePath)

    // transcode and store to temp dir
    let storePath = null
    if (ext !== 'wem') {
      // transcode to wem
      storePath = await Transcoder.getInstance().transcode(filePath, 'wem')
    } else {
      // copy
      const randomId = uuidv4()
      storePath = await join(await LocalDir.getTempDir(), `${randomId}.${ext}`)
      await copyFile(filePath, storePath)
    }

    // add to overrideMap
    this.overrideMap[id] = {
      id,
      path: storePath,
    }
  }

  /**
   * Remove override audio
   */
  public async removeOverrideAudio(id: number): Promise<void> {
    const overrideSource = this.overrideMap[id]
    if (overrideSource) {
      // 尝试删除临时文件
      try {
        if (await exists(overrideSource.path)) {
          await remove(overrideSource.path)
          console.debug(`Removed temporary file: ${overrideSource.path}`)
        }
      } catch (err) {
        console.warn(
          `Failed to remove temporary file ${overrideSource.path}: ${err}`
        )
      }

      // remove on flatten map
      const uniqueId = `${this.getLabel()}-${id}`
      const flattenNodeMap = this.workspace.flattenNodeMap
      if (flattenNodeMap[uniqueId]) {
        delete flattenNodeMap[uniqueId]
      }

      // remove on source manager
      SourceManager.getInstance().removeSource(id, this.filePath)
    }

    delete this.overrideMap[id]
  }
}
