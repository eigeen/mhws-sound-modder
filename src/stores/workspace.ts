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
import type { OverrideSource } from '@/libs/bnk'

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
                  const replaceItem = file.data.overrideMap[item.element_id]
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

          // 添加 overrideMap 中的新增音频到 flattenNodeMap
          Object.entries(file.data.overrideMap).forEach(([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            if (!entries[uniqueId]) {
              // 这是一个新增的音频，需要创建对应的节点
              const dirty = true // 新增音频默认为dirty
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
              sourceManager.addSource({
                id: sourceId,
                fromType: 'bnk',
                from: file.data as Bnk,
                dirty,
              })
            }
          })
        } else if (file.type === 'pck') {
          const flatten: FlattenNodeMap = {}

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

          // 添加 overrideMap 中的新增音频到 flattenNodeMap
          Object.entries(file.data.overrideMap).forEach(([sourceIdStr, replaceItem]) => {
            const sourceId = Number(sourceIdStr)
            const uniqueId = `${file.data.getLabel()}-${sourceId}`
            if (!entries[uniqueId]) {
              // 这是一个新增的音频，需要创建对应的节点
              const dirty = true // 新增音频默认为dirty
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
              sourceManager.addSource({
                id: sourceId,
                fromType: 'pck',
                from: file.data as Pck,
                dirty,
              })
            }
          })
        }
      })
      flattenNodeMap.value = entries
      console.debug('flatten map updated')
    },
    { deep: false }
  )

  // 单独监听 overrideMap 的变化，更新 flattenNodeMap
  watch(
    () => files.value.map(file => file.data.overrideMap),
    (newOverrideMaps, oldOverrideMaps) => {
      console.debug('overrideMap changed, updating flattenNodeMap')
      const sourceManager = SourceManager.getInstance()

      // 处理添加和删除的音频源
      files.value.forEach((file, fileIndex) => {
        const newOverrideMap = newOverrideMaps[fileIndex] || {}
        const oldOverrideMap = oldOverrideMaps?.[fileIndex] || {}

        const label = file.type === 'bnk'
          ? (file.data as Bnk).getLabel()
          : (file.data as Pck).getLabel()

        // 处理新增的音频源
        Object.entries(newOverrideMap).forEach(([sourceIdStr, replaceItem]) => {
          const sourceId = Number(sourceIdStr)
          const uniqueId = `${label}-${sourceId}`

          if (!flattenNodeMap.value[uniqueId]) {
            // 这是一个新增的音频，需要创建对应的节点
            const dirty = true // 新增音频默认为dirty
            flattenNodeMap.value[uniqueId] = reactive({
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

            if (file.type === 'bnk') {
              sourceManager.addSource({
                id: sourceId,
                fromType: 'bnk',
                from: file.data as Bnk,
                dirty,
              })
            } else {
              sourceManager.addSource({
                id: sourceId,
                fromType: 'pck',
                from: file.data as Pck,
                dirty,
              })
            }
          }
        })

        // 处理删除的音频源
        Object.keys(oldOverrideMap).forEach((sourceIdStr) => {
          const sourceId = Number(sourceIdStr)
          const uniqueId = `${label}-${sourceId}`

          // 如果旧的存在但新的不存在，说明被删除了
          if (!(sourceIdStr in newOverrideMap)) {
            // 检查这个音频源是否是纯粹由override添加的（不是原有音频源的替换）
            const managedSources = file.type === 'bnk' ? (file.data as Bnk).getManagedSources() : []
            const unmanagedSources = file.type === 'bnk' ? (file.data as Bnk).getUnmanagedSources() : []
            const pckSources = file.type === 'pck' ? (file.data as Pck).header.wem_entries.map(e => e.id) : []
            const existingSources = [...managedSources, ...unmanagedSources, ...pckSources]

            if (!existingSources.includes(sourceId)) {
              // 这是一个纯粹的新增音频源，需要从flattenNodeMap中删除
              delete flattenNodeMap.value[uniqueId]
              // 同时从SourceManager中删除
              sourceManager.removeSource(sourceId, file.data.filePath)
              console.debug(`Removed override audio source ${sourceId} from flattenNodeMap and SourceManager`)
            }
          }
        })
      })
    },
    { deep: true } // 这里需要 deep，但只监听 overrideMap
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
