<template>
  <v-app class="app-root">
    <v-main class="main-content">
      <router-view />
    </v-main>
    <StatusBar />
  </v-app>
</template>

<script lang="ts" setup>
import { window } from '@tauri-apps/api'
import { LocalDir } from './libs/localDir'

// Register onClose event
const mainWindow = window.getCurrentWindow()
mainWindow.onCloseRequested(async () => {
  // clear temp files
  try {
    await LocalDir.clearTempDir()
  } finally {
  }
})
</script>

<style lang="scss">
html,
body {
  /* disable vuetify scrollbar */
  overflow-y: auto !important;
}

.app-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  max-height: 100vh;
}

.main-content {
  flex: 1 1 auto;
  height: calc(100vh - 25px);
  overflow-y: auto;
}
</style>
