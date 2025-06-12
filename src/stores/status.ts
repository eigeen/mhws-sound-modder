import { defineStore } from 'pinia'
import { reactive, ref } from 'vue'

export const useStatusStore = defineStore('status', () => {
  const message = ref('')
  const progress = reactive({
    current: 0,
    indeterminate: false,
  })

  return {
    message,
    progress,
  }
})
