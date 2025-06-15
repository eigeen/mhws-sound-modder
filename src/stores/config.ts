import { LocalDir } from '@/libs/localDir'
import { join } from '@tauri-apps/api/path'
import { exists, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const CONFIG_FILE_NAME = 'config.json'

export type Config = {
  shell: {
    ffmpegPath?: string
    wwiseConsolePath?: string
    vgmstreamPath?: string
  }
}

export const useConfigStore = defineStore('config', () => {
  const config = ref<Config | null>(null)
  const saveOnChange = ref(true)

  const loadConfig = async () => {
    const configPath = await _getConfigPath()
    if (await exists(configPath)) {
      const content = await readTextFile(configPath)
      config.value = JSON.parse(content)
      console.info('Config file loaded from', configPath)
      console.debug('Config', config.value)
    } else {
      console.info('Config file not found. Using default config.')
      config.value = await _getDefaultConfig()
    }
  }

  const saveConfig = async () => {
    const configPath = await _getConfigPath()
    const content = JSON.stringify(config.value, null, 2)
    await writeTextFile(configPath, content)
    console.debug('Config file saved to', configPath)
  }

  const _getConfigPath = async () => {
    const rootDir = await LocalDir.getRoot()
    return await join(rootDir, CONFIG_FILE_NAME)
  }

  const _getDefaultConfig = async (): Promise<Config> => {
    return {
      shell: {},
    }
  }

  watch(
    config,
    async () => {
      // Auto-save config on change
      if (saveOnChange.value) {
        await saveConfig()
      }
      // sync to backend
    },
    { deep: true }
  )

  return {
    config,
    saveOnChange,
    loadConfig,
    saveConfig,
    _getConfigPath,
    _getDefaultConfig,
  }
})
