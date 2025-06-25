<script lang="ts" setup>
import InfoPanel from '@/components/InfoPanel.vue'
import {
  open as openDialog,
  save as saveDialog,
} from '@tauri-apps/plugin-dialog'
import { openUrl } from '@tauri-apps/plugin-opener'
import { useDark, useToggle } from '@vueuse/core'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { computed, type Reactive, reactive, ref, toRef, watch } from 'vue'
import { Bnk, type HircNode } from '@/libs/bnk'
import { ShowError, ShowInfo, ShowWarn } from '@/utils/message'
import type DragOverTree from '@/components/DragOverTree.vue'
import type { SearchResult, SearchSource } from '@/components/Toolbar.vue'
import { useWorkspaceStore } from '@/stores/workspace'
import type {
  BnkFile,
  DataNode,
  PckFile,
  ReplaceItem,
} from '@/stores/workspace'
import { getExtension, getFileStem } from '@/utils/path'
import {
  TargetFormatList,
  Transcoder,
  type TargetFormat,
} from '@/libs/transcode'
import { SourceManager } from '@/libs/source'
import { writeText as writeTextToClipboard } from '@tauri-apps/plugin-clipboard-manager'
import { arrayCompare, readFileMagic } from '@/utils'
import { Pck } from '@/libs/pck'
import { BnkApi } from '@/api/tauri'
import { PckApi } from '@/api/tauri'
import { LocalDir } from '@/libs/localDir'
import { mkdir, copyFile, exists, remove } from '@tauri-apps/plugin-fs'
import { join } from '@tauri-apps/api/path'
import { exportLogger } from '@/utils/logger'
import { useStatusStore } from '@/stores/status'

