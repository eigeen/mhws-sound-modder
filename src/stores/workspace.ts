import { Bnk, HircNode } from '@/libs/bnk'
import { Pck } from '@/libs/pck'
import { SourceManager } from '@/libs/source'
import { defineStore } from 'pinia'
import {
  computed,
  isReactive,
  isRef,
  reactive,
  Reactive,
  ref,
  toRaw,
  unref,
  watch,
} from 'vue'

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

export interface DataNode {
  data: Reactive<HircNode>
  /** Alert: this is shallow toRaw */
  defaultData: HircNode
  parent: Reactive<DataNode> | null
  dirty: boolean
}

export type ReplaceItem = {
  type: 'audio'
  id: number | string
  path: string
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

export const useWorkspaceStore = defineStore('workspace', () => {
  // All files loaded
  const files = ref<WorkspaceFile[]>([])
  // Selected key of nodes
  const selectedKey = ref<string | number | null>(null)
  // Flatten map of all nodes in the files
  const flattenNodeMap = ref<FlattenNodeMap>({})
  // Replace list, to replace audio data
  const replaceList = ref<Record<string | number, ReplaceItem>>({})

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
              defaultData: shallowUnref(node),
              parent: parent ?? null,
              dirty: false,
            })
            if (node.type === 'PlayListItem') {
              if (node.elementType === 'Source') {
                // dirty flag for source is computed
                const dirty = computed(() => {
                  const replaceItem = replaceList.value[node.element_id]
                  return replaceItem !== undefined
                }) as unknown as boolean
                dataNode.dirty = dirty
                // sync source
                sourceManager.addSource({
                  id: node.element_id,
                  fromType: 'bnk',
                  from: file.data as Bnk,
                  dirty,
                })
              } else {
                // ignore non-source nodes
                return
              }
            }

            flatten[node.id] = dataNode
            // iterate children
            if (node.type === 'MusicSegment') {
              node.children.forEach((child) => {
                iterNode(child, dataNode)
              })
            } else if (node.type === 'MusicTrack') {
              node.playlist.forEach((item) => {
                iterNode(item, dataNode)
              })
            }
          }

          // iterate all nodes
          const segmentTree = file.data.getSegmentTree()
          segmentTree.nodes.forEach((node) => {
            iterNode(node, null)
          })
          // extend
          Object.entries(flatten).forEach(([key, value]) => {
            entries[key] = value
          })
        } else if (file.type === 'pck') {
          if (file.data.hasData()) {
            file.data.header.wem_entries.forEach((entry) => {
              sourceManager.addSource({
                id: entry.id,
                fromType: 'pck',
                from: file.data as Pck,
                dirty: computed(() => {
                  const replaceItem = replaceList.value[entry.id]
                  return replaceItem !== undefined
                }) as unknown as boolean,
              })
            })
          }
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
    replaceList,
    removeFile,
  }
})
