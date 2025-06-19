import { useWorkspaceStore } from '@/stores/workspace'
import type { Bnk } from './bnk'
import type { Pck } from './pck'
import { reactive, type Reactive } from 'vue'
import { LocalDir } from './localDir'
import { join } from '@tauri-apps/api/path'
import { exists } from '@tauri-apps/plugin-fs'

export type SourceInfo = ISourceInfo<Bnk> | ISourceInfo<Pck>

export interface ISourceInfo<T extends Bnk | Pck> {
  id: number | string
  fromType: T extends Bnk ? 'bnk' : 'pck'
  from: T
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
      // remove duplicates except self
      const index = this.sources[sourceInfo.id].findIndex(
        (item) => item.from.filePath === sourceInfo.from.filePath
      )
      if (index !== -1 && index !== this.sources[sourceInfo.id].length - 1) {
        // if index is not the last one (added one), remove it
        this.sources[sourceInfo.id].splice(index, 1)
      }
      // sort
      this.sortSources(this.sources[sourceInfo.id])
    }
  }

  public clearSources() {
    console.debug('clear sources')
    Object.keys(this.sources).forEach((key) => {
      delete this.sources[key]
    })
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
   * Get source Wem file path.
   */
  public async getSourceFilePath(id: number | string): Promise<string | null> {
    const source = this.getSource(id)
    if (!source) return null

    const tempDir = await LocalDir.getTempDir()
    let label = ''
    let expectPath = ''
    switch (source.fromType) {
      case 'bnk':
        const bnk = source.from
        label = bnk.getLabel()
        expectPath = await join(tempDir, label, `${id}.wem`)
        if (await exists(expectPath)) {
          return expectPath
        }
        // not found, try extract
        const outputDir = await join(tempDir, label)
        await bnk.extractData(outputDir)
        // check again
        if (!(await exists(expectPath))) {
          throw new Error(
            `Source ${id} not found in ${bnk.filePath} after extract.`
          )
        }
        return expectPath
      case 'pck':
        const pck = source.from
        label = pck.getLabel()
        expectPath = await join(tempDir, label, `${id}.wem`)
        if (await exists(expectPath)) {
          return expectPath
        }
        // not found, try extract
        const pckDir = await join(tempDir, label)
        await pck.extractData(pckDir)
        // check again
        if (!(await exists(expectPath))) {
          throw new Error(
            `Source ${id} not found in ${pck.filePath} after extract.`
          )
        }
        return expectPath
    }
  }

  /**
   * sort sources
   * streaming/pck > pck > _m.bnk > bnk
   */
  private sortSources(sources: SourceInfo[]) {
    sources.sort((a, b) => {
      if (a.fromType !== b.fromType) {
        return a.fromType === 'pck' ? -1 : 1
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
