<template>
  <v-app class="app-root">
    <v-main>
      <router-view />
    </v-main>
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
}
</style>
