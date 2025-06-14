<script lang="ts" setup>
const value = defineModel<number>()

defineProps<{
  label?: string
}>()
</script>

<template>
  <div class="editor-row">
    <span class="label">
      {{ label }}
    </span>
    <div>
      <v-number-input
        v-model="value"
        width="200px"
        variant="outlined"
        density="compact"
        :precision="null"
        control-variant="hidden"
        hide-details
      ></v-number-input>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.editor-row {
  display: flex;
  align-items: center;
  flex-direction: row;
  gap: 1rem;
}
</style>
