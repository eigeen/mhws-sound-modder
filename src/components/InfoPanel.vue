<script lang="ts" setup>
import { TreeNode } from './DragOverTree.vue'

const selectedNode = defineModel<TreeNode | null>({ required: true })
</script>

<template>
  <div class="info-panel">
    <h2>Info Panel</h2>
    <p>This is the info panel.</p>
  </div>
</template>

<style scoped lang="scss"></style>
