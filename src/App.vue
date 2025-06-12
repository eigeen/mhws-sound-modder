<template>
  <v-app class="app-root">
    <v-main class="main-content">
      <router-view />
    </v-main>
    <StatusBar />
  </v-app>
</template>

<script lang="ts" setup>
// 
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
  min-height: 0;
  overflow-y: auto;
  padding-bottom: 25px;
}
</style>
