import { BnkApi } from '@/api/tauri'
import { BnkData, DidxSection, Section } from '@/models/bnk'
import {
  HircEntry,
  HircEventEntry,
  HircMusicRanSeqCntrEntry,
  HircMusicSegmentEntry,
  HircMusicTrackEntry,
  HircSoundEntry,
} from '@/models/bnk/hirc'
import { sha256 } from '@/utils'
import { getFileName } from '@/utils/path'
import { reactive, Reactive, ref, toRef } from 'vue'

export class Bnk {
  public data: BnkData
  public name: string = ''
  public filePath: string = ''
  private _label: string = ''
  private segmentTree: SegmentTree | null = null

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
    const visitor = new SourceVisitor()
    this.visit(visitor)
    return visitor.getSources()
  }

  public getUnmanagedSources(): number[] {
    const didx = this.getDidxSection()
    if (!didx) return []
    const managed = this.getManagedSources()

    return didx.entries
      .filter((entry) => !managed.includes(entry.id))
      .map((entry) => entry.id)
  }

  public async extractData(outputDir: string): Promise<void> {
    return BnkApi.extractData(this.filePath, outputDir)
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
   * BnkLabel-ElementID
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
      .map((item) => {
        if (item.event_id !== 0) {
          return reactive({
            type: 'PlayListItem',
            elementType: 'Event',
            id: `${this._bnkLabel}-${item.event_id}`,
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
            id: `${this._bnkLabel}-${item.source_id}`,
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
              id: `${this._bnkLabel}-${item.track_id}`,
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
