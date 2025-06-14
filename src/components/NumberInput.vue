<script lang="ts" setup>
const value = defineModel<number>()

defineProps<{
  label?: string
}>()
</script>

<template>
  <div>
    <v-number-input
      v-model="value"
      :label="label"
      variant="outlined"
      density="compact"
      :precision="null"
      control-variant="hidden"
      hide-details
    ></v-number-input>
  </div>
</template>

<style lang="scss" scoped></style>
