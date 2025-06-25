<template>
  <v-sheet
    class="status-bar"
    height="25"
    color="surface"
  >
    <div class="d-flex align-center px-2">
      <v-progress-linear
        v-if="statusStore.currentEvent?.progress"
        :model-value="statusStore.currentEvent.progress.current"
        :indeterminate="statusStore.currentEvent.progress.indeterminate"
        height="8"
        class="progress-bar"
        color="primary"
      />
      <span
        v-if="statusStore.currentEvent?.message"
        class="text-caption ms-2"
      >{{ statusStore.currentEvent.message }}</span>
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

.progress-bar {
  max-width: 200px;
}
</style>
