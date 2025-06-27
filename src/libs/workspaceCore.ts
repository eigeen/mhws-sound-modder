import { watch, type Reactive, reactive, computed, toRef } from 'vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type { DataNode, WorkspaceFile } from '@/stores/workspace'
import type { LoudnessInfo } from '@/api/tauri'
import type { TreeNode } from '@/components/DragOverTree.vue'
import type { SearchResult } from '@/components/Toolbar.vue'
import { SourceManager } from '@/libs/source'
import { Transcoder } from '@/libs/transcode'
import { Bnk, type HircNode } from '@/libs/bnk'
import { Pck } from '@/libs/pck'
import { ShowError, ShowInfo, ShowWarn } from '@/utils/message'
import { arrayCompare, readFileMagic } from '@/utils'
import { getExtension } from '@/utils/path'
import { convertFileSrc } from '@tauri-apps/api/core'
import { exists } from '@tauri-apps/plugin-fs'

// Event system interface
interface WorkspaceCoreEvents {
  'file:opened': (file: WorkspaceFile) => void
  'file:closed': (filePath: string) => void
  'node:selected': (node: DataNode | null) => void
  'node:updated': (nodeId: string, data: any) => void
  'audio:imported': (nodeId: string, audioPath: string) => void
  'export:progress': (progress: number, message: string) => void
}

export class WorkspaceCore {
  private static instance: WorkspaceCore | null = null
  /** Workspace state */
  private workspace = useWorkspaceStore()
  private sourceManager = SourceManager.getInstance()
  private transcoder = Transcoder.getInstance()
  private eventListeners: {
    [K in keyof WorkspaceCoreEvents]?: WorkspaceCoreEvents[K][]
  } = {}

  private constructor() {
    this.initializeWatchers()
    this.initializeState()
  }

  public static getInstance(): WorkspaceCore {
    if (!WorkspaceCore.instance) {
      WorkspaceCore.instance = new WorkspaceCore()
    }
    return WorkspaceCore.instance
  }

  // Initialize state synchronization
  private initializeState(): void {
    // Refresh all states after initialization
    this.refreshAll()
  }

  // Initialize watchers
  private initializeWatchers(): void {
    // Watch workspace file changes
    watch(
      () => this.workspace.files,
      (newFiles) => {
        this.refreshNodeTree()
      },
      { deep: false }
    )

    // Watch overrideMap changes
    watch(
      () => this.workspace.files.map((file) => file.data.overrideMap),
      () => {
        this.refreshNodeTree()
      },
      { deep: true }
    )
  }

  // ==================== File Management ====================

  public async openFiles(filePaths: string[]): Promise<WorkspaceFile[]> {
    this.workspace.isLoading = true
    try {
      const filesToAdd: WorkspaceFile[] = []

      for (const filePath of filePaths) {
        const isDuplicate =
          this.workspace.files.some(
            (file) => file.data.filePath === filePath
          ) || filesToAdd.some((file) => file.data.filePath === filePath)

        if (isDuplicate) {
          ShowInfo(`File already opened: ${filePath}`)
          continue
        }

        let file: WorkspaceFile
        const magic = await readFileMagic(filePath)

        if (arrayCompare(magic, [0x42, 0x4b, 0x48, 0x44])) {
          // BKHD - BNK file
          const bnk = await Bnk.load(filePath)
          file = { type: 'bnk', data: bnk }
        } else if (arrayCompare(magic, [0x41, 0x4b, 0x50, 0x4b])) {
          // AKPK - PCK file
          const pck = await Pck.load(filePath)
          file = { type: 'pck', data: pck }
        } else {
          throw new Error(`Unsupported file type: ${filePath}`)
        }

        filesToAdd.push(file)
      }

      if (filesToAdd.length > 0) {
        this.workspace.files.push(...filesToAdd)
        filesToAdd.forEach((file) => {
          this.emit('file:opened', file)
        })
      }

      return filesToAdd
    } catch (error) {
      ShowError(`Failed to open files: ${error}`)
      throw error
    } finally {
      this.workspace.isLoading = false
    }
  }

