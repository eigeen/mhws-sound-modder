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
export type FlattenEntryMap = { [key: string]: DataNode }

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
  dirty: boolean
}

function shallowUnref<T>(obj: T): T {
  const result: Record<string, unknown> = {}

  for (const key in obj) {
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
  const flattenEntryMap = ref<FlattenEntryMap>({})

  // Shallow watch files changes
  watch(
    files.value,
    () => {
      // update flatten entry map
      let entries: FlattenEntryMap = {}
      files.value.forEach((file) => {
        if (file.type === 'bnk') {
          const flatten = file.data.getFlattenEntryMap()
          Object.entries(flatten).forEach(([key, value]) => {
            // to data node
            entries[key] = {
              data: value,
              defaultData: shallowUnref(value),
              dirty: false,
            }
          })
        }
      })
      flattenEntryMap.value = entries
      console.debug('flatten entry map updated')
    },
    { deep: false }
  )

  return {
    files,
    selectedKey,
    // dirtyMap,
    flattenEntryMap,
  }
})
