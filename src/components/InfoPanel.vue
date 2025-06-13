<script lang="ts" setup>
import { EntryNode } from '@/libs/bnk'
import { computed, ref, watch } from 'vue'

const data = defineModel<EntryNode | null>({ required: true })

const debugValue = ref(0)
const debugString = ref('')

watch(data, () => {
  console.log('data changed', data.value)
})

// Map the original values to more human-friendly and editable values
const segmentFadeOutDuration = computed({
  get: () => {
    if (data.value?.type !== 'MusicSegment') {
      console.warn(
        'Trying to get segmentFadeOutDuration, but current data is not a MusicSegment'
      )
      return 0
    }
    return data.value.duration - data.value.fade_out_start
  },
  set: (v) => {
    if (data.value?.type !== 'MusicSegment') return

    data.value.fade_out_start = data.value.duration - v
  },
})

function getTitle(node: EntryNode | null) {
  if (node === null) {
    return ''
  }
  switch (node.type) {
    case 'MusicSegment':
      return `Segment ${node.id}`
    case 'MusicTrack':
      return `Track ${node.id}`
    case 'PlayListItem':
      switch (node.elementType) {
        case 'Track':
          return `Track ${node.id}`
        case 'Source':
          return `Source ${node.id}.wem`
        case 'Event':
          return `Event ${node.id}`
        default:
          return ''
      }
    default:
      return ''
  }
}
</script>

<template>
  <div class="info-panel-root">
    <h3 class="title">{{ getTitle(data) }}</h3>

    <div v-if="data?.type === 'MusicSegment'">
      <NumberInput
        v-model="data.duration"
        label="Duration (ms)"
      ></NumberInput>
      <SliderWithInput
        v-model="data.fade_in_end"
        label="Fade-in Duration (ms)"
      ></SliderWithInput>
      <SliderWithInput
        v-model="segmentFadeOutDuration"
        label="Fade-out Duration (ms)"
      ></SliderWithInput>
      <span
        >(Fade-in end: {{ data.fade_in_end }} | Fade-out start:
        {{ data.fade_out_start }})</span
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.title {
  text-align: center;
  margin-bottom: 1rem;
}
</style>
