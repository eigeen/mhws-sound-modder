<template>
  <v-sheet
    class="status-bar"
    height="25"
    color="surface"
  >
    <div class="d-flex align-center px-2">
      <span
        v-if="statusStore.message"
        class="text-caption"
        >{{ statusStore.message }}</span
      >
      <v-progress-linear
        v-if="statusStore.progress.current > 0"
        :model-value="statusStore.progress.current"
        :indeterminate="statusStore.progress.indeterminate"
        height="8"
        class="mx-2"
        color="primary"
      />
    </div>
  </v-sheet>
</template>

<script lang="ts" setup>
import { useStatusStore } from '@/stores/status'

const statusStore = useStatusStore()
</script>

<style scoped>
.status-bar {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 100;
  border-top: 1px solid rgba(var(--v-border-color), var(--v-border-opacity));
}
</style>
