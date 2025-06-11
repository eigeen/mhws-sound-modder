<script lang="ts" setup>
import { ElTree } from 'element-plus'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { type DragDropEvent } from '@tauri-apps/api/window'
import { type Event } from '@tauri-apps/api/event'
import { ref, onMounted } from 'vue'

const DRAG_OVER_CLASS = 'el-tree-custom--drag-over'
const CUSTOM_DATA_CLASS = 'el-tree-custom--data'

interface Tree {
  label: string
  children?: Tree[]
}
const dragOverNodeKey = ref<string | null>(null)
const selectedKey = ref<string>('')

const handleNodeClick = (data: Tree) => {
  console.log(data)
}

const isOverNode = (event: Event<DragDropEvent>, nodeEl: HTMLElement) => {
  if (event.payload.type === 'leave') return false

  const rect = nodeEl.getBoundingClientRect()
  const { x, y } = event.payload.position

  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom
}

const handleDragEvent = (event: Event<DragDropEvent>) => {
  const treeNodes = document.querySelectorAll('.el-tree-node__content')

  treeNodes.forEach((nodeEl) => {
    if (isOverNode(event, nodeEl as HTMLElement)) {
      nodeEl.classList.add(DRAG_OVER_CLASS)
      // get node key attribute
      const customDataDiv = nodeEl.querySelector(`.${CUSTOM_DATA_CLASS}`)
      if (customDataDiv) {
        const key = customDataDiv.getAttribute('data-key')
        dragOverNodeKey.value = key as string
      } else {
        console.warn('No key attribute found on node element')
      }
    } else {
      nodeEl.classList.remove(DRAG_OVER_CLASS)
    }
  })
}

const handleDrop = (event: Event<DragDropEvent>) => {
  console.log('Drop event:', event)
  console.log('dragOverNode:', dragOverNodeKey.value)
  if (dragOverNodeKey.value) {
    console.log('Dropped on node:', dragOverNodeKey.value)
    console.log('Dropped files:', (event.payload as { paths: string[] }).paths)
    dragOverNodeKey.value = null
  }

  // remove dragover class from all nodes
  const treeNodes = document.querySelectorAll('.el-tree-node__content')
  treeNodes.forEach((nodeEl) => {
    nodeEl.classList.remove(DRAG_OVER_CLASS)
  })
}

onMounted(() => {
  const unlisten = getCurrentWebview().onDragDropEvent((event) => {
    if (['enter', 'over', 'leave'].includes(event.payload.type)) {
      handleDragEvent(event)
    } else if (event.payload.type === 'drop') {
      handleDrop(event)
    }
  })

  return () => {
    unlisten.then((f) => f())
  }
})

const data: Tree[] = [
  {
    label: 'Level one 1',
    children: [
      {
        label: 'Level two 1-1',
        children: [
          {
            label: 'Level three 1-1-1',
          },
        ],
      },
    ],
  },
  {
    label: 'Level one 2',
    children: [
      {
        label: 'Level two 2-1',
        children: [
          {
            label: 'Level three 2-1-1',
          },
        ],
      },
      {
        label: 'Level two 2-2',
        children: [
          {
            label: 'Level three 2-2-1',
          },
        ],
      },
    ],
  },
  {
    label: 'Level one 3',
    children: [
      {
        label: 'Level two 3-1',
        children: [
          {
            label: 'Level three 3-1-1',
          },
        ],
      },
      {
        label: 'Level two 3-2',
        children: [
          {
            label: 'Level three 3-2-1',
          },
        ],
      },
    ],
  },
]

const defaultProps = {
  children: 'children',
  label: 'label',
}
</script>

<template>
  <el-tree
    style="max-width: 600px"
    :data="data"
    :props="defaultProps"
    :expand-on-click-node="false"
    :current-node-key="selectedKey"
    @node-click="handleNodeClick"
    highlight-current
  >
    <template #default="{ node, data }">
      <div
        class="el-tree-custom--data"
        :data-key="data.label"
      >
        <span>{{ data.label }}</span>
      </div>
    </template>
  </el-tree>
</template>

<style lang="scss">
.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content {
  background-color: rgba(135, 206, 235, 0.2);
  font-weight: bold;
}

.el-tree-custom--drag-over {
  background-color: rgba(255, 59, 134, 0.2) !important;
}
</style>

<style lang="scss" scoped></style>
