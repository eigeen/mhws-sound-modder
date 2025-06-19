/**
 * plugins/vuetify.ts
 *
 * Framework documentation: https://vuetifyjs.com`
 */

// Styles
import '@mdi/font/css/materialdesignicons.css'
import 'vuetify/styles'

// Composables
import { createVuetify } from 'vuetify'
import colors from 'vuetify/util/colors'

// https://vuetifyjs.com/en/introduction/why-vuetify/#feature-guides
export default createVuetify({
  theme: {
    defaultTheme: 'light',
    themes: {
      light: {
        dark: false,
        colors: {
          primary: colors.indigo.darken1,
          secondary: colors.indigo.lighten4,
          accent: colors.indigo.base,
        },
      },
      dark: {
        dark: true,
        colors: {
          primary: colors.indigo.lighten2,
          secondary: colors.indigo.lighten4,
          accent: colors.indigo.base,
          // background: '#1e2227'
        },
      },
    },
  },
})
