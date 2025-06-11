<script lang="ts" setup>
import { open as openDialog } from '@tauri-apps/plugin-dialog'
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue'
import { ref, onMounted, onBeforeUnmount } from 'vue'

const showMenu = ref(false)
const menuButtonRef = ref<HTMLElement | null>(null)

const menuItems = [
  { title: 'Open File', icon: 'mdi-folder-open', action: openFileDialog },
]

function handleClickOutside(event: MouseEvent) {
  if (
    menuButtonRef.value &&
    !menuButtonRef.value.contains(event.target as Node)
  ) {
    showMenu.value = false
  }
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})

async function openFileDialog() {
  const selected = await openDialog({
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
  })
  console.log('Selected files:', selected)
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
    :data="data"
    @node-click="handleNodeClick"
    @drop="handleDrop"
  ></DragOverTree>
</template>

<style lang="scss" scoped>
.top-bar {
  height: 48px;
  background-color: transparent;
  // z-index: 100;
  padding: 8px;
}
</style>
