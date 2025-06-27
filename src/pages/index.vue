<script lang="ts" setup>
import InfoPanel from '@/components/InfoPanel.vue'
import {
  open as openDialog,
  save as saveDialog,
} from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useDark } from '@vueuse/core'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { computed, reactive, ref } from 'vue'
import { Bnk } from '@/libs/bnk'
import { ShowError, ShowInfo } from '@/utils/message'
import type DragOverTree from '@/components/DragOverTree.vue'
import type { SearchResult, SearchSource } from '@/components/Toolbar.vue'
import { getFileStem } from '@/utils/path'
import { TargetFormatList, type TargetFormat } from '@/libs/transcode'
import { SourceManager } from '@/libs/source'
import { writeText as writeTextToClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { Pck } from '@/libs/pck'

import { mkdir, copyFile, exists } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { useStatusStore } from '@/stores/status'

// 引入 WorkspaceCore 和 workspace store
import { workspaceCore } from '@/libs/workspaceCore'
import { useWorkspaceStore } from '@/stores/workspace'

const sourceManager = SourceManager.getInstance()
const isDark = useDark()
const statusStore = useStatusStore()
const workspace = useWorkspaceStore()

const dragTreeRef = ref<InstanceType<typeof DragOverTree>>()
const infoPanelRef = ref<InstanceType<typeof InfoPanel>>()
const splitPanel = reactive({
  left: 3,
  right: 7,
})

const nodeClickState = reactive({
  count: 0,
  preId: null as string | number | null,
  curId: null as string | number | null,
  timer: undefined as number | undefined,
})

// 搜索相关状态
const isSearchExpanded = ref(false)
const searchKeyword = ref('')
const searchSource = computed(() => {
  const dfs = (node: TreeNode, source: SearchSource) => {
    const childrenSource = {
      text: node.label,
      children: [],
    }

    if (node.children && source.children !== undefined) {
      node.children.forEach((child) => {
        dfs(child, childrenSource)
      })
    }
    source.children.push(childrenSource)
  }

  const rootSource: SearchSource = {
    text: '',
    children: [],
  }
  // build a minimal tree structure for search
  workspace.visualTree.forEach((node) => {
    dfs(node, rootSource)
  })
  return rootSource
})

function iterVisualTree(node: TreeNode, visitor: (node: TreeNode) => void) {
  visitor(node)
  if (node.children) {
    node.children.forEach((child) => {
      iterVisualTree(child, visitor)
    })
  }
}

function handleSearchFocus(
  total: number,
  current: number,
  result: SearchResult
) {
  console.debug('Search focus', total, current, result)
  // locate target node in visual tree
  // get target label
  let keys: (string | number)[] = []
  let tempNodes: TreeNode[] = workspace.visualTree
  for (let index = 0; index < result.path.length; index++) {
    const nodeIndex = result.path[index]
    const node = tempNodes[nodeIndex]
    keys.push(node.key)
    tempNodes = node.children ?? []
  }
  if (keys.length === 0) {
    console.warn('No target node found')
    return
  }

  // focus target node
  if (!dragTreeRef.value) {
    console.warn('No dragTreeRef found')
    return
  }

  // focus target node
  dragTreeRef.value?.focusNode(keys[keys.length - 1])
}

async function handleOpenFileDialog() {
  try {
    const selected =
      (await openDialog({
        multiple: true,
        filters: [
          {
            name: 'All Files',
            extensions: ['*'],
          },
          {
            name: 'Sound Bank',
            extensions: ['bnk', 'sbnk', 'sbnk.X64'],
          },
          {
            name: 'Sound Pack',
            extensions: ['pck', 'pck.X64'],
          },
        ],
      })) ?? []
    console.info('Selected files:', selected)

    if (selected.length > 0) {
      await workspaceCore.openFiles(selected)
    }
  } catch (err) {
    ShowError(`Failed to open file: ${err}`)
  }
}

async function handleExport() {
  const { exportLogger } = await import('@/utils/logger')

  try {
    // Start logging without specifying directory
    exportLogger.start()
    exportLogger.info('User initiated export operation')

    // Select export directory
    exportLogger.debug('Selecting export directory')
    const exportDir = await openDialog({
      directory: true,
      multiple: false,
    })

    if (!exportDir) {
      exportLogger.warn('User cancelled directory selection')
      exportLogger.terminate()
      return
    }

    // Set log save directory
    exportLogger.setLogDirectory(exportDir)
    exportLogger.info(`Export directory selected: ${exportDir}`)

    await workspaceCore.exportFiles(exportDir)

    // Export completed, save logs
    await exportLogger.end()

  } catch (err) {
    exportLogger.error('Error occurred during export process', { error: err })
    ShowError(`Export failed: ${err}`)

    // Save logs even when error occurs
    await exportLogger.end()
  }
}

async function handleDrop(event: DropEvent) {
  console.debug('handleDrop event', event)
  const { key, paths } = event

  try {
    // currently we only support single file drop
    // multiple file drop will be supported in the future
    await workspaceCore.importAudio(key, paths[0])
  } catch (err) {
    ShowError(`Failed to import audio: ${err}`)
  }
}

async function handleDumpAudio(uniqueId: string, format: TargetFormat) {
  const statusId = `dump-${uniqueId}-${format}`
  try {
    const node = workspace.flattenNodeMap[uniqueId]
    if (!node) {
      throw new Error('Node not found')
    }

    const source = sourceManager.getSource(node.data.id)
    if (!source) {
      throw new Error('Source not found')
    }

    const sourceId = source.id

    // request output path
    const outputPath = await saveDialog({
      filters: [
        {
          name: 'Audio',
          extensions: [format],
        },
      ],
      defaultPath: `${sourceId}.${format}`,
    })
    if (!outputPath) {
      return
    }

    // show status progress
    statusStore.pushEvent({
      id: statusId,
      message: `Dumping Audio ${sourceId}`,
      progress: {
        current: 100,
        indeterminate: true,
      },
    })

    const outputFilePath = await source.from.transcodeSource(sourceId, format)

    await copyFile(outputFilePath, outputPath)
    ShowInfo(`${format} file dumped: ${outputPath}`)
  } catch (err) {
    ShowError(`Failed to dump ${format} file: ${err}`)
  } finally {
    statusStore.removeEvent(statusId)
  }
}

async function handleDumpFile(filePath: string, format: TargetFormat) {
  console.debug('handleDumpFile', filePath, format)

  const file = workspace.files.find((f) => f.data.filePath === filePath)
  if (!file) {
    ShowError(`File not found: ${filePath}`)
    return
  }

  const statusId = `dump-${filePath}-${format}`
  try {
    // request output path
    const outputRoot = await openDialog({
      directory: true,
      multiple: false,
    })
    if (!outputRoot) return

    let sourceIds: number[] = []
    let outputDir: string

    if (file.type === 'bnk') {
      const bnk = file.data as Bnk
      sourceIds = [...bnk.getManagedSources(), ...bnk.getUnmanagedSources()]
      outputDir = await join(outputRoot, getFileStem(bnk.filePath))
    } else if (file.type === 'pck') {
      const pck = file.data as Pck
      sourceIds = pck.header.wem_entries.map((entry) => entry.id)
      outputDir = await join(outputRoot, getFileStem(pck.filePath))
    } else {
      ShowError(`Unsupported file type`)
      return
    }

    // create output dir
    if (!(await exists(outputDir))) {
      await mkdir(outputDir, { recursive: true })
    }

    // show status progress
    let finishedCount = 0
    statusStore.pushEvent({
      id: statusId,
      message: `Dumping ${finishedCount} / ${sourceIds.length} sources`,
      progress: {
        current: (finishedCount / sourceIds.length) * 100,
        indeterminate: false,
      },
    })
    // dump all sources background
    Promise.all(
      sourceIds.map(async (sourceId) => {
        const source = sourceManager.getSource(sourceId)
        if (!source) return

        const tempFilePath = await source.from.transcodeSource(sourceId, format)
        const outputFilePath = await join(outputDir, `${sourceId}.${format}`)
        await copyFile(tempFilePath, outputFilePath)

        finishedCount++
        statusStore.pushEvent({
          id: statusId,
          message: `Dumping ${finishedCount} / ${sourceIds.length} sources`,
          progress: {
            current: (finishedCount / sourceIds.length) * 100,
            indeterminate: false,
          },
        })
      })
    )
      .catch((err) => {
        ShowError(`Failed to dump file: ${err}`)
      })
      .finally(() => {
        statusStore.removeEvent(statusId)
      })
  } catch (err) {
    ShowError(`Failed to dump file: ${err}`)
  } finally {
    statusStore.removeEvent(statusId)
  }
}

async function handleAddAudio(filePath: string) {
  try {
    // 选择要添加的音频文件
    const audioFilePath = await openDialog({
      filters: [
        {
          name: 'Audio',
          extensions: TargetFormatList,
        },
      ],
      multiple: false,
      directory: false,
    })
    if (!audioFilePath) {
      return
    }

    // 尝试从文件名解析ID
    let id = parseInt(getFileStem(audioFilePath))
    if (Number.isNaN(id)) {
      // 弹出对话框让用户输入ID
      const userInput = prompt('请输入音频ID (数字):', '')
      if (!userInput) {
        return // 用户取消
      }
      id = parseInt(userInput)
    }

    // 检查ID是否有效
    if (Number.isNaN(id) || id < 0) {
      throw new Error(`Invalid audio ID: ${id}`)
    }

    await workspaceCore.addAudio(filePath, id, audioFilePath)
  } catch (err) {
    ShowError(`Failed to add audio: ${err}`)
  }
}

function handleNodeClick(data: TreeNode) {
  function checkDoubleClick(onEvent: () => void | Promise<void>) {
    nodeClickState.count++
    if (nodeClickState.preId && nodeClickState.count >= 2) {
      nodeClickState.curId = data.key
      nodeClickState.count = 0
      if (nodeClickState.curId === nodeClickState.preId) {
        // on double click
        onEvent()
        nodeClickState.curId = null
        nodeClickState.preId = null
        clearTimeout(nodeClickState.timer)
        return
      }
    }
    nodeClickState.preId = data.key
    nodeClickState.timer = window.setTimeout(() => {
      //300ms内没有第二次点击就把第一次点击的清空
      nodeClickState.preId = null
      nodeClickState.count = 0
    }, 300)
  }

  checkDoubleClick(async () => {
    await infoPanelRef.value?.playAudio()
  })
}

function handleDeleteNode(data: TreeNode) {
  console.debug('handleDeleteNode', data)
  const filePath = data.key as string
  workspaceCore.closeFile(filePath)
}

async function handleImportAudioViaDialog(uniqueId: string) {
  const selected = await openDialog({
    filters: [
      {
        name: 'Audio',
        extensions: TargetFormatList,
      },
    ],
    multiple: false,
    directory: false,
  })
  if (selected) {
    try {
      await workspaceCore.importAudio(uniqueId, selected)
    } catch (err) {
      ShowError(`Failed to import audio: ${err}`)
    }
  }
}

const menuItems = [
  { title: 'Open File', icon: 'mdi-folder-open', action: handleOpenFileDialog },
  { title: 'Export', icon: 'mdi-export', action: handleExport },
]

interface ContextMenuItem {
  show: (data: TreeNode | null) => boolean
  icon: string
  label: string
  value: string
  action: (data: TreeNode | null) => void
}

// 右键菜单项数据驱动配置
const contextMenuItems = [
  // universal
  {
    show: () => true,
    icon: 'mdi-content-copy',
    label: 'Copy ID',
    value: 'copy-id',
    action: (data: TreeNode | null) => {
      if (!data) return
      if (data.type === 'Source') {
        const node = workspace.flattenNodeMap[data.key]
        if (!node) return
        writeTextToClipboard(node.data.id.toString())
      } else {
        writeTextToClipboard(data.key.toString())
      }
    },
  },
  // bnk & pck
  {
    show: (data: TreeNode | null) => ['bnk', 'pck'].includes(data?.type ?? ''),
    icon: 'mdi-delete',
    label: 'Close',
    value: 'close',
    action: (data: TreeNode | null) => handleDeleteNode(data as TreeNode),
  },
  {
    show: (data: TreeNode | null) => ['bnk', 'pck'].includes(data?.type ?? ''),
    icon: 'mdi-download',
    label: 'Dump All .wem',
    value: 'dump-all-wem',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleDumpFile(String(data.key), 'wem')
    },
  },
  {
    show: (data: TreeNode | null) => ['bnk', 'pck'].includes(data?.type ?? ''),
    icon: 'mdi-transfer-down',
    label: 'Dump All .wav',
    value: 'dump-all-wav',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleDumpFile(String(data.key), 'wav')
    },
  },
  // bnk
  {
    show: (data: TreeNode | null) => data?.type === 'bnk',
    icon: 'mdi-plus',
    label: 'Add Audio',
    value: 'add-audio-bnk',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleAddAudio(String(data.key))
    },
  },
  {
    show: (data: TreeNode | null) => data?.icon === 'mdi-file-music',
    icon: 'mdi-import',
    label: 'Import Audio',
    value: 'import-audio',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleImportAudioViaDialog(data.key.toString())
    },
  },
  {
    show: (data: TreeNode | null) => data?.icon === 'mdi-file-music',
    icon: 'mdi-download',
    label: 'Dump .wem',
    value: 'dump-wem',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleDumpAudio(data.key.toString(), 'wem')
    },
  },
  {
    show: (data: TreeNode | null) => data?.icon === 'mdi-file-music',
    icon: 'mdi-transfer-down',
    label: 'Dump .wav',
    value: 'dump-wav',
    action: async (data: TreeNode | null) => {
      if (!data) return
      await handleDumpAudio(data.key.toString(), 'wav')
    },
  },
]
</script>

