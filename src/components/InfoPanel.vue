<script lang="ts" setup>
import {
  HircNode,
  MusicSegmentNode,
  MusicTrackNode,
  PlayListItem,
} from '@/libs/bnk'
import { DataNode, useWorkspaceStore } from '@/stores/workspace'
import { ShowError } from '@/utils/message'
import { computed, ref, watch } from 'vue'

const dataNode = defineModel<DataNode | null>({ required: true })

const data = computed<HircNode | null>(() => {
  return dataNode.value?.data || null
})

const workspace = useWorkspaceStore()

let ignoreNextChange = false

watch(
  () => data.value,
  (oldVal, newVal) => {
    if (ignoreNextChange) {
      ignoreNextChange = false
      return
    }
    // if id changed, user may changed the selected node
    if (oldVal?.id !== newVal?.id) {
      console.log('Selected node changed', dataNode.value)
      if (data.value?.type === 'MusicTrack') {
        listSelected.value = [data.value.playlist[0]]
      }
    } else {
      // id not changed, user may edited the values
      const id = data.value?.id
      if (id && dataNode.value) {
        dataNode.value.dirty = true
      }
    }
  },
  { deep: true }
)

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

const listSelected = ref<PlayListItem[]>([])
const listItemSelected = computed<PlayListItem | null>(() => {
  if (listSelected.value.length === 0) {
    return null
  }
  return listSelected.value[0]
})

const rangeSliderValue = computed<number[]>({
  get: () => {
    if (data.value?.type === 'MusicTrack' && listItemSelected.value) {
      return [
        listItemSelected.value.beginTrimOffset,
        -listItemSelected.value.endTrimOffset, // from negative value
      ]
    }
    return [0, 0]
  },
  set: (v) => {
    if (data.value?.type === 'MusicTrack' && listItemSelected.value) {
      listItemSelected.value.beginTrimOffset = v[0]
      listItemSelected.value.endTrimOffset = -v[1] // to negative value
    }
  },
})

function getTitle(node: HircNode | null) {
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
          return `Audio ${node.id}.wem`
        case 'Event':
          return `Event ${node.id}`
        default:
          return ''
      }
    default:
      return ''
  }
}

function getPlayListItemTitle(item: PlayListItem | null) {
  if (item === null) return ''
  switch (item.elementType) {
    case 'Track':
      return `Track ${item.id}`
    case 'Source':
      return `Audio ${item.id}`
    case 'Event':
      return `Event ${item.id}`
    default:
      return ''
  }
}

function handleUndo() {
  if (!dataNode.value || !data.value) return

  let defaultData = dataNode.value.defaultData
  console.debug(
    'undo, dataNode.value.data, defaultData',
    dataNode.value.data,
    defaultData
  )

  try {
    switch (data.value.type) {
      case 'MusicSegment':
        defaultData = defaultData as MusicSegmentNode
        data.value.duration = defaultData.duration
        data.value.fade_in_end = defaultData.fade_in_end
        data.value.fade_out_start = defaultData.fade_out_start
        break
      case 'MusicTrack':
        defaultData = defaultData as MusicTrackNode
        // object fields are Proxy,
        // so we need to find their real default values
        const playlistIds = data.value.playlist.map((item) => item.id)
        const playlistDefaultData = playlistIds.map(
          (id) => workspace.flattenEntryMap[id]
        )
        data.value.playlist.forEach((item, index) => {
          const defaultItem = playlistDefaultData[index]
            .defaultData as PlayListItem
          item.playAt = defaultItem.playAt
          item.srcDuration = defaultItem.srcDuration
          item.beginTrimOffset = defaultItem.beginTrimOffset
          item.endTrimOffset = defaultItem.endTrimOffset
        })
        break
      case 'PlayListItem':
        throw new Error('PlayListItem unimplemented')
        break
    }
    dataNode.value.dirty = false
    console.info('Undo success')
    // temporarily disable the watcher once to avoid loop
    ignoreNextChange = true
  } catch (err) {
    ShowError(`Failed to undo: ${err}`)
  } finally {
  }
}
</script>

