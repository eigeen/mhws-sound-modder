/**
 * main.ts
 *
 * Bootstraps Vuetify and other plugins then mounts the App`
 */

// Plugins
import { registerPlugins } from '@/plugins'

// Components
import App from './App.vue'

// Composables
import { createApp } from 'vue'

// Styles
import 'unfonts.css'
import 'element-plus/theme-chalk/dark/css-vars.css'

const app = createApp(App)

registerPlugins(app)

app.mount('#app')
