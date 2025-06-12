<script lang="ts" setup>
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { computed, reactive, ref } from 'vue'
import { PckHeader } from '@/models/pck'
import { Bnk } from '@/libs/bnk'

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

interface PckFile extends File<PckHeader> {
  type: 'pck'
}

const workspace = reactive<Workspace>({ files: [] })

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
        console.log('segmentTree', segmentTree)
        root.children = segmentTree.nodes
          .map((node) => {
            if (node.type === 'MusicSegment') {
              return {
                label: `Segment ${node.id}`,
                key: node.id,
                children: node.children.map((node) => {
                  return {
                    label: `Track ${node.id}`,
                    key: node.id,
                    children: node.playlist
                      .map((item) => {
                        if (item.type === 'Source') {
                          return {
                            label: `${item.id}.wem`,
                            key: Number(`${item.id}`), // idk why item.id.value is undefined
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

const data: TreeNode[] = [
  {
    label: 'Level one 1',
    key: 'Level one 1',
    children: [
      {
        label: 'Level two 1-1',
        key: 'Level two 1-1',
        children: [
          {
            label: 'Level three 1-1-1',
            key: 'Level three 1-1-1',
          },
        ],
      },
    ],
  },
  {
    label: 'Level one 2',
    key: 'Level one 2',
    children: [
      {
        label: 'Level two 2-1',
        key: 'Level two 2-1',
        children: [
          {
            label: 'Level three 2-1-1',
            key: 'Level three 2-1-1',
          },
        ],
      },
      {
        label: 'Level two 2-2',
        key: 'Level two 2-2',
        children: [
          {
            label: 'Level three 2-2-1',
            key: 'Level three 2-2-1',
          },
        ],
      },
    ],
  },
  {
    label: 'Level one 3',
    key: 'Level one 3',
    children: [
      {
        label: 'Level two 3-1',
        key: 'Level two 3-1',
        children: [
          {
            label: 'Level three 3-1-1',
            key: 'Level three 3-1-1',
          },
        ],
      },
      {
        label: 'Level two 3-2',
        key: 'Level two 3-2',
        children: [
          {
            label: 'Level three 3-2-1',
            key: 'Level three 3-2-1',
          },
        ],
      },
    ],
  },
]
</script>

<template>
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

  <DragOverTree
    :data="workspaceVisualTree"
    @node-click="handleNodeClick"
    @drop="handleDrop"
  >
    <template v-slot:contextmenu="props">
      <v-list density="compact">
        <v-list-item
          value="rename"
          title="重命名"
          @click="console.log('Rename', props.data)"
        >
        </v-list-item>
        <v-list-item
          value="delete"
          title="删除"
          @click="console.log('Delete', props.data)"
        >
        </v-list-item>
      </v-list>
    </template>
  </DragOverTree>
</template>

<style lang="scss" scoped>
.top-bar {
  height: 48px;
  background-color: transparent;
  // z-index: 100;
  padding: 8px;
}
</style>
