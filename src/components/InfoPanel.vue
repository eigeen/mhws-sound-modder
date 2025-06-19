<script lang="ts" setup>
import { MusicSegmentNode, MusicTrackNode, PlayListItem } from '@/libs/bnk'
import { SourceManager } from '@/libs/source'
import { Transcoder } from '@/libs/transcode'
import {
  DataNode,
  DataNodePayload,
  useWorkspaceStore,
} from '@/stores/workspace'
import { ShowError } from '@/utils/message'
import { convertFileSrc } from '@tauri-apps/api/core'
import { exists, rename } from '@tauri-apps/plugin-fs'
import { computed, ref, watch, onUnmounted, reactive } from 'vue'
import AudioPlayer from './AudioPlayer.vue'

const dataNode = defineModel<DataNode | null>({ required: true })

const data = computed<DataNodePayload | null>(() => {
  return dataNode.value?.data || null
})

const audioPlayerRef = ref<InstanceType<typeof AudioPlayer> | null>(null)
const currentAudioSrc = ref('')

defineExpose({
  playAudio: async function (source?: string) {
    try {
      if (source) {
        // 先停止当前播放
        audioPlayerRef.value?.stop()
        currentAudioSrc.value = source
        // 等待下一个tick确保AudioPlayer组件已更新
        await new Promise(resolve => setTimeout(resolve, 0))
      } else if (data.value?.type === 'Source') {
        await handlePlayback()
        return // handlePlayback已经处理了播放
      }
      await audioPlayerRef.value?.play()
    } catch (err) {
      ShowError(`Failed to play audio: ${err}`)
    }
  },
})

const workspace = useWorkspaceStore()
const sourceManager = SourceManager.getInstance()

let ignoreNextChange = false

watch(
  () => data.value,
  async (oldVal, newVal) => {
    if (ignoreNextChange) {
      ignoreNextChange = false
      return
    }

    try {
      // if id changed, user may changed the selected node
      if (oldVal?.id !== newVal?.id) {
        console.debug('Selected node changed', dataNode.value)
        if (data.value?.type === 'MusicTrack') {
          listSelected.value = [data.value.playlist[0]]
        } else if (data.value?.type === 'Source') {
          // Auto load audio source when selected node is Source
          try {
            // 先停止当前播放
            audioPlayerRef.value?.stop()
            
            const audioPath = await tryGetPlaybackAudio(data.value.id)
            if (audioPath) {
              console.debug('Audio player update source', audioPath)
              currentAudioSrc.value = convertFileSrc(audioPath)
            } else {
              currentAudioSrc.value = ''
            }
          } catch {
            // Failed to load, keep player hidden
            audioPlayerRef.value?.stop()
            currentAudioSrc.value = ''
          }
        }
      } else {
        // id not changed, user may edited the values
        const id = data.value?.id
        if (id && dataNode.value) {
          dataNode.value.dirty = true
        }
      }
    } catch (err) {
      console.error(err)
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
        listItemSelected.value.srcDuration +
          listItemSelected.value.endTrimOffset,
      ]
    }
    return [0, 0]
  },
  set: (v) => {
    if (data.value?.type === 'MusicTrack' && listItemSelected.value) {
      listItemSelected.value.beginTrimOffset = v[0]
      listItemSelected.value.endTrimOffset =
        v[1] - listItemSelected.value.srcDuration
    }
  },
})

function getTitle(node: DataNodePayload | null) {
  if (node === null) {
    return ''
  }
  switch (node.type) {
    case 'MusicSegment':
      return `Segment ${node.id}`
    case 'MusicTrack':
      return `Track ${node.id}`
    case 'Source':
      return `Audio ${node.id}.wem`
    default:
      return ''
  }
}

function getPlayListItemTitle(item: PlayListItem | null) {
  if (item === null) return ''
  switch (item.elementType) {
    case 'Track':
      return `Track ${item.element_id}`
    case 'Source':
      return `Audio ${item.element_id}`
    case 'Event':
      return `Event ${item.element_id}`
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
    // restore the original values
    switch (data.value.type) {
      case 'MusicSegment':
        defaultData = defaultData as MusicSegmentNode
        data.value.duration = defaultData.duration
        data.value.fade_in_end = defaultData.fade_in_end
        data.value.fade_out_start = defaultData.fade_out_start
        break
      case 'MusicTrack':
        defaultData = defaultData as MusicTrackNode
        const defaultPlaylist = defaultData.playlist
        data.value.playlist.forEach((item, index) => {
          const defaultItem = defaultPlaylist[index]
          item.playAt = defaultItem.playAt
          item.srcDuration = defaultItem.srcDuration
          item.beginTrimOffset = defaultItem.beginTrimOffset
          item.endTrimOffset = defaultItem.endTrimOffset
        })
        break
      case 'Source':
        // remove replace item
        const selectedKey = workspace.selectedKey
        if (selectedKey && typeof selectedKey === 'string') {
          delete workspace.replaceList[selectedKey]
        }
        break
    }
    // restore status
    if (dataNode.value.data.type !== 'Source') {
      dataNode.value.dirty = false
    }
    console.info('Undo success')
    // temporarily disable the watcher once to avoid loop
    ignoreNextChange = true
  } catch (err) {
    ShowError(`Failed to undo: ${err}`)
  } finally {
  }
}

