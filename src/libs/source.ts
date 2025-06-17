import { useWorkspaceStore } from '@/stores/workspace'
import { Bnk } from './bnk'
import { Pck } from './pck'
import { reactive, Reactive } from 'vue'

export type SourceInfo = ISourceInfo<Bnk> | ISourceInfo<Pck>

export interface ISourceInfo<T extends Bnk | Pck> {
  id: number | string
  fromType: T extends Bnk ? 'bnk' : 'pck'
  from: T
  filePath?: string
  dirty: boolean
}

export class SourceManager {
  private static instance: SourceManager

  private workspace = useWorkspaceStore()
  private sources: Reactive<Record<number | string, SourceInfo[]>>

  constructor() {
    this.sources = reactive({})
  }

  public static getInstance(): SourceManager {
    if (!SourceManager.instance) {
      SourceManager.instance = new SourceManager()
    }
    return SourceManager.instance
  }

  public addSource(sourceInfo: SourceInfo) {
    if (!this.sources[sourceInfo.id]) {
      this.sources[sourceInfo.id] = []
    }
    this.sources[sourceInfo.id].push(sourceInfo)

    if (this.sources[sourceInfo.id].length > 1) {
      // sort
      this.sortSources(this.sources[sourceInfo.id])
    }
  }

  public clearSources() {
    for (const key in this.sources) {
      delete this.sources[key]
    }
  }

  public getSource(id: number | string): SourceInfo | null {
    const sources = this.sources[id]
    if (sources && sources.length > 0) {
      return sources[0]
    }
    return null
  }

  public getSources(id: number | string): SourceInfo[] {
    return this.sources[id] || []
  }

  /**
   * sort sources
   * streaming/pck > pck > _m.bnk > bnk
   */
  private sortSources(sources: SourceInfo[]) {
    sources.sort((a, b) => {
      if (a.fromType !== b.fromType) {
        return a.fromType === 'bnk' ? -1 : 1
      }

      if (a.fromType === 'pck' && b.fromType === 'pck') {
        // pcks
        if (a.from.hasData() && !b.from.hasData()) {
          return -1
        } else if (!a.from.hasData() && b.from.hasData()) {
          return 1
        } else {
          console.warn(
            '[Sort] pcks all have data or all dont have data',
            a.from.filePath,
            b.from.filePath
          )
          return 0
        }
      } else if (a.fromType === 'bnk' && b.fromType === 'bnk') {
        // bnks
        if (a.from.hasSection('Data') && !b.from.hasSection('Data')) {
          return -1
        } else if (!a.from.hasSection('Data') && b.from.hasSection('Data')) {
          return 1
        } else {
          console.warn(
            '[Sort] bnks all have data or all dont have data',
            a.from.filePath,
            b.from.filePath
          )
          return 0
        }
      }

      console.error('[Sort] unreachable')
      return 0
    })
  }
}
