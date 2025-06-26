import type { Bnk, HircNode } from '@/libs/bnk'
import type { Pck } from '@/libs/pck'
import { SourceManager } from '@/libs/source'
import { defineStore } from 'pinia'
import {
  computed,
  isReactive,
  isRef,
  reactive,
  type Reactive,
  ref,
  toRaw,
  unref,
  watch,
} from 'vue'
import type { LoudnessInfo } from '@/api/tauri'
import type { ReplaceItem } from '@/libs/bnk'

type FlattenNodeMap = { [key: string]: DataNode }
type WorkspaceFile = BnkFile | PckFile

interface File<T> {
  type: 'bnk' | 'pck'
  data: T
}

export interface BnkFile extends File<Bnk> {
  type: 'bnk'
}

export interface PckFile extends File<Pck> {
  type: 'pck'
}

export interface SourceInfo {
  type: 'Source'
  id: number
}

export type DataNodePayload = HircNode | SourceInfo

export interface DataNode {
  data: Reactive<DataNodePayload>
  /** Alert: this is shallow toRaw */
  defaultData: DataNodePayload
  parent: Reactive<DataNode> | null
  dirty: boolean
  belongToFile: Reactive<WorkspaceFile>
}

/**
 * Shallow unref object.
 * Will ignore 'parent' property.
 */
function shallowUnref<T>(obj: T): T {
  const result: Record<string, unknown> = {}

  for (const key in obj) {
    if (key === 'parent') {
      continue
    }
    if (isRef(obj[key])) {
      result[key] = unref(obj[key])
    } else if (isReactive(obj[key])) {
      result[key] = toRaw(obj[key])
    } else {
      result[key] = obj[key]
    }
  }

  return result as T
}

/**
 * Deep unref object.
 * Will ignore 'parent' property.
 */
function deepUnref<T>(obj: T): T {
  if (typeof obj !== 'object' || obj === null) {
    return obj as T
  }
  if (Array.isArray(obj)) {
    return obj.map((item) => deepUnref(item)) as T
  }

  const result: Record<string, unknown> = {}

  for (const key in obj) {
    if (key === 'parent') {
      continue
    }
    if (isRef(obj[key])) {
      result[key] = deepUnref(unref(obj[key]))
    } else if (isReactive(obj[key])) {
      result[key] = deepUnref(toRaw(obj[key]))
    } else if (obj[key] !== null) {
      result[key] = deepUnref(obj[key])
    } else {
      result[key] = obj[key]
    }
  }

  return result as T
}

export const useWorkspaceStore = defineStore('workspace', () => {
  // All files loaded
  const files = ref<WorkspaceFile[]>([])
  // Selected key of nodes
  const selectedKey = ref<string | number | null>(null)
  // Flatten map of all nodes in the files
  const flattenNodeMap = ref<FlattenNodeMap>({})
  // Loudness cache, key: audio file path
  const loudnessCache = ref<Record<string, LoudnessInfo>>({})

  // Shallow watch files changes
  watch(
    files.value,
    () => {
      console.debug('files changed')
      // update flatten map and source wems
      const sourceManager = SourceManager.getInstance()
      sourceManager.clearSources()

      const entries: FlattenNodeMap = {}
      files.value.forEach((file) => {
        if (file.type === 'bnk') {
          const flatten: FlattenNodeMap = {}

          function iterNode(node: HircNode, parent: DataNode | null) {
            const dataNode = reactive({
              data: node,
              defaultData:
                node.type === 'MusicTrack'
                  ? deepUnref(node) // MusicTrack is deep unref, because of playlist
                  : shallowUnref(node),
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
                  const replaceItem = file.data.overrideMap[uniqueId]
                  return replaceItem !== undefined
                }) as unknown as boolean
                const node = reactive<DataNode>({
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
                flatten[uniqueId] = node
                sourceManager.addSource({
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
              const replaceItem = file.data.overrideMap[uniqueId]
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
              sourceManager.addSource({
                id: elementId,
                fromType: 'bnk',
                from: file.data as Bnk,
                dirty,
              })
            }
          })
          // extend
          Object.entries(flatten).forEach(([key, value]) => {
            entries[key] = value
          })
        } else if (file.type === 'pck') {
          const flatten: FlattenNodeMap = {}

          file.data.header.wem_entries.forEach((entry) => {
            const uniqueId = `${file.data.getLabel()}-${entry.id}`
            const dirty = computed(() => {
              const replaceItem = file.data.overrideMap[uniqueId]
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
            sourceManager.addSource({
              id: entry.id,
              fromType: 'pck',
              from: file.data as Pck,
              dirty,
            })
          })
          // extend
          Object.entries(flatten).forEach(([key, value]) => {
            entries[key] = value
          })
        }
      })
      flattenNodeMap.value = entries
      console.debug('flatten map updated')
    },
    { deep: false }
  )

  const removeFile = (filePath: string): boolean => {
    const index = files.value.findIndex(
      (file) => file.data.filePath === filePath
    )
    if (index !== -1) {
      files.value.splice(index, 1)
      return true
    }
    return false
  }

  return {
    files,
    selectedKey,
    flattenNodeMap,
    loudnessCache,
    removeFile,
  }
})