  public async closeFile(filePath: string): Promise<void> {
    const index = this.workspace.files.findIndex(
      (file) => file.data.filePath === filePath
    )
    if (index !== -1) {
      this.workspace.files.splice(index, 1)
      this.emit('file:closed', filePath)
      return
    }

    throw new Error('File not found')
  }

  // ==================== Node Operations ====================

  public selectNode(key: string | number): void {
    this.workspace.selectedKey = key
    this.emit('node:selected', this.workspace.selectedNode)
  }

  public updateNodeData(nodeId: string, data: Partial<any>): void {
    const node = this.workspace.flattenNodeMap[nodeId]
    if (!node) {
      throw new Error('Node not found')
    }

    Object.assign(node.data, data)
    node.dirty = true
    this.emit('node:updated', nodeId, data)
  }

  // ==================== Audio Operations ====================

  public async importAudio(nodeId: string, audioPath: string): Promise<void> {
    this.workspace.isLoading = true
    try {
      const node = this.workspace.flattenNodeMap[nodeId]
      if (!node) {
        throw new Error('Node not found')
      }

      if (node.data.type !== 'Source') {
        throw new Error('Audio import only supports source nodes')
      }

      // Check file format
      const ext = getExtension(audioPath)
      const AUDIO_EXTS: Record<string, boolean> = {
        wem: true,
        wav: true,
        ogg: true,
        flac: true,
        mp3: true,
        aac: true,
      }

      if (!ext || !AUDIO_EXTS[ext]) {
        throw new Error(`Unsupported file format: ${ext ?? '<no extension>'}`)
      }

      // Import audio
      const sourceId = node.data.id
      await node.belongToFile.data.addOverrideAudio(sourceId, audioPath)

      this.emit('audio:imported', nodeId, audioPath)
      ShowInfo(`Audio imported successfully: ${sourceId}`)
    } catch (error) {
      ShowError(`Failed to import audio: ${error}`)
      throw error
    } finally {
      this.workspace.isLoading = false
    }
  }

  public async addAudio(
    fileId: string,
    audioId: number,
    audioPath: string
  ): Promise<void> {
    this.workspace.isLoading = true
    try {
      const file = this.workspace.files.find((f) => f.data.filePath === fileId)
      if (!file) {
        throw new Error('File not found')
      }

      if (file.type !== 'bnk') {
        throw new Error('Can only add audio to BNK files')
      }

      await (file.data as Bnk).addOverrideAudio(audioId, audioPath)
      ShowInfo(`Audio ${audioId}.wem added successfully`)
    } catch (error) {
      ShowError(`Failed to add audio: ${error}`)
      throw error
    } finally {
      this.workspace.isLoading = false
    }
  }

  public async playAudio(nodeId: string): Promise<string> {
    const node = this.workspace.flattenNodeMap[nodeId]
    if (!node || node.data.type !== 'Source') {
      throw new Error('Invalid source node')
    }

    const sourceId = node.data.id
    let audioPath: string

    // Check if there's a replacement audio
    if (node.dirty) {
      const replaceItem = node.belongToFile.data.overrideMap[sourceId]
      if (replaceItem) {
        const wemFilePath = replaceItem.path
        const wavFilePath = wemFilePath.replace('.wem', '.wav')

        if (await exists(wavFilePath)) {
          audioPath = wavFilePath
        } else {
          audioPath = await this.transcoder.transcode(wemFilePath, 'wav')
        }
      } else {
        throw new Error('Replacement audio not found')
      }
    } else {
      // Play original audio
      const source = this.sourceManager.getSource(sourceId)
      if (!source) {
        throw new Error('Audio source not found')
      }
      audioPath = await source.from.transcodeSource(sourceId, 'wav')
    }

    const audioUrl = convertFileSrc(audioPath)
    this.workspace.audioCache.set(nodeId, audioUrl)

    return audioUrl
  }

  // ==================== Loudness Operations ====================

  public getLoudnessCache(): Record<string, LoudnessInfo> {
    return this.workspace.loudnessCache
  }

  public setLoudnessCache(audioPath: string, info: LoudnessInfo): void {
    this.workspace.loudnessCache[audioPath] = info
  }

