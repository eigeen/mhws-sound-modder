import { BnkApi } from '@/api/tauri'
import type { BnkData, DidxSection, Section } from '@/models/bnk'
import type {
  HircEntry,
  HircEventEntry,
  HircMusicRanSeqCntrEntry,
  HircMusicSegmentEntry,
  HircMusicTrackEntry,
  HircSoundEntry,
} from '@/models/bnk/hirc'
import { sha256 } from '@/utils'
import { getFileName } from '@/utils/path'
import { reactive, type Reactive, ref, toRef } from 'vue'
import { SourceManager } from '@/libs/source'
import { useWorkspaceStore } from '@/stores/workspace'
import { exists, rename, mkdir, remove, copyFile } from '@tauri-apps/plugin-fs'
import { Transcoder, type TargetFormat } from '@/libs/transcode'
import { LocalDir } from '@/libs/localDir'
import { join } from '@tauri-apps/api/path'

export type ReplaceItem = {
  type: 'audio'
  id: number | string
  uniqueId: string
  path: string
}

export class Bnk {
  public data: BnkData
  public name: string = ''
  public filePath: string = ''
  private _label: string = ''
  private segmentTree: SegmentTree | null = null
  private _managedSources: number[] = []
  private _unmanagedSources: number[] = []
  public overrideMap: Reactive<Record<string, ReplaceItem>> = reactive({})

  constructor(data: BnkData) {
    this.data = data
  }

  public static async load(filePath: string): Promise<Bnk> {
    const bnkData = await BnkApi.loadFile(filePath)
    const bnk = new Bnk(bnkData)
    bnk.filePath = filePath
    bnk.name = getFileName(filePath)
    bnk._label = (await sha256(filePath)).substring(0, 8)
    return bnk
  }

  public hasSection(ty: 'Bkhd' | 'Didx' | 'Hirc' | 'Data'): boolean {
    return this.data.sections.some((section) => section.type === ty)
  }

  public getLabel(): string {
    return this._label
  }

  public visit(visitor: BnkVisitor): void {
    visitor.visitBnk(this)
  }

  /**
   * Create a segment tree reference for the given bnk.
   * Fields are the ref of the root fields.
   */
  public getSegmentTree(): SegmentTree {
    if (!this.segmentTree) {
      this.segmentTree = new SegmentTree(this)
    }

    return this.segmentTree
  }

  public getDidxSection(): DidxSection | null {
    return this.data.sections.find((section) => section.type === 'Didx') ?? null
  }

  public getManagedSources(): number[] {
    if (this._managedSources.length > 0) {
      return this._managedSources
    }

    const visitor = new SourceVisitor()
    this.visit(visitor)
    this._managedSources = visitor.getSources()
    return this._managedSources
  }

  public getUnmanagedSources(): number[] {
    if (this._unmanagedSources.length > 0) {
      return this._unmanagedSources
    }

    const didx = this.getDidxSection()
    if (!didx) return []
    this._unmanagedSources = didx.entries
      .filter((entry) => !this._managedSources.includes(entry.id))
      .map((entry) => entry.id)
    return this._unmanagedSources
  }

  public async extractData(outputDir: string): Promise<void> {
    return BnkApi.extractData(this.filePath, outputDir)
  }

  /**
   * 导出 BNK 文件到指定路径，包含音源替换处理
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
    logger?.debug(`Processing BNK file: ${this.getLabel()}`)

    // 收集需要替换的音源
    const replacedSources = Object.values(this.overrideMap)
    logger?.debug(`Found ${replacedSources.length} audio sources to replace`, {
      replacedSourceIds: replacedSources.map((s) => s.id),
    })

    let tempSourceDir: string | undefined

    // 如果bnk包含数据，则替换音源，否则直接导出
    if (this.hasSection('Data')) {
      logger?.debug(
        'BNK file contains data section, need to process audio source replacement'
      )

      logger?.info(
        `Need to replace ${replacedSources.length} audio sources`,
        {
          replacedSourceIds: replacedSources.map((s) => s.id),
        }
      )

      // 创建临时目录存放替换的音源
      const tempDir = await LocalDir.getTempDir()
      tempSourceDir = await join(tempDir, 'export', this.getLabel())
      if (await exists(tempSourceDir)) {
        await remove(tempSourceDir, { recursive: true })
        logger?.debug('Cleaned up existing temporary directory')
      }
      await mkdir(tempSourceDir, { recursive: true })
      logger?.debug(`Created temporary directory: ${tempSourceDir}`)

      // 先提取所有音源
      logger?.debug('Starting to extract BNK data')
      await this.extractData(tempSourceDir)
      logger?.debug('BNK data extraction completed')

      // 复制替换的音源到临时目录，覆盖已提取的内容
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
      logger?.debug(
        'BNK file does not contain data section, exporting directly'
      )
    }

    // 保存BNK文件
    logger?.debug('Starting to save BNK file')
    await BnkApi.saveFile(exportPath, this.data, tempSourceDir)
    logger?.info(`BNK file saved successfully: ${exportPath}`)
  }

  /**
   * 将指定ID的音频源转码为目标格式
   * @param sourceId 音频源ID
   * @param format 目标格式，例如 'wav'
   * @returns 转码后的文件路径
   */
  public async transcodeSource(sourceId: number, format: TargetFormat): Promise<string> {
    const wemFilePath = await SourceManager.getInstance().getSourceFilePath(sourceId)
    if (!wemFilePath) {
      throw new Error(`Source ID ${sourceId} not found in SourceManager.`)
    }

    const targetPath = wemFilePath.replace('.wem', `.${format}`)
    if (await exists(targetPath)) {
      return targetPath
    }

    // 转码
    const tempPath = await Transcoder.getInstance().transcode(wemFilePath, format)
    await rename(tempPath, targetPath)
    return targetPath
  }

