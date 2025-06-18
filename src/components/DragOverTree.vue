<script lang="ts" setup>
import { ElTree } from 'element-plus'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import { type DragDropEvent } from '@tauri-apps/api/window'
import { type Event } from '@tauri-apps/api/event'
import { ref, onMounted } from 'vue'
import type Node from 'element-plus/es/components/tree/src/model/node.mjs'

const DRAG_OVER_CLASS = 'el-tree-custom--drag-over'
const CUSTOM_DATA_CLASS = 'el-tree-custom--data'

export interface TreeNode {
  label: string
  key: string | number
  children?: TreeNode[]
  type?: string
  icon?: string
  dirty?: boolean
}

export interface DropEvent {
  key: string
  paths: string[]
}

defineProps<{
  data: TreeNode[]
}>()

const selected = defineModel('selected', { required: false })

const emit = defineEmits<{
  drop: [event: DropEvent]
  nodeClick: [data: TreeNode]
  nodeContextmenu: [
    event: PointerEvent,
    data: TreeNode,
    node: Node,
    component: any,
  ]
}>()

defineExpose({ setExpanded, focusNode })

const treeRef = ref<InstanceType<typeof ElTree>>()

const dragOverNodeKey = ref<string | null>(null)
const contextMenu = ref({
  show: false,
  x: 0,
  y: 0,
  data: null as TreeNode | null,
  component: null,
})
const defaultExpandIds = ref<(string | number)[]>([])

function setExpanded(key: string | number, value: boolean) {
  const node = treeRef.value?.store.nodesMap[key]
  if (node) {
    node.expanded = value
  }
}

function focusNode(key: string | number) {
  const node = treeRef.value?.store.nodesMap[key]
  if (node) {
    treeRef.value?.setCurrentNode(node, true)
  }
}

function handleContextMenu(
  event: PointerEvent,
  data: TreeNode,
  _node: any,
  component: any
) {
  contextMenu.value = {
    show: true,
    x: event.clientX,
    y: event.clientY,
    data,
    component,
  }
}

function handleCloseContextMenu() {
  contextMenu.value.show = false
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

// below is to keep the expansion state when tree node changes

function handleNodeExpand(data: TreeNode, _node: Node, _component: any) {
  // 保存当前展开的节点
  let flag = false
  defaultExpandIds.value.some((item) => {
    if (item === data.key) {
      // 判断当前节点是否存在， 存在不做处理
      flag = true
      return true
    }
  })
  if (!flag) {
    // 不存在则存到数组里
    defaultExpandIds.value.push(data.key)
  }
}

function handleNodeCollapse(data: TreeNode, _node: Node, _component: any) {
  // 删除当前关闭的节点
  defaultExpandIds.value.some((item, i) => {
    if (item === data.key) {
      defaultExpandIds.value.splice(i, 1)
    }
  })
  removeChildrenIds(data) // recursively remove children ids
}

function removeChildrenIds(data: TreeNode) {
  if (data.children) {
    data.children.forEach(function (item) {
      const index = defaultExpandIds.value.indexOf(item.key)
      if (index > 0) {
        defaultExpandIds.value.splice(index, 1)
      }
      removeChildrenIds(item)
    })
  }
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
  <!-- Tree -->
  <el-tree
    ref="treeRef"
    style="max-width: 600px"
    :data="data"
    :props="propsName"
    node-key="key"
    :expand-on-click-node="false"
    @node-click="(node) => emit('nodeClick', node)"
    @current-change="(data, _node) => (selected = data.key)"
    @node-contextmenu="
      (event, data, node, component) => {
        handleContextMenu(event, data, node, component)
        emit('nodeContextmenu', event, data, node, component)
      }
    "
    highlight-current
    :default-expanded-keys="defaultExpandIds"
    @node-expand="handleNodeExpand"
    @node-collapse="handleNodeCollapse"
  >
    <template #default="{ data }">
      <div
        class="el-tree-custom--data text-body-2-no-weight"
        :data-key="data.key"
      >
        <v-icon
          v-if="data.icon"
          color="primary"
          size="small"
          class="mr-1"
          >{{ data.icon }}</v-icon
        >
        <span :class="{ 'label-dirty': data.dirty }">{{ data.label }}</span>
      </div>
    </template>
  </el-tree>

  <!-- right click contextmenu on tree node -->
  <v-menu
    v-model="contextMenu.show"
    :target="[contextMenu.x, contextMenu.y]"
    absolute
    offset-y
    min-width="150px"
    close-on-click
    close-on-content-click
    @update:model-value="handleCloseContextMenu"
  >
    <slot
      name="contextmenu"
      v-bind="contextMenu"
    >
    </slot>
  </v-menu>
</template>

<style lang="scss">
.el-tree--highlight-current .el-tree-node.is-current > .el-tree-node__content {
  background-color: rgba(135, 206, 235, 0.2);
  font-weight: bold !important;
}

.el-tree-custom--drag-over {
  background-color: rgba(255, 59, 134, 0.2) !important;
}
</style>

<style lang="scss" scoped>
.text-body-2-no-weight {
  font-size: 0.875rem;
  /* font-weight: 400; */
  line-height: 1.425;
  letter-spacing: 0.0178571429em;
  font-family: 'Roboto', sans-serif;
  text-transform: none;
}

.label-dirty {
  font-style: italic;
  text-decoration: underline;
}
</style>
