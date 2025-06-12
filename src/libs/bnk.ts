import { bnkLoadFile } from '@/api/tauri'
import { BnkData, Section } from '@/models/bnk'
import {
  HircEntry,
  HircEventEntry,
  HircMusicRanSeqCntrEntry,
  HircMusicSegmentEntry,
  HircMusicTrackEntry,
  HircSoundEntry,
} from '@/models/bnk/hirc'
import { getFileName } from '@/utils/path'
import { Reactive, reactive, ref, Ref, toRef } from 'vue'

export class Bnk {
  public data: Reactive<BnkData>
  public name: string = ''
  public filePath: string = ''
  private relatedBnk: Bnk[] = []
  //   private relatedPck: Pck[] = []
  private segmentTree: SegmentTree | null = null

  constructor(data: BnkData) {
    this.data = reactive(data)
  }

  public static async load(filePath: string): Promise<Bnk> {
    const bnkData = await bnkLoadFile(filePath)
    console.log('bnkData', bnkData)
    const bnk = new Bnk(bnkData)
    bnk.filePath = filePath
    bnk.name = getFileName(filePath)
    return bnk
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
}

/**
 * Music segment tree
 */
export class SegmentTree {
  public nodes: MusicSegmentNode[] = []

  constructor(bnk: Bnk) {
    const visitor = new MusicSegmentVisitor()
    bnk.visit(visitor)
    this.nodes = visitor.musicSegments
  }
}

export interface MusicSegmentNode {
  type: 'MusicSegment'
  id: number
  duration: Ref<number>
  fade_in_end: Ref<number>
  fade_out_start: Ref<number>
  children: MusicTrackNode[]
}

export interface MusicTrackNode {
  type: 'MusicTrack'
  id: number
  playlist: PlayListItem[]
}

export interface PlayListItem {
  type: 'Track' | 'Source' | 'Event'
  // available when type is 'Source' or 'Event'
  id: Ref<number>
  // available when type is 'Track'
  element?: MusicTrackNode
  playAt: Ref<number>
  beginTrimOffset: Ref<number>
  endTrimOffset: Ref<number>
  srcDuration: Ref<number>
}

export class BnkVisitor {
  public visitBnk(bnk: Bnk): void {
    bnk.data.sections.forEach((section) => {
      this.visitSection(section)
    })
  }

  public visitSection(section: Section): void {
    console.log('section', section)
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
          return {
            type: 'Event',
            id: toRef(item, 'event_id'),
            element: null,
            playAt: toRef(item, 'play_at'),
            beginTrimOffset: toRef(item, 'begin_trim_offset'),
            endTrimOffset: toRef(item, 'end_trim_offset'),
            srcDuration: toRef(item, 'src_duration'),
          }
        } else if (item.source_id !== 0) {
          return {
            type: 'Source',
            id: toRef(item, 'source_id'),
            element: null,
            playAt: toRef(item, 'play_at'),
            beginTrimOffset: toRef(item, 'begin_trim_offset'),
            endTrimOffset: toRef(item, 'end_trim_offset'),
            srcDuration: toRef(item, 'src_duration'),
          }
        } else if (item.track_id !== 0) {
          const track = this.musicTracks[item.track_id]
          if (track) {
            return {
              type: 'Track',
              id: toRef(item, 'track_id'),
              element: track,
              playAt: toRef(item, 'play_at'),
              beginTrimOffset: toRef(item, 'begin_trim_offset'),
              endTrimOffset: toRef(item, 'end_trim_offset'),
              srcDuration: toRef(item, 'src_duration'),
            }
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

    const node: MusicSegmentNode = {
      type: 'MusicSegment',
      id: entry.id,
      duration: toRef(data, 'duration'),
      fade_in_end: ref(0), // TODO
      fade_out_start: ref(0),
      children: [],
    }

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
