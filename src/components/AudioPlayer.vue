<script lang="ts" setup>
import { ref, watch } from 'vue'

const props = defineProps<{
  src: string
}>()

const emit = defineEmits<{
  (e: 'play'): void
  (e: 'pause'): void
  (e: 'ended'): void
}>()

const audioRef = ref<HTMLAudioElement | null>(null)
const isPlaying = ref(false)
const isMuted = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const volume = ref(1)

// 监听音频源变化
watch(() => props.src, () => {
  if (audioRef.value) {
    audioRef.value.currentTime = 0
    currentTime.value = 0
    isPlaying.value = false
  }
})

// 播放控制方法
const play = async () => {
  try {
    if (audioRef.value) {
      audioRef.value.currentTime = 0
      currentTime.value = 0
      await audioRef.value.play()
      isPlaying.value = true
      emit('play')
    }
  } catch (err) {
    console.error('Failed to play audio:', err)
  }
}

const pause = () => {
  audioRef.value?.pause()
  isPlaying.value = false
  emit('pause')
}

const stop = () => {
  if (audioRef.value) {
    audioRef.value.pause()
    audioRef.value.currentTime = 0
    isPlaying.value = false
    currentTime.value = 0
  }
}

// 重置进度条
const reset = () => {
  if (audioRef.value) {
    audioRef.value.currentTime = 0
    currentTime.value = 0
  }
}

// 进度条控制
const handleTimeUpdate = (event: Event) => {
  const audio = event.target as HTMLAudioElement
  currentTime.value = audio.currentTime
}

const handleDurationChange = (event: Event) => {
  const audio = event.target as HTMLAudioElement
  duration.value = audio.duration
}

const handleSeek = (value: number) => {
  if (audioRef.value) {
    audioRef.value.currentTime = value
    currentTime.value = value
  }
}

// 音量控制
const handleVolumeChange = (value: number) => {
  if (audioRef.value) {
    audioRef.value.volume = value
    volume.value = value
    isMuted.value = value === 0
  }
}

const toggleMute = () => {
  if (audioRef.value) {
    isMuted.value = !isMuted.value
    audioRef.value.volume = isMuted.value ? 0 : volume.value
  }
}

// 暴露方法给父组件
defineExpose({
  play,
  pause,
  stop,
  reset
})
</script>

<template>
  <div class="audio-player">
    <audio
      ref="audioRef"
      :src="src"
      @timeupdate="handleTimeUpdate"
      @durationchange="handleDurationChange"
      @ended="emit('ended')"
    ></audio>
    
    <div class="d-flex align-center">
      <!-- 播放/暂停按钮 -->
      <v-btn
        :icon="isPlaying ? 'mdi-pause' : 'mdi-play'"
        variant="text"
        @click="isPlaying ? pause() : play()"
      ></v-btn>

      <!-- 进度条 -->
      <v-slider
        v-model="currentTime"
        :max="duration"
        :step="0.1"
        hide-details
        class="mx-4"
        @update:model-value="handleSeek"
      >
        <template #prepend>
          <span class="text-caption">{{ Math.floor(currentTime) }}s</span>
        </template>
        <template #append>
          <span class="text-caption">{{ Math.floor(duration) }}s</span>
        </template>
      </v-slider>

      <!-- 音量控制 -->
      <v-slider
        v-model="volume"
        :max="1"
        :step="0.1"
        hide-details
        class="mx-4"
        style="max-width: 100px"
        @update:model-value="handleVolumeChange"
      ></v-slider>

      <!-- 静音按钮 -->
      <v-btn
        :icon="isMuted ? 'mdi-volume-off' : 'mdi-volume-high'"
        variant="text"
        @click="toggleMute"
      ></v-btn>
    </div>
  </div>
</template>

<style scoped>
.audio-player {
  width: 100%;
  padding: 8px;
}
</style> 