import { defineStore } from 'pinia'
import { reactive, ref, computed } from 'vue'

export interface StatusEvent {
  id: string
  message: string
  progress?: {
    current: number
    indeterminate: boolean
  }
}

export const useStatusStore = defineStore('status', () => {
  const eventStack = reactive<StatusEvent[]>([])

  // 获取最新的事件
  const currentEvent = computed(() => eventStack[eventStack.length - 1])

  // 添加或更新事件
  function pushEvent(event: Omit<StatusEvent, 'id'> & { id?: string }) {
    const id = event.id || Math.random().toString(36).substring(2)
    const existingIndex = eventStack.findIndex(e => e.id === id)

    const newEvent: StatusEvent = {
      id,
      message: event.message,
      progress: event.progress
    }

    if (existingIndex !== -1) {
      // 更新已存在的事件
      eventStack[existingIndex] = newEvent
    } else {
      // 添加新事件
      eventStack.push(newEvent)
    }
  }

  // 移除事件
  function removeEvent(id: string) {
    const index = eventStack.findIndex(e => e.id === id)
    if (index !== -1) {
      eventStack.splice(index, 1)
    }
  }

  // 清空所有事件
  function clearEvents() {
    eventStack.length = 0
  }

  return {
    eventStack,
    currentEvent,
    pushEvent,
    removeEvent,
    clearEvents
  }
})