  /**
   * 批量转码音频源
   * @param format 目标格式，例如 'wav'
   * @param sourceIds 要转码的音频源ID列表，如果不提供则转码所有管理的音频源
   * @returns 转码后的文件路径列表
   */
  public async transcodeMultipleSources(
    format: TargetFormat,
    sourceIds?: number[]
  ): Promise<string[]> {
    const ids = sourceIds || this.getManagedSources()
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
}

export type HircNode = MusicSegmentNode | MusicTrackNode

/**
 * Music segment tree
 */
export class SegmentTree {
  public nodes: MusicSegmentNode[] = []

  constructor(bnk: Bnk) {
    const visitor = new MusicSegmentVisitor(bnk.getLabel())
    bnk.visit(visitor)
    this.nodes = visitor.musicSegments
  }
}

export interface MusicSegmentNode {
  type: 'MusicSegment'
  id: number
  duration: Reactive<number>
  fade_in_end: Reactive<number>
  fade_out_start: Reactive<number>
  children: MusicTrackNode[]
}

export interface MusicTrackNode {
  type: 'MusicTrack'
  id: number
  playlist: PlayListItem[]
}

export interface PlayListItem {
  type: 'PlayListItem'
  elementType: 'Track' | 'Source' | 'Event'
  /**
   * An unique ID, avoid duplicate
   * BnkLabel-TrackID-Index-ElementID
   */
  id: string
  /**
   * When type is 'Source' or 'Event', it's the element id.
   * When type is 'Track', it's the track node id
   */
  element_id: number
  // available when type is 'Track'
  element?: MusicTrackNode
  playAt: Reactive<number>
  beginTrimOffset: Reactive<number>
  endTrimOffset: Reactive<number>
  srcDuration: Reactive<number>
}

export type MarkerType = 'EndFadeIn' | 'StartFadeOut'

const MARKER_TYPE_MAP: { [id: number]: MarkerType } = {
  43573010: 'EndFadeIn',
  1539036744: 'StartFadeOut',
}

export class BnkVisitor {
  public visitBnk(bnk: Bnk): void {
    bnk.data.sections.forEach((section) => {
      this.visitSection(section)
    })
  }

  public visitSection(section: Section): void {
    if (section.type === 'Hirc') {
      section.entries.forEach((entry, idx) => {
        try {
          this.visitHircEntry(entry)
        } catch (e) {
          throw new Error(`Error while visiting HIRC entry ${idx}: ${e}`)
        }
      })
    }
  }

  public visitHircEntry(entry: HircEntry): void {
    switch (entry.entry_type) {
      case 'Sound':
        this.visitHircSound(entry)
        break
      case 'Event':
        this.visitHircEvent(entry)
        break
      case 'MusicSegment':
        this.visitHircMusicSegment(entry)
        break
      case 'MusicTrack':
        this.visitHircMusicTrack(entry)
        break
      case 'MusicRanSeqCntr':
        this.visitHircMusicRanSeqCntr(entry)
        break
      default:
        break
    }
  }
  // prettier-ignore
  // @ts-ignore
  visitHircSound(entry: HircSoundEntry) {}
  // prettier-ignore
  // @ts-ignore
  visitHircEvent(entry: HircEventEntry) {}
  // prettier-ignore
  // @ts-ignore
  visitHircMusicSegment(entry: HircMusicSegmentEntry) {}
  // prettier-ignore
  // @ts-ignore
  visitHircMusicTrack(entry: HircMusicTrackEntry) {}
  // prettier-ignore
  // @ts-ignore
  visitHircMusicRanSeqCntr(entry: HircMusicRanSeqCntrEntry) {}
}

class MusicSegmentVisitor extends BnkVisitor {
  public musicSegments: MusicSegmentNode[] = []
  private musicTracks: { [id: number]: MusicTrackNode } = {}
  private _bnkLabel: string

