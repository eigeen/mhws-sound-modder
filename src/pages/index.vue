<script lang="ts" setup>
import type { DropEvent, TreeNode } from '@/components/DragOverTree.vue';

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
  <DragOverTree :data="data" @node-click="handleNodeClick" @drop="handleDrop"></DragOverTree>
</template>

<style lang="scss" scoped></style>
