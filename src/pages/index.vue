<script lang="ts" setup>
import InfoPanel from '@/components/InfoPanel.vue'
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { computed, Reactive, reactive, ref, toRef, watch } from 'vue'
import { Bnk, HircNode } from '@/libs/bnk'
import { ShowError, ShowInfo } from '@/utils/message'
import type DragOverTree from '@/components/DragOverTree.vue'
import { SearchResult, SearchSource } from '@/components/Toolbar.vue'
import {
  BnkFile,
  DataNode,
  PckFile,
  ReplaceItem,
  useWorkspaceStore,
} from '@/stores/workspace'
import { getExtension } from '@/utils/path'
import { Transcoder } from '@/libs/transcode'
import { SourceManager } from '@/libs/source'
import { writeText as writeTextToClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { arrayCompare, readFileMagic } from '@/utils'
import { Pck } from '@/libs/pck'
import { BnkApi } from '@/api/tauri'
import { PckApi } from '@/api/tauri'
import { LocalDir } from '@/libs/localDir'
import { mkdir, copyFile, exists, remove } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'

const workspace = useWorkspaceStore()
const sourceManager = SourceManager.getInstance()

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

const selectedDataNode = computed<DataNode | null>(() => {
  if (!workspace.selectedKey) {
    return null
  }

  const targetNode = workspace.flattenNodeMap[workspace.selectedKey]
  if (!targetNode) {
    console.info(
      'Selected key not found in flatten map:',
      workspace.selectedKey
    )
    return null
  }
  return targetNode
})

const workspaceVisualTree = ref<TreeNode[]>([])

// Watch and update workspaceVisualTree
watch(
  workspace.files,
  () => {
    console.debug('workspaceVisualTree recompute')
    function getDirtyRef(id: string | number) {
      return (
        (toRef(workspace.flattenNodeMap[id], 'dirty') as unknown as boolean) ??
        false
      )
    }
    function iterNodes(parent: TreeNode, node: HircNode) {
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
            dirty: getDirtyRef(node.id),
            children: [],
          }
          node.children.forEach((child) => {
            iterNodes(childNode, child)
          })
          parent.children.push(childNode)
          break
        case 'MusicTrack':
          childNode = {
            label: `Track ${node.id}`,
            key: node.id,
            icon: 'mdi-waveform',
            dirty: getDirtyRef(node.id),
            children: [],
          }
          const playlist = node.playlist
            .map((item) => {
              if (item.elementType === 'Source') {
                return {
                  label: `${item.element_id}.wem`,
                  key: item.id,
                  icon: 'mdi-file-music',
                  dirty: getDirtyRef(item.id),
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

    const result = workspace.files.map((file) => {
      const root: TreeNode = {
        label: file.data.name,
        key: file.data.filePath,
        children: [],
      }
      if (file.type === 'bnk') {
        // build segment tree
        file.data.getSegmentTree().nodes.forEach((node) => {
          iterNodes(root, node)
        })
        // collect unmanaged wems
        const unmanagedSources = file.data.getUnmanagedSources()
        unmanagedSources.forEach((elementId) => {
          const uniqueId = `${file.data.getLabel()}-${elementId}`
          root.children!.push({
            label: `${elementId}.wem`,
            key: uniqueId,
            icon: 'mdi-file-music',
            dirty: getDirtyRef(uniqueId),
          })
        })
      } else if (file.type === 'pck') {
        if (!file.data.hasData()) {
          root.label = `${file.data.name} (no data)`
        }
        file.data.header.wem_entries.forEach((entry) => {
          const uniqueId = `${file.data.getLabel()}-${entry.id}`
          root.children!.push({
            label: `${entry.id}.wem`,
            key: uniqueId,
            icon: 'mdi-file-music',
            dirty: getDirtyRef(uniqueId),
          })
        })
      }
      return root
    })

    workspaceVisualTree.value = result
  },
  { deep: false }
)

// const workspaceVisualTree = computed<TreeNode[]>(() => {

// })

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
  workspaceVisualTree.value.forEach((node) => {
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
  let tempNodes: TreeNode[] = workspaceVisualTree.value
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

    const filesToAdd: Array<BnkFile | PckFile> = []
    for (const filePath of selected) {
      const isDuplicate =
        workspace.files.some((file) => file.data.filePath === filePath) ||
        filesToAdd.some((file) => file.data.filePath === filePath)
      if (isDuplicate) {
        ShowInfo(`File already opened: ${filePath}`)
        continue
      }

      let file: BnkFile | PckFile
      const magic = await readFileMagic(filePath)
      if (arrayCompare(magic, [0x42, 0x4b, 0x48, 0x44])) {
        // BKHD
        const bnk = await Bnk.load(filePath)
        file = {
          type: 'bnk',
          data: bnk,
        }
      } else if (arrayCompare(magic, [0x41, 0x4b, 0x50, 0x4b])) {
        // AKPK
        const pck = await Pck.load(filePath)
        file = {
          type: 'pck',
          data: pck,
        }
      } else {
        ShowError(`Unsupported file type, ${filePath}`)
        continue
      }
      filesToAdd.push(file)
    }

    // Add to workspace
    if (filesToAdd.length > 0) {
      workspace.files.push(...filesToAdd)
    }
  } catch (err) {
    ShowError(`Failed to open file: ${err}`)
  }
}

async function handleExport() {
  try {
    const filesToExport = new Map<string, Reactive<BnkFile | PckFile>>() // filePath -> file
    // 1. 检查是否有HIRC被更改
    Object.values(workspace.flattenNodeMap).forEach((node) => {
      if (node.dirty) {
        const file = node.belongToFile
        filesToExport.set(file.data.filePath, file)
      }
    })
    // 2. 检查是否有音源被替换
    Object.entries(workspace.replaceList).forEach(([uniqueId, replaceItem]) => {
      const node = workspace.flattenNodeMap[uniqueId]
      if (node) {
        filesToExport.set(node.belongToFile.data.filePath, node.belongToFile)
      }
    })

    if (filesToExport.size === 0) {
      ShowInfo('No files to export')
      return
    }

    console.info('filesToExport', filesToExport)

    // 选择导出目录
    const exportDir = await openDialog({
      directory: true,
      multiple: false,
    })
    if (!exportDir) return

    // 导出每个文件
    for (const [_, file] of filesToExport) {
      const exportPath = await join(exportDir, file.data.name)

      if (file.type === 'bnk') {
        // BnkFile
        const bnk = file.data as Bnk

        // 如果bnk包含数据，则替换音源，否则直接导出
        let tempSourceDir: string | undefined
        if (bnk.hasSection('Data')) {
          // 获取所有音源节点的唯一ID
          const allSourceNodes = Object.entries(workspace.flattenNodeMap)
            .filter(([_, node]) => node.belongToFile.data === bnk && node.data.type === 'Source')
          // 收集替换的音源
          const replacedSources = allSourceNodes
            .map(([uniqueId, node]) => workspace.replaceList[uniqueId])
            .filter((item): item is ReplaceItem => item !== undefined)
          // 创建临时目录存放替换的音源
          const tempDir = await LocalDir.getTempDir()
          tempSourceDir = await join(tempDir, 'export', bnk.getLabel())
          if (await exists(tempSourceDir)) {
            await remove(tempSourceDir, { recursive: true })
          }
          await mkdir(tempSourceDir, { recursive: true })

          // 先提取所有音源
          await bnk.extractData(tempSourceDir)
          // 复制替换的音源到临时目录，覆盖已提取的内容
          for (const source of replacedSources) {
            const sourcePath = source.path
            const targetPath = await join(tempSourceDir, `${source.id}.wem`)
            await copyFile(sourcePath, targetPath)
          }
        }

        // 保存BNK文件
        await BnkApi.saveFile(exportPath, bnk.data, tempSourceDir)
      } else if (file.type === 'pck') {
        const pck = file.data as Pck

        // 如果PCK包含数据，则替换音源，否则直接导出
        let tempSourceDir: string | undefined
        if (pck.hasData()) {
          // 获取所有音源节点的唯一ID
          const allSourceNodes = Object.entries(workspace.flattenNodeMap)
            .filter(([_, node]) => node.belongToFile.data === pck && node.data.type === 'Source')
          // 收集替换的音源
          const replacedSources = allSourceNodes
            .map(([uniqueId, node]) => workspace.replaceList[uniqueId])
            .filter((item): item is ReplaceItem => item !== undefined)

          // 创建临时目录存放替换的音源
          const tempDir = await LocalDir.getTempDir()
          tempSourceDir = await join(tempDir, 'export', pck.getLabel())
          if (await exists(tempSourceDir)) {
            await remove(tempSourceDir, { recursive: true })
          }
          await mkdir(tempSourceDir, { recursive: true })
          // 先提取PCK内容
          await pck.extractData(tempSourceDir)

          // 复制替换的音源到临时目录,覆盖已提取的内容
          for (const source of replacedSources) {
            const sourcePath = source.path
            const targetPath = await join(tempSourceDir, `${source.id}.wem`)
            await copyFile(sourcePath, targetPath)
          }
        }

        // 保存PCK文件
        await PckApi.saveFile(pck.header, exportPath, tempSourceDir)
      }
    }

    ShowInfo('Export completed')
  } catch (err) {
    ShowError(`Export failed: ${err}`)
  }
}

const AUDIO_EXTS: Record<string, boolean> = {
  wem: true,
  wav: true,
  ogg: true,
  flac: true,
  mp3: true,
  aac: true,
}

async function handleDrop(event: DropEvent) {
  console.debug('handleDrop event', event)
  const { key, paths } = event
  const node = workspace.flattenNodeMap[key]
  if (!node) {
    // not found in map, ignore
    console.info('drop key not found in map')
    return
  }
  // check if drop is valid
  if (!(node.data && node.data.type === 'Source')) {
    ShowError('Audio replace is only supported for source nodes.')
    return
  }

  // currently we only support single file drop
  // multiple file drop will be supported in the future
  const filePath = paths[0]
  // check if file is audio file
  const ext = getExtension(filePath)
  if (!ext || !AUDIO_EXTS[ext]) {
    ShowError(`Unsupported file type: ${ext ?? '<no extension>'}`)
  }

  // transcode
  let outputPath: string
  try {
    outputPath = await Transcoder.getInstance().transcode(filePath, 'wem')
  } catch (err) {
    ShowError(`Failed to transcode: ${err}`)
    return
  }
  console.debug('transcode outputPath', outputPath)

  // add to replace list
  // get source id from unique id
  const sourceId = node.data.id
  workspace.replaceList[key] = {
    type: 'audio',
    id: sourceId,
    uniqueId: key,
    path: outputPath,
  }
  console.info(
    `replace audio successfully: ${sourceId} -> ${outputPath} (from key:${key})`
  )
  console.debug('node:', node)

  // // apply parent linked changes
  // let loopGuard = 32
  // let parentNode: DataNode | null = node
  // while (node.parent && loopGuard > 0) {
  //   loopGuard--
  //   parentNode = node.parent
  //   switch (parentNode.data.type) {
  //     case 'MusicTrack':
  //       // TODO: update src duration
  //       break
  //     case 'MusicSegment':
  //       // nothing
  //       break
  //   }
  // }
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
  workspace.removeFile(filePath)
}

const menuItems = [
  { title: 'Open File', icon: 'mdi-folder-open', action: handleOpenFileDialog },
  { title: 'Export', icon: 'mdi-export', action: handleExport },
]
</script>

<template>
  <div class="app-container">
    <div class="top-bar">
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
            :data="workspaceVisualTree"
            @drop="handleDrop"
            @node-click="handleNodeClick"
          >
            <!-- Right click context menu settings -->
            <template v-slot:contextmenu="props">
              <v-list density="compact">
                <template v-if="props.data?.icon === 'mdi-segment'">
                  <v-list-item
                    value="play-segment"
                    title="播放片段"
                    @click="console.log('Play segment', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-play</v-icon>
                      <span>播放片段</span>
                    </template>
                  </v-list-item>
                  <v-list-item
                    value="export-segment"
                    @click="console.log('Export segment', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-export</v-icon>
                      <span>导出片段</span>
                    </template>
                  </v-list-item>
                </template>

                <template v-else-if="props.data?.icon === 'mdi-waveform'">
                  <v-list-item
                    value="mute-track"
                    title="静音轨道"
                    @click="console.log('Mute track', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-volume-off</v-icon>
                      <span>静音轨道</span>
                    </template>
                  </v-list-item>
                  <v-list-item
                    value="solo-track"
                    @click="console.log('Solo track', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-account-music</v-icon>
                      <span>独奏轨道</span>
                    </template>
                  </v-list-item>
                </template>

                <template v-else-if="props.data?.icon === 'mdi-file-music'">
                  <v-list-item
                    value="extract-wem"
                    title="提取WEM文件"
                    @click="console.log('Extract WEM', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-download</v-icon>
                      <span>提取WEM文件</span>
                    </template>
                  </v-list-item>
                  <v-list-item
                    value="convert-wem"
                    @click="console.log('Convert WEM', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-file-convert</v-icon>
                      <span>转换WEM格式</span>
                    </template>
                  </v-list-item>
                </template>

                <template v-else>
                  <v-list-item
                    value="copy-id"
                    @click="
                      writeTextToClipboard(props.data?.key.toString() ?? '')
                    "
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-content-copy</v-icon>
                      <span>Copy ID</span>
                    </template>
                  </v-list-item>
                  <v-list-item
                    value="close"
                    @click="handleDeleteNode(props.data!)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-delete</v-icon>
                      <span>Close</span>
                    </template>
                  </v-list-item>
                </template>
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
            v-model="selectedDataNode"
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
  // z-index: 100;
  padding: 8px;
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
