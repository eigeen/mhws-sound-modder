<script lang="ts" setup>
import { ElTree } from 'element-plus'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { type DragDropEvent } from '@tauri-apps/api/window'
import { type Event } from '@tauri-apps/api/event'
import { ref, onMounted } from 'vue'

const DRAG_OVER_CLASS = 'el-tree-custom--drag-over'
const CUSTOM_DATA_CLASS = 'el-tree-custom--data'

export interface TreeNode {
  label: string
  key: string
  children?: TreeNode[]
}

export interface DropEvent {
  key: string
  paths: string[]
}

defineProps<{
  data: TreeNode[]
}>()

defineModel('selected', { required: false })

const emit = defineEmits<{
  drop: [event: DropEvent]
  nodeClick: [data: TreeNode]
}>()

const dragOverNodeKey = ref<string | null>(null)

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
  // emit drop event
  emit('drop', {
    key: dragOverNodeKey.value ?? '',
    paths: (event.payload as { paths: string[] }).paths,
  })

  dragOverNodeKey.value = null
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

const propsName = {
  children: 'children',
  label: 'label',
}
</script>

<template>
  <el-tree
    style="max-width: 600px"
    :data="data"
    :props="propsName"
    node-key="key"
    :expand-on-click-node="false"
    :current-node-key="selected"
    @node-click="(node) => emit('nodeClick', node)"
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