  public getLoudnessCacheByPath(audioPath: string): LoudnessInfo | null {
    return this.workspace.loudnessCache[audioPath] || null
  }

  // ==================== Export Operations ====================

  public async exportFiles(exportDir: string): Promise<void> {
    this.workspace.isLoading = true
    this.workspace.operationProgress = 0

    const { exportLogger } = await import('@/utils/logger')

    try {
      exportLogger.info(`Starting to export files to directory: ${exportDir}`)

      const filesToExport = new Map<string, Reactive<WorkspaceFile>>()

      // Check dirty nodes
      exportLogger.debug('Checking modified nodes')
      const dirtyNodes: string[] = []
      Object.entries(this.workspace.flattenNodeMap).forEach(
        ([uniqueId, node]) => {
          if (node.dirty) {
            filesToExport.set(
              node.belongToFile.data.filePath,
              node.belongToFile
            )
            dirtyNodes.push(uniqueId)
          }
        }
      )

      if (dirtyNodes.length > 0) {
        exportLogger.debug(`Found ${dirtyNodes.length} modified nodes`, {
          dirtyNodes,
        })
      }

      // Check audio source replacements
      exportLogger.debug('Checking audio source replacements')
      const filesWithOverrides: { filePath: string; overrideCount: number }[] =
        []
      this.workspace.files.forEach((file) => {
        const overrideCount = Object.keys(file.data.overrideMap).length
        if (overrideCount > 0) {
          filesToExport.set(file.data.filePath, file)
          filesWithOverrides.push({
            filePath: file.data.filePath,
            overrideCount,
          })
        }
      })

      if (filesWithOverrides.length > 0) {
        exportLogger.debug(
          `Found ${filesWithOverrides.length} files with audio source replacements`,
          { filesWithOverrides }
        )
      }

      if (filesToExport.size === 0) {
        exportLogger.warn('No files to export')
        ShowInfo('No files to export')
        return
      }

      exportLogger.info(`Preparing to export ${filesToExport.size} files`, {
        fileList: Array.from(filesToExport.values()).map((file) => ({
          name: file.data.name,
          type: file.type,
          overrideCount: Object.keys(file.data.overrideMap).length,
        })),
      })

      let successCount = 0
      let errorCount = 0
      const totalFiles = filesToExport.size
      const exportResults: {
        fileName: string
        status: 'success' | 'error'
        error?: string
        exportPath?: string
      }[] = []

      for (const [filePath, file] of filesToExport) {
        try {
          const progress = (successCount / totalFiles) * 100
          this.workspace.operationProgress = progress
          this.emit(
            'export:progress',
            progress,
            `Exporting file: ${file.data.name}`
          )

          exportLogger.info(`Exporting file: ${file.data.name}`, {
            progress: `${successCount + 1}/${totalFiles}`,
            fileName: file.data.name,
            fileType: file.type,
            overrideCount: Object.keys(file.data.overrideMap).length,
          })

          const exportPath = `${exportDir}/${file.data.name}`
          await file.data.exportFile(exportPath, exportLogger)

          successCount++
          exportResults.push({
            fileName: file.data.name,
            status: 'success',
            exportPath,
          })

          exportLogger.info(`File exported successfully: ${file.data.name}`, {
            exportPath,
          })
        } catch (error) {
          errorCount++
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          exportResults.push({
            fileName: file.data.name,
            status: 'error',
            error: errorMessage,
          })

          exportLogger.error(`File export failed: ${file.data.name}`, {
            error: errorMessage,
            filePath: file.data.filePath,
          })
          console.error(`Failed to export file ${file.data.name}:`, error)
        }
      }

      this.workspace.operationProgress = 100
      const message = `Export completed: ${successCount} files succeeded, ${errorCount} files failed`

      // Record export summary
      exportLogger.info('Export operation completed', {
        totalFiles,
        successCount,
        errorCount,
        exportDir,
        results: exportResults,
      })

      if (errorCount > 0) {
        exportLogger.warn(`${errorCount} files failed during export process`, {
          failedFiles: exportResults.filter((r) => r.status === 'error'),
        })
        ShowWarn(message)
      } else {
        exportLogger.info('All files exported successfully')
        ShowInfo(message)
      }

      if (errorCount === totalFiles) {
        const allFailedError = 'All files failed to export'
        exportLogger.error(allFailedError, { exportResults })
        throw new Error(allFailedError)
      }
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error)
      exportLogger.error('Critical error occurred during export process', {
        error: errorMessage,
      })
      ShowError(`Export failed: ${error}`)
      throw error
    } finally {
      this.workspace.isLoading = false
      this.workspace.operationProgress = 0
    }
  }

  // ==================== Refresh Methods ====================

  public refreshNodeTree(): void {
    console.debug('refreshNodeTree')
    // Update flattenNodeMap first
    this.updateFlattenNodeMap()

    // Then update visual tree
    this.workspace.visualTree.splice(
      0,
      this.workspace.visualTree.length,
      ...this.buildTreeFromWorkspace()
    )
  }

  public refreshDirtyStatus(nodeId?: string): void {
    // Dirty status directly uses each node's dirty field, no need to maintain separate Map
    // This method is kept for compatibility but performs no operation
  }

  public refreshAll(): void {
    console.debug('refreshAll')
    this.refreshNodeTree()
  }

  public refreshUI(): void {
    this.refreshNodeTree()
  }

  // ==================== Search and Filter ====================

  public searchNodes(keyword: string): SearchResult[] {
    // TODO: Implement search logic
    return []
  }

  public filterNodes(predicate: (node: DataNode) => boolean): DataNode[] {
    return Object.values(this.workspace.flattenNodeMap).filter(predicate)
  }

  // ==================== Private Helper Methods ====================

  private updateFlattenNodeMap(): void {
    // Clear existing sources
    this.sourceManager.clearSources()

    const entries: Record<string, DataNode> = {}

    // Helper functions for handling reactive data
    const shallowUnref = <T>(obj: T): T => {
      if (typeof obj !== 'object' || obj === null) return obj
      const result: Record<string, unknown> = {}
      for (const key in obj) {
        if (key === 'parent') continue
        result[key] = obj[key]
      }
      return result as T
    }

    const deepUnref = <T>(obj: T): T => {
      if (typeof obj !== 'object' || obj === null) return obj
      if (Array.isArray(obj)) {
        return obj.map((item) => deepUnref(item)) as T
      }
      const result: Record<string, unknown> = {}
      for (const key in obj) {
        if (key === 'parent') continue
        if (obj[key] !== null) {
          result[key] = deepUnref(obj[key])
        } else {
          result[key] = obj[key]
        }
      }
      return result as T
    }

    this.workspace.files.forEach((file) => {
      if (file.type === 'bnk') {
        const flatten: Record<string, DataNode> = {}

        const iterNode = (node: HircNode, parent: DataNode | null) => {
          const dataNode = reactive({
            data: node,
            defaultData:
              node.type === 'MusicTrack' ? deepUnref(node) : shallowUnref(node),
            parent: parent ?? null,
            dirty: false,
            belongToFile: file,
          })
          flatten[node.id] = dataNode

          // iterate children
          if (node.type === 'MusicSegment') {
            node.children.forEach((child) => {
              iterNode(child, dataNode)
            })
          } else if (node.type === 'MusicTrack') {
            node.playlist.forEach((item) => {
              // add source nodes
              if (item.elementType !== 'Source') return

              const uniqueId = item.id
              const dirty = computed(() => {
                const replaceItem = file.data.overrideMap[item.element_id]
                return replaceItem !== undefined
              }) as unknown as boolean
              const sourceNode = reactive<DataNode>({
                data: {
                  type: 'Source',
                  id: item.element_id,
                },
                defaultData: {
                  type: 'Source',
                  id: item.element_id,
                },
                parent: dataNode,
                dirty,
                belongToFile: file,
              })
              flatten[uniqueId] = sourceNode
              this.sourceManager.addSource({
                id: item.element_id,
                fromType: 'bnk',
                from: file.data as Bnk,
                dirty,
              })
            })
          }
        }

        // iterate all nodes
        const segmentTree = file.data.getSegmentTree()
        segmentTree.nodes.forEach((node) => {
          iterNode(node, null)
        })

        // if has didx section, add unmanaged sources (not in HIRC)
        const unmanagedIds = file.data.getUnmanagedSources()
        unmanagedIds.forEach((elementId) => {
          const uniqueId = `${file.data.getLabel()}-${elementId}`
          const dirty = computed(() => {
            const replaceItem = file.data.overrideMap[elementId]
            return replaceItem !== undefined
          }) as unknown as boolean
          if (!flatten[uniqueId]) {
            flatten[uniqueId] = reactive({
              data: {
                type: 'Source',
                id: elementId,
              },
              defaultData: {
                type: 'Source',
                id: elementId,
              },
              parent: null,
              dirty,
              belongToFile: file,
            })
            this.sourceManager.addSource({
              id: elementId,
              fromType: 'bnk',
              from: file.data as Bnk,
              dirty,
            })
          }
        })

        // extend entries
        Object.entries(flatten).forEach(([key, value]) => {
          entries[key] = value
        })

        // Add overrideMap sources to flattenNodeMap
        Object.entries(file.data.overrideMap).forEach(
          ([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            if (!entries[uniqueId]) {
              // This is a new audio source, create corresponding node
              const dirty = true // New audio is dirty by default
              entries[uniqueId] = reactive({
                data: reactive({
                  type: 'Source',
                  id: sourceId,
                }),
                defaultData: {
                  type: 'Source',
                  id: sourceId,
                },
                parent: null,
                dirty,
                belongToFile: file,
              })
              this.sourceManager.addSource({
                id: sourceId,
                fromType: 'bnk',
                from: file.data as Bnk,
                dirty,
              })
            }
          }
        )
      } else if (file.type === 'pck') {
        const flatten: Record<string, DataNode> = {}

        file.data.header.wem_entries.forEach((entry) => {
          const uniqueId = `${file.data.getLabel()}-${entry.id}`
          const dirty = computed(() => {
            const replaceItem = file.data.overrideMap[entry.id]
            return replaceItem !== undefined
          }) as unknown as boolean
          flatten[uniqueId] = reactive({
            data: {
              type: 'Source',
              id: entry.id,
            },
            defaultData: {
              type: 'Source',
              id: entry.id,
            },
            parent: null,
            dirty,
            belongToFile: file,
          })
          this.sourceManager.addSource({
            id: entry.id,
            fromType: 'pck',
            from: file.data as Pck,
            dirty,
          })
        })

        // extend entries
        Object.entries(flatten).forEach(([key, value]) => {
          entries[key] = value
        })

        // Add overrideMap sources to flattenNodeMap
        Object.entries(file.data.overrideMap).forEach(
          ([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            if (!entries[uniqueId]) {
              // This is a new audio source, create corresponding node
              const dirty = true // New audio is dirty by default
              entries[uniqueId] = reactive({
                data: reactive({
                  type: 'Source',
                  id: sourceId,
                }),
                defaultData: {
                  type: 'Source',
                  id: sourceId,
                },
                parent: null,
                dirty,
                belongToFile: file,
              })
              this.sourceManager.addSource({
                id: sourceId,
                fromType: 'pck',
                from: file.data as Pck,
                dirty,
              })
            }
          }
        )
      }
    })

    this.workspace.flattenNodeMap = entries
    console.debug('flatten map updated by workspaceCore')
  }

  private buildTreeFromWorkspace(): TreeNode[] {
    // Reuse existing tree building logic
    const getDirtyRef = (id: string | number) => {
      const node = this.workspace.flattenNodeMap[id]
      return toRef(node, 'dirty') ?? false
    }

    const iterNodes = (parent: TreeNode, node: HircNode) => {
      if (!parent.children) {
        parent.children = []
      }

      let childNode: TreeNode
      switch (node.type) {
        case 'MusicSegment':
          childNode = {
            label: `Segment ${node.id}`,
            key: node.id,
            icon: 'mdi-segment',
            dirty: getDirtyRef.call(this, node.id) as unknown as boolean,
            children: [],
          }
          node.children.forEach((child) => {
            iterNodes.call(this, childNode, child)
          })
          parent.children.push(childNode)
          break
        case 'MusicTrack':
          childNode = {
            label: `Track ${node.id}`,
            key: node.id,
            icon: 'mdi-waveform',
            dirty: getDirtyRef.call(this, node.id) as unknown as boolean,
            children: [],
          }
          const playlist = node.playlist
            .map((item) => {
              if (item.elementType === 'Source') {
                return {
                  label: `${item.element_id}.wem`,
                  key: item.id,
                  icon: 'mdi-file-music',
                  dirty: getDirtyRef.call(this, item.id) as unknown as boolean,
                  children: [],
                }
              } else {
                return null
              }
            })
            .filter((item) => item !== null) as TreeNode[]
          childNode.children = playlist
          parent.children.push(childNode)
          break
      }
    }

    const result = this.workspace.files.map((file) => {
      const root: TreeNode = {
        label: file.data.name,
        key: file.data.filePath,
        children: [],
      }

      if (file.type === 'bnk') {
        root.type = 'bnk'
        // Build segment tree
        file.data.getSegmentTree().nodes.forEach((node) => {
          iterNodes.call(this, root, node)
        })
        // Collect unmanaged wem files
        const unmanagedSources = file.data.getUnmanagedSources()
        unmanagedSources.forEach((elementId) => {
          const uniqueId = `${file.data.getLabel()}-${elementId}`
          root.children!.push({
            label: `${elementId}.wem`,
            key: uniqueId,
            icon: 'mdi-file-music',
            dirty: getDirtyRef.call(this, uniqueId) as unknown as boolean,
          })
        })

        // Add new audio from overrideMap to visual tree
        Object.entries(file.data.overrideMap).forEach(
          ([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            const existingChildIndex = root.children!.findIndex(
              (child) => child.key === uniqueId
            )
            if (existingChildIndex === -1) {
              root.children!.push({
                label: `${sourceId}.wem`,
                key: uniqueId,
                icon: 'mdi-file-music',
                dirty: getDirtyRef.call(this, uniqueId) as unknown as boolean,
              })
            }
          }
        )
      } else if (file.type === 'pck') {
        root.type = 'pck'
        if (!file.data.hasData()) {
          root.label = `${file.data.name} (no data)`
        }
        file.data.header.wem_entries.forEach((entry) => {
          const uniqueId = `${file.data.getLabel()}-${entry.id}`
          root.children!.push({
            label: `${entry.id}.wem`,
            key: uniqueId,
            icon: 'mdi-file-music',
            dirty: getDirtyRef.call(this, uniqueId) as unknown as boolean,
          })
        })

        // Add new audio from overrideMap to visual tree
        Object.entries(file.data.overrideMap).forEach(
          ([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            const existingChildIndex = root.children!.findIndex(
              (child) => child.key === uniqueId
            )
            if (existingChildIndex === -1) {
              root.children!.push({
                label: `${sourceId}.wem`,
                key: uniqueId,
                icon: 'mdi-file-music',
                dirty: getDirtyRef.call(this, uniqueId) as unknown as boolean,
              })
            }
          }
        )
      }
      return root
    })

    return result
  }

  // ==================== Event System ====================

  public on<K extends keyof WorkspaceCoreEvents>(
    event: K,
    listener: WorkspaceCoreEvents[K]
  ): void {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = []
    }
    this.eventListeners[event]!.push(listener)
  }

  public off<K extends keyof WorkspaceCoreEvents>(
    event: K,
    listener: WorkspaceCoreEvents[K]
  ): void {
    if (this.eventListeners[event]) {
      const index = this.eventListeners[event]!.indexOf(listener)
      if (index > -1) {
        this.eventListeners[event]!.splice(index, 1)
      }
    }
  }

  private emit<K extends keyof WorkspaceCoreEvents>(
    event: K,
    ...args: Parameters<WorkspaceCoreEvents[K]>
  ): void {
    if (this.eventListeners[event]) {
      this.eventListeners[event]!.forEach((listener) => {
        ;(listener as any)(...args)
      })
    }
  }
}

// Export singleton instance
export const workspaceCore = WorkspaceCore.getInstance()
