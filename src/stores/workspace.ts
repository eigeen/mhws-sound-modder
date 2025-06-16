import { Bnk, HircNode } from '@/libs/bnk'
import { Pck } from '@/libs/pck'
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

export type WorkspaceFile = BnkFile | PckFile
export type FlattenNodeMap = { [key: string]: DataNode }

interface File<T> {
  type: 'bnk' | 'pck'
  data: T
}

export interface BnkFile extends File<Bnk> {
  type: 'bnk'
}

export interface PckFile extends File<Pck> {
  // TODO
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
  // Flatten entry map of all nodes in the files
  const flattenNodeMap = ref<FlattenNodeMap>({})
  // Replace list, to replace audio data
  const replaceList = ref<Record<string | number, ReplaceItem>>({})
  // Loose files in local dir
  const looseFiles = ref<Record<string, string>>({})

  // Shallow watch files changes
  watch(
    files.value,
    () => {
      // update flatten entry map
      let entries: FlattenNodeMap = {}
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
            if (node.type === 'PlayListItem' && node.elementType === 'Source') {
              // audio dirty flag is computed
              dataNode.dirty = computed(() => {
                const replaceItem = replaceList.value[node.id]
                return replaceItem !== undefined
              }) as unknown as boolean
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
        }
      })
      flattenNodeMap.value = entries
      console.debug('flatten entry map updated')
    },
    { deep: false }
  )

  return {
    files,
    selectedKey,
    flattenNodeMap,
    replaceList,
    looseFiles
  }
})