  constructor(bnkLabel: string) {
    super()
    this._bnkLabel = bnkLabel
  }

  public override visitHircMusicTrack(entry: HircMusicTrackEntry): void {
    const data = entry.music_track_initial_values

    const node: MusicTrackNode = {
      type: 'MusicTrack',
      id: entry.id,
      playlist: [],
    }
    const playlist = data.playlist
      .map((item, index) => {
        if (item.event_id !== 0) {
          return reactive({
            type: 'PlayListItem',
            elementType: 'Event',
            id: `${this._bnkLabel}-${entry.id}-${index}-${item.event_id}`,
            element_id: item.event_id,
            element: null,
            playAt: toRef(item, 'play_at'),
            beginTrimOffset: toRef(item, 'begin_trim_offset'),
            endTrimOffset: toRef(item, 'end_trim_offset'),
            srcDuration: toRef(item, 'src_duration'),
          })
        } else if (item.source_id !== 0) {
          return reactive({
            type: 'PlayListItem',
            elementType: 'Source',
            id: `${this._bnkLabel}-${entry.id}-${index}-${item.source_id}`, // BnkLabel-TrackID-Index-ElementID
            element_id: item.source_id,
            element: null,
            playAt: toRef(item, 'play_at'),
            beginTrimOffset: toRef(item, 'begin_trim_offset'),
            endTrimOffset: toRef(item, 'end_trim_offset'),
            srcDuration: toRef(item, 'src_duration'),
          })
        } else if (item.track_id !== 0) {
          const track = this.musicTracks[item.track_id]
          if (track) {
            return reactive({
              type: 'PlayListItem',
              elementType: 'Track',
              id: `${this._bnkLabel}-${entry.id}-${index}-${item.track_id}`,
              element_id: item.track_id,
              element: track,
              playAt: toRef(item, 'play_at'),
              beginTrimOffset: toRef(item, 'begin_trim_offset'),
              endTrimOffset: toRef(item, 'end_trim_offset'),
              srcDuration: toRef(item, 'src_duration'),
            })
          } else {
            console.warn(`Track ${item.track_id} not found in music tracks`)
          }
        } else {
          console.warn(`Invalid track item ${item}`)
          return null
        }
      })
      .filter((item) => item !== null) as PlayListItem[]

    node.playlist = playlist
    this.musicTracks[entry.id] = node
  }

  public override visitHircMusicSegment(entry: HircMusicSegmentEntry) {
    const data = entry.music_segment_initial_values

    // get markers
    let fade_in_end = ref(0)
    let fade_out_start = ref(0)
    data.markers.forEach((marker) => {
      const ty = MARKER_TYPE_MAP[marker.id]
      if (ty === 'EndFadeIn') {
        fade_in_end = toRef(marker, 'position')
      } else if (ty === 'StartFadeOut') {
        fade_out_start = toRef(marker, 'position')
      }
    })

    const node: MusicSegmentNode = reactive({
      type: 'MusicSegment',
      id: entry.id,
      duration: toRef(data, 'duration'),
      fade_in_end,
      fade_out_start,
      children: [],
    })

    if (data.music_node_params.children.children.length > 0) {
      // Load track children
      const children = data.music_node_params.children.children
        .map((childId) => {
          const track = this.musicTracks[childId]
          if (track) {
            return track
          } else {
            console.warn(`Track ${childId} not found in music tracks`)
            return null
          }
        })
        .filter((item) => item !== null) as MusicTrackNode[]

      node.children = children
    }

    this.musicSegments.push(node)
  }
}

class SourceVisitor extends BnkVisitor {
  private sources: number[] = []

  public getSources(): number[] {
    // remove duplicate
    const uniqueSources = [...new Set(this.sources)]
    uniqueSources.sort()
    return uniqueSources
  }

  public override visitHircMusicTrack(entry: HircMusicTrackEntry): void {
    const data = entry.music_track_initial_values
    data.playlist.forEach((item) => {
      if (item.source_id !== 0) {
        this.sources.push(item.source_id)
      }
    })
  }
}