<template>
  <div class="info-panel-root">
    <h3 class="title">{{ getTitle(data) }}</h3>

    <div v-if="data?.type === 'MusicSegment'">
      <div class="segment-editor">
        <div class="segment-row">
          <span class="label">Duration (ms)</span>
          <NumberInput
            v-model="data.duration"
            style="width: 200px"
          ></NumberInput>
        </div>
        <div class="segment-row">
          <span class="label">Fade-in Duration (ms)</span>
          <SliderWithInput
            v-model="data.fade_in_end"
            :slider-max="Math.min(10000, data.duration)"
          ></SliderWithInput>
        </div>
        <div class="segment-row">
          <span class="label">Fade-out Duration (ms)</span>
          <SliderWithInput
            v-model="segmentFadeOutDuration"
            :slider-max="Math.min(10000, data.duration)"
          ></SliderWithInput>
        </div>
      </div>
      <span class="trailing-row"
        >(Fade-in end: {{ data.fade_in_end }} | Fade-out start:
        {{ data.fade_out_start }})</span
      >
    </div>

    <div v-if="data?.type === 'MusicTrack'">
      <div class="track-play-list border rounded">
        <v-list
          v-model:selected="listSelected"
          density="compact"
          color="primary"
          mandatory
        >
          <v-list-item
            v-for="(item, index) in data.playlist"
            :key="index"
            :value="item"
          >
            <v-list-item-title>{{
              getPlayListItemTitle(item)
            }}</v-list-item-title>
          </v-list-item>
        </v-list>
      </div>
      <div v-if="listItemSelected">
        <div class="track-editor">
          <!-- column 1 -->
          <div>
            <div class="segment-row">
              <span class="label">Play At (ms)</span>
              <NumberInput v-model="listItemSelected.playAt"></NumberInput>
            </div>
            <div class="segment-row">
              <span class="label">Src Duration (ms)</span>
              <NumberInput v-model="listItemSelected.srcDuration"></NumberInput>
            </div>
          </div>
          <!-- column 2 -->
          <div>
            <div class="segment-row">
              <span class="label">Start Trim Offset (ms)</span>
              <NumberInput
                v-model="listItemSelected.beginTrimOffset"
              ></NumberInput>
            </div>
            <div class="segment-row">
              <span class="label">End Trim Offset (ms)</span>
              <NumberInput
                v-model="listItemSelected.endTrimOffset"
              ></NumberInput>
            </div>
          </div>
        </div>
        <div class="trim-range-row">
          <span class="mr-4">Trim Range (Start Trim - End Trim)</span>
          <v-range-slider
            v-model="rangeSliderValue"
            :max="listItemSelected?.srcDuration || 0"
            :min="0"
            thumb-label
            strict
            hide-details
          ></v-range-slider>
        </div>
      </div>
    </div>

    <div v-if="data?.type === 'PlayListItem'">
      <!--  -->
    </div>

    <div
      v-if="dataNode"
      class="op-container"
    >
      <v-btn
        class="text-none"
        color="primary"
        variant="outlined"
        prepend-icon="mdi-undo"
        @click="handleUndo"
        :disabled="[false, undefined].includes(dataNode?.dirty)"
        >Undo</v-btn
      >
    </div>
  </div>
</template>

<style scoped lang="scss">
.title {
  text-align: center;
  margin-bottom: 1rem;
}

.track-play-list {
  max-height: 140px;
  overflow-y: auto;
  margin-bottom: 1rem;
}

.segment-editor {
  display: grid;
  grid-template-columns: max-content 1fr;
  gap: 8px;
  align-items: center;

  .segment-row {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: subgrid;
    gap: 1rem;
    align-items: center;

    .label {
      text-align: right;
    }
  }
}

.track-editor {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  align-items: start;
  margin-bottom: 0.6rem;

  @media (max-width: 800px) {
    grid-template-columns: 1fr;
    gap: 8px;
  }

  & > div {
    display: grid;
    grid-template-columns: max-content 1fr;
    gap: 8px;
    align-items: center;

    .segment-row {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: subgrid;
      gap: 1rem;
      align-items: center;

      .label {
        text-align: right;
      }
    }
  }
}

.trailing-row {
  display: flex;
  justify-content: center;
  font-size: 0.9rem;
  text-align: center;
  color: rgba(var(--v-theme-surface-variant));
  width: 100%;
  margin-top: 8px;
}

.trim-range-row {
  display: flex;
  justify-content: center;
  align-items: center;
}

.op-container {
  display: flex;
  align-items: center;
  margin-top: 1rem;
}
</style>