<template>
  <div class="app-container">
    <div class="top-bar">
      <div class="top-bar-left">
        <v-menu>
          <template v-slot:activator="{ props }">
            <v-btn
              icon="mdi-menu"
              density="comfortable"
              variant="text"
              v-bind="props"
            >
            </v-btn>
          </template>
          <v-list>
            <v-list-item
              v-for="(item, index) in menuItems"
              :key="index"
              :value="index"
              @click="item.action"
            >
              <v-list-item-title>
                <v-icon
                  v-if="item.icon"
                  class="mr-2"
                  >{{ item.icon }}</v-icon
                >
                <span>{{ item.title }}</span>
              </v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </div>
      <div class="top-bar-right">
        <v-icon class="theme-icon">{{
          isDark ? 'mdi-weather-night' : 'mdi-weather-sunny'
        }}</v-icon>
        <v-switch
          v-model="isDark"
          hide-details
          density="comfortable"
          class="theme-switch ma-0 pa-0"
        />
        <v-btn
          icon="mdi-github"
          density="comfortable"
          variant="text"
          @click="() => openUrl('https://github.com/eigeen/mhws-sound-modder')"
        />
      </div>
    </div>

    <Toolbar
      v-model:is-search-expanded="isSearchExpanded"
      v-model:search-keyword="searchKeyword"
      :search-source="searchSource"
      @search-focus="handleSearchFocus"
    />

    <SplitPanel
      class="main-content"
      v-model:left-width="splitPanel.left"
      v-model:right-width="splitPanel.right"
      left-min-width="300px"
    >
      <template #left>
        <div class="tree-container">
          <DragOverTree
            ref="dragTreeRef"
            v-model:selected="workspace.selectedKey"
            :data="workspace.visualTree"
            @drop="handleDrop"
            @node-click="handleNodeClick"
          >
            <!-- 数据驱动右键菜单 -->
            <template v-slot:contextmenu="props">
              <v-list density="compact">
                <v-list-item
                  v-for="(item, index) in contextMenuItems.filter(
                    (item: ContextMenuItem) => item.show(props.data)
                  )"
                  :key="item.value"
                  :value="item.value"
                  :title="item.label"
                  @click="item.action(props.data)"
                >
                  <template v-slot:title>
                    <v-icon class="mr-2">{{ item.icon }}</v-icon>
                    <span>{{ item.label }}</span>
                  </template>
                </v-list-item>
              </v-list>
            </template>
          </DragOverTree>
        </div>
      </template>

      <template #right>
        <!-- Focused tree node details -->
        <div class="info-panel">
          <InfoPanel
            ref="infoPanelRef"
            v-model="workspace.selectedNode"
          ></InfoPanel>
        </div>
      </template>
    </SplitPanel>
  </div>
</template>

<style lang="scss" scoped>
.top-bar {
  height: 48px;
  background-color: transparent;
  padding: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.top-bar-left {
  display: flex;
  align-items: center;
}

.top-bar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.theme-switch {
  width: 60px;
  margin-right: -8px !important;
}

.theme-icon {
  opacity: 0.9;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(0, 0, 0, 0.12);
}

.toolbar-left {
  flex: 1;
  max-width: 300px;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-expanded {
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap; /* 防止文本换行 */
}

.search-input {
  width: 200px;
  flex-shrink: 0; /* 禁止压缩 */
}

.search-controls {
  display: flex;
  align-items: center;
  gap: 4px;
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.875rem;
}

.search-count {
  margin: 0 4px;
}

.app-container {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 25px);
}

.main-content {
  flex: 1;
  min-height: 0;
}

.tree-container,
.info-panel {
  height: 100%;
  overflow-y: auto;
}

.tree-container {
  padding: 1rem 0 1rem 0.5rem;
}

.info-panel {
  padding: 1rem;
}
</style>