async function tryGetPlaybackAudio(id: number): Promise<string | null> {
  try {
    const wemFilePath = await sourceManager.getSourceFilePath(id)
    if (!wemFilePath) {
      return null
    }

    const wavFilePath = wemFilePath.replace('.wem', '.wav')
    if (await exists(wavFilePath)) {
      return wavFilePath
    }
    return null
  } catch (err) {
    throw new Error(`Failed to get playback audio: ${err}`)
  }
}

/**
 * Get playable audio file by id.
 * @returns File path
 */
async function fetchPlaybackAudio(id: number): Promise<string> {
  try {
    const wemFilePath = await sourceManager.getSourceFilePath(id)
    if (!wemFilePath) {
      throw new Error('source ID not found in SourceManager.')
    }

    const wavFilePath = wemFilePath.replace('.wem', '.wav')
    if (await exists(wavFilePath)) {
      return wavFilePath
    }

    // wav not found, transcode
    const targetPath = await Transcoder.getInstance().transcode(
      wemFilePath,
      'wav'
    )
    await rename(targetPath, wavFilePath)
    return wavFilePath
  } catch (err) {
    throw new Error(`Failed to fetch playback audio: ${err}`)
  }
}

async function fetchReplacedAudio(id: number): Promise<string> {
  try {
    // 需要找到当前节点的唯一ID
    const workspace = useWorkspaceStore()
    const selectedKey = workspace.selectedKey
    if (!selectedKey || typeof selectedKey !== 'string') {
      throw new Error('selectedKey not found or not a string')
    }
    
    const replaceItem = workspace.replaceList[selectedKey]
    if (!replaceItem) {
      throw new Error('replace item not found in workspace.replaceList')
    }

    const wemFilePath = replaceItem.path
    const wavFilePath = wemFilePath.replace('.wem', '.wav')
    if (await exists(wavFilePath)) {
      return wavFilePath
    }

    // transcode
    if (!(await exists(wemFilePath))) {
      throw new Error(`Replaced wem file not found at ${wemFilePath}`)
    }
    const targetPath = await Transcoder.getInstance().transcode(
      wemFilePath,
      'wav'
    )
    await rename(targetPath, wavFilePath)
    return wavFilePath
  } catch (err) {
    throw new Error(`Failed to fetch replaced audio: ${err}`)
  }
}

async function handlePlayback() {
  if (!data.value || data.value.type !== 'Source') {
    return
  }

  try {
    // 先停止当前播放
    audioPlayerRef.value?.stop()
    
    // if imported, play replaced audio, otherwise play original
    const audioPath = dataNode.value!.dirty
      ? await fetchReplacedAudio(data.value.id)
      : await fetchPlaybackAudio(data.value.id)
    
    // 设置新的音频源
    currentAudioSrc.value = convertFileSrc(audioPath)
    
    // 等待下一个tick确保AudioPlayer组件已更新
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // 重置并播放
    audioPlayerRef.value?.reset()
    await audioPlayerRef.value?.play()
  } catch (err) {
    ShowError(`Failed to play audio: ${err}`)
  }
}

async function handlePlayOriginal() {
  if (!data.value || data.value.type !== 'Source' || !dataNode.value!.dirty) {
    return
  }

  try {
    // 先停止当前播放
    audioPlayerRef.value?.stop()
    
    const audioPath = await fetchPlaybackAudio(data.value.id)
    
    // 设置新的音频源
    currentAudioSrc.value = convertFileSrc(audioPath)
    
    // 等待下一个tick确保AudioPlayer组件已更新
    await new Promise(resolve => setTimeout(resolve, 0))
    
    // 重置并播放
    audioPlayerRef.value?.reset()
    await audioPlayerRef.value?.play()
  } catch (err) {
    ShowError(`Failed to play original: ${err}`)
  }
}

// Clean up audio player on unmount
onUnmounted(() => {
  audioPlayerRef.value?.stop()
})
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

    <div v-if="data?.type === 'Source'">
      <div>
        <v-btn
          class="text-none"
          prepend-icon="mdi-play"
          variant="outlined"
          @click="handlePlayback"
          >Playback</v-btn
        >
      </div>
      <div v-if="dataNode?.dirty">
        <v-btn
          class="text-none"
          prepend-icon="mdi-play"
          variant="outlined"
          @click="handlePlayOriginal"
          >Play Original</v-btn
        >
      </div>
      <AudioPlayer
        v-if="currentAudioSrc"
        ref="audioPlayerRef"
        :src="currentAudioSrc"
      />
      <span class="trailing-row"
        >Source from: {{ sourceManager.getSource(data.id)?.from.name }}</span
      >
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
