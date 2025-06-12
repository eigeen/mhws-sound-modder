<script lang="ts" setup>
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { computed, reactive, ref } from 'vue'
import { Bnk } from '@/libs/bnk'
import { Pck } from '@/libs/pck'
import { ShowInfo } from '@/utils/message'

type WorkspaceFile = BnkFile | PckFile

interface Workspace {
  files: WorkspaceFile[]
}

interface File<T> {
  type: 'bnk' | 'pck'
  data: T
  defaultData: any
  modifiedMap: { [key: string]: boolean }
}

interface BnkFile extends File<Bnk> {
  type: 'bnk'
}

interface PckFile extends File<Pck> {
  type: 'pck'
}

const workspace = reactive<Workspace>({ files: [] })
const splitPanel = reactive({
  left: 5,
  right: 5,
})

const workspaceVisualTree = computed(() => {
  return workspace.files
    .map((file) => {
      if (file.type === 'bnk') {
        const root: TreeNode = {
          label: file.data.name,
          key: file.data.filePath,
          children: [],
        }
        const segmentTree = file.data.getSegmentTree()
        console.debug('segmentTree', segmentTree)

        root.children = segmentTree.nodes
          .map((node) => {
            if (node.type === 'MusicSegment') {
              return {
                label: `Segment ${node.id}`,
                key: node.id,
                icon: 'mdi-segment',
                children: node.children.map((node) => {
                  return {
                    label: `Track ${node.id}`,
                    key: node.id,
                    icon: 'mdi-waveform',
                    children: node.playlist
                      .map((item) => {
                        if (item.type === 'Source') {
                          return {
                            label: `${item.id}.wem`,
                            key: Number(`${item.id}`), // idk why item.id.value is undefined
                            icon: 'mdi-file-music',
                            children: [],
                          }
                        } else {
                          return null
                        }
                      })
                      .filter((item) => item !== null) as TreeNode[],
                  }
                }),
              }
            } else {
              return null
            }
          })
          .filter((node) => node !== null) as TreeNode[]
        return root
      }
    })
    .filter((node) => node !== null) as TreeNode[]
})

const menuItems = [
  { title: 'Open File', icon: 'mdi-folder-open', action: handleOpenFileDialog },
]

async function handleOpenFileDialog() {
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
  console.log('Selected files:', selected)

  for (const filePath of selected) {
    if (workspace.files.some((file) => file.data.filePath === filePath)) {
      ShowInfo(`File already opened: ${filePath}`)
      continue
    }

    const bnk = await Bnk.load(filePath)
    const file: BnkFile = {
      type: 'bnk',
      data: bnk,
      defaultData: null,
      modifiedMap: {},
    }
    workspace.files.push(file)
  }
}

function handleDrop(event: DropEvent) {
  console.log(event)
}

function handleNodeClick(node: TreeNode) {
  console.log(node)
}
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

    <SplitPanel
      v-model:left-width="splitPanel.left"
      v-model:right-width="splitPanel.right"
      class="main-content"
    >
      <template #left>
        <div class="tree-container">
          <DragOverTree
            :data="workspaceVisualTree"
            @node-click="handleNodeClick"
            @drop="handleDrop"
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
                    value="rename"
                    title="重命名"
                    @click="console.log('Rename', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-rename-box</v-icon>
                      <span>重命名</span>
                    </template>
                  </v-list-item>
                  <v-list-item
                    value="delete"
                    @click="console.log('Delete', props.data)"
                  >
                    <template v-slot:title>
                      <v-icon class="mr-2">mdi-delete</v-icon>
                      <span>删除</span>
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
          <InfoPanel></InfoPanel>
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

.info-panel {
  padding: 16px;
}
</style>
