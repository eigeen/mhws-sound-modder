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
import type { TreeNode } from '@/components/DragOverTree.vue'

type FlattenNodeMap = { [key: string]: DataNode }
export type WorkspaceFile = BnkFile | PckFile

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

  // ==================== 核心状态管理 ====================
  // 计算属性：当前选中的节点
  const selectedNode = computed(() => {
    if (!selectedKey.value) return null
    return flattenNodeMap.value[selectedKey.value] || null
  })

  /** Visual tree for UI */
  const visualTree = ref<TreeNode[]>([])

  // 响应式状态：UI状态
  const isLoading = ref(false)
  const operationProgress = ref(0)

  // 响应式状态：缓存
  const audioCache = ref(new Map<string, string>())

  return {
    files,
    selectedKey,
    flattenNodeMap,
    loudnessCache,
    selectedNode,
    visualTree,
    isLoading,
    operationProgress,
    audioCache,
  }
})
