<script lang="ts" setup>
import { computed } from 'vue'

const value = defineModel<number>()
const sliderValue = defineModel<number>('sliderValue')

withDefaults(
  defineProps<{
    label?: string
    sliderMin?: number
    sliderMax?: number
    sliderStep?: number
  }>(),
  {
    sliderMin: 0,
    sliderMax: 5000,
    sliderStep: 100,
  }
)

const realSliderValue = computed({
  get: () => sliderValue.value || value.value,
  set: (v: number) => {
    if (sliderValue.value) {
      sliderValue.value = v
    } else {
      value.value = v
    }
  },
})
</script>

<template>
  <div class="editor-row">
    <span v-if="label" class="label">
      {{ label }}
    </span>
    <v-slider
      v-model="realSliderValue"
      :max="sliderMax"
      :min="sliderMin"
      :step="sliderStep"
      hide-details
    ></v-slider>
    <div>
      <v-number-input
        v-model="value"
        width="100px"
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