const workspace = useWorkspaceStore()
const sourceManager = SourceManager.getInstance()
const isDark = useDark()
const statusStore = useStatusStore()

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
        root.type = 'bnk'
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
    // 启动日志记录（不指定目录）
    exportLogger.start()
    exportLogger.info('Export process started')

    const filesToExport = new Map<string, Reactive<BnkFile | PckFile>>() // filePath -> file

    // 1. 检查是否有HIRC被更改
    exportLogger.debug('Checking for dirty HIRC nodes')
    Object.entries(workspace.flattenNodeMap).forEach(([uniqueId, node]) => {
      if (node.dirty) {
        const file = node.belongToFile
        filesToExport.set(file.data.filePath, file)
        exportLogger.debug(
          `Found dirty node, need to export file: ${file.data.name}`,
          { nodeId: uniqueId, nodeType: node.data?.type }
        )
      }
    })

    // 2. 检查是否有音源被替换
    exportLogger.debug('Checking for replaced audio sources')
    Object.entries(workspace.replaceList).forEach(([uniqueId, replaceItem]) => {
      const node = workspace.flattenNodeMap[uniqueId]
      if (node) {
        filesToExport.set(node.belongToFile.data.filePath, node.belongToFile)
        exportLogger.debug(
          `Found replaced audio source, need to export file: ${node.belongToFile.data.name}`,
          {
            uniqueId,
            replaceItem: { id: replaceItem.id, path: replaceItem.path },
          }
        )
      }
    })

    if (filesToExport.size === 0) {
      exportLogger.warn('No files to export')
      ShowInfo('No files to export')
      exportLogger.terminate()
      return
    }

    exportLogger.info(`Found ${filesToExport.size} files to export`, {
      fileNames: Array.from(filesToExport.values()).map((f) => f.data.name),
    })

    // 选择导出目录
    exportLogger.debug('Opening directory selection dialog')
    const exportDir = await openDialog({
      directory: true,
      multiple: false,
    })
    if (!exportDir) {
      exportLogger.warn('User cancelled export directory selection')
      exportLogger.terminate()
      return
    }

    // 设置日志保存目录
    exportLogger.setLogDirectory(exportDir)
    exportLogger.info(`Export directory selected: ${exportDir}`)

    // 导出每个文件
    let successCount = 0
    let errorCount = 0

    for (const [filePath, file] of filesToExport) {
      try {
        exportLogger.info(`Starting to export file: ${file.data.name}`, {
          filePath,
          fileType: file.type,
        })

        const exportPath = await join(exportDir, file.data.name)

        if (file.type === 'bnk') {
          // BnkFile
          const bnk = file.data as Bnk
          exportLogger.debug(`Processing BNK file: ${bnk.getLabel()}`)

          // 如果bnk包含数据，则替换音源，否则直接导出
          let tempSourceDir: string | undefined
          if (bnk.hasSection('Data')) {
            exportLogger.debug(
              'BNK file contains data section, need to process audio source replacement'
            )

            // 获取所有音源节点的唯一ID
            const allSourceNodes = Object.entries(
              workspace.flattenNodeMap
            ).filter(
              ([_, node]) =>
                node.belongToFile.data === bnk && node.data.type === 'Source'
            )
            exportLogger.debug(
              `Found ${allSourceNodes.length} audio source nodes`
            )

            // 收集替换的音源
            const replacedSources = allSourceNodes
              .map(([uniqueId, _node]) => workspace.replaceList[uniqueId])
              .filter((item): item is ReplaceItem => item !== undefined)

            exportLogger.info(
              `Need to replace ${replacedSources.length} audio sources`,
              {
                replacedSourceIds: replacedSources.map((s) => s.id),
              }
            )

            // 创建临时目录存放替换的音源
            const tempDir = await LocalDir.getTempDir()
            tempSourceDir = await join(tempDir, 'export', bnk.getLabel())
            if (await exists(tempSourceDir)) {
              await remove(tempSourceDir, { recursive: true })
              exportLogger.debug('Cleaned up existing temporary directory')
            }
            await mkdir(tempSourceDir, { recursive: true })
            exportLogger.debug(`Created temporary directory: ${tempSourceDir}`)

            // 先提取所有音源
            exportLogger.debug('Starting to extract BNK data')
            await bnk.extractData(tempSourceDir)
            exportLogger.debug('BNK data extraction completed')

            // 复制替换的音源到临时目录，覆盖已提取的内容
            for (const source of replacedSources) {
              const sourcePath = source.path
              const targetPath = await join(tempSourceDir, `${source.id}.wem`)
              await copyFile(sourcePath, targetPath)
              exportLogger.debug(`Replaced audio source: ${source.id}.wem`, {
                sourcePath,
                targetPath,
              })
            }
          } else {
            exportLogger.debug(
              'BNK file does not contain data section, exporting directly'
            )
          }

          // 保存BNK文件
          exportLogger.debug('Starting to save BNK file')
          await BnkApi.saveFile(exportPath, bnk.data, tempSourceDir)
          exportLogger.info(`BNK file saved successfully: ${exportPath}`)
        } else if (file.type === 'pck') {
          const pck = file.data as Pck
          exportLogger.debug(`Processing PCK file: ${pck.getLabel()}`)

          // 如果PCK包含数据，则替换音源，否则直接导出
          let tempSourceDir: string | undefined
          if (pck.hasData()) {
            exportLogger.debug(
              'PCK file contains data, need to process audio source replacement'
            )

            // 获取所有音源节点的唯一ID
            const allSourceNodes = Object.entries(
              workspace.flattenNodeMap
            ).filter(
              ([_, node]) =>
                node.belongToFile.data === pck && node.data.type === 'Source'
            )
            exportLogger.debug(
              `Found ${allSourceNodes.length} audio source nodes`
            )

            // 收集替换的音源
            const replacedSources = allSourceNodes
              .map(([uniqueId, _node]) => workspace.replaceList[uniqueId])
              .filter((item): item is ReplaceItem => item !== undefined)

            exportLogger.info(
              `Need to replace ${replacedSources.length} audio sources`,
              {
                replacedSourceIds: replacedSources.map((s) => s.id),
              }
            )

            // 创建临时目录存放替换的音源
            const tempDir = await LocalDir.getTempDir()
            tempSourceDir = await join(tempDir, 'export', pck.getLabel())
            if (await exists(tempSourceDir)) {
              await remove(tempSourceDir, { recursive: true })
              exportLogger.debug('Cleaned up existing temporary directory')
            }
            await mkdir(tempSourceDir, { recursive: true })
            exportLogger.debug(`Created temporary directory: ${tempSourceDir}`)

            // 先提取PCK内容
            exportLogger.debug('Starting to extract PCK data')
            await pck.extractData(tempSourceDir)
            exportLogger.debug('PCK data extraction completed')

            // 复制替换的音源到临时目录,覆盖已提取的内容
            for (const source of replacedSources) {
              const sourcePath = source.path
              const targetPath = await join(tempSourceDir, `${source.id}.wem`)
              await copyFile(sourcePath, targetPath)
              exportLogger.debug(`Replaced audio source: ${source.id}.wem`, {
                sourcePath,
                targetPath,
              })
            }
          } else {
            exportLogger.debug(
              'PCK file does not contain data, exporting directly'
            )
          }

          // 保存PCK文件
          exportLogger.debug('Starting to save PCK file')
          await PckApi.saveFile(pck.header, exportPath, tempSourceDir)
          exportLogger.info(`PCK file saved successfully: ${exportPath}`)
        }

        successCount++
        exportLogger.info(`File export completed: ${file.data.name}`)
      } catch (err) {
        errorCount++
        exportLogger.error(`Failed to export file: ${file.data.name}`, {
          error: err,
          filePath,
        })
      }
    }

    // 结束日志记录并保存文件
    await exportLogger.end()

    const finalMessage = `Export completed: ${successCount} files succeeded, ${errorCount} files failed`
    if (errorCount > 0) {
      ShowWarn(finalMessage)
    } else {
      ShowInfo(finalMessage)
    }
  } catch (err) {
    exportLogger.error('Export process encountered an error', { error: err })
    await exportLogger.end()
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

async function importAudio(uniqueId: string, filePath: string) {
  const node = workspace.flattenNodeMap[uniqueId]
  if (!node) {
    ShowError('Node not found')
    return
  }
  if (node.data.type !== 'Source') {
    ShowError('Audio import is only supported for source nodes.')
    return
  }

  // check if file is audio file
  const ext = getExtension(filePath)
  if (!ext || !AUDIO_EXTS[ext]) {
    ShowError(`Unsupported file type: ${ext ?? '<no extension>'}`)
    return
  }

  let outputPath: string
  // transcode if not wem
  if (ext === 'wem') {
    // copy to temp dir
    const tempDir = await LocalDir.getTempDir()
    outputPath = await join(tempDir, `${node.data.id}.wem`)
    await copyFile(filePath, outputPath)
  } else {
    try {
      outputPath = await Transcoder.getInstance().transcode(filePath, 'wem')
    } catch (err) {
      ShowError(`Failed to transcode: ${err}`)
      return
    }
    console.debug('transcode outputPath', outputPath)
  }

  // add to replace list
  // get source id from unique id
  const sourceId = node.data.id
  workspace.replaceList[uniqueId] = {
    type: 'audio',
    id: sourceId,
    uniqueId,
    path: outputPath,
  }
  console.info(
    `replace audio successfully: ${sourceId} -> ${outputPath} (from uniqueId: ${uniqueId})`
  )

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

async function handleDrop(event: DropEvent) {
  console.debug('handleDrop event', event)
  const { key, paths } = event

  // currently we only support single file drop
  // multiple file drop will be supported in the future
  await importAudio(key, paths[0])
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
    await importAudio(uniqueId, selected)
  }
}

const menuItems = [
  { title: 'Open File', icon: 'mdi-folder-open', action: handleOpenFileDialog },
  { title: 'Export', icon: 'mdi-export', action: handleExport },
]

// 右键菜单项数据驱动配置
const contextMenuItems = [
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
            :data="workspaceVisualTree"
            @drop="handleDrop"
            @node-click="handleNodeClick"
          >
            <!-- 数据驱动右键菜单 -->
            <template v-slot:contextmenu="props">
              <v-list density="compact">
                <v-list-item
                  v-for="(item, index) in contextMenuItems.filter((item) =>
                    item.show(props.data)
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
