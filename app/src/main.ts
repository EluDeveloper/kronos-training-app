import { createApp } from 'vue'

import App from '@/App.vue'
import { registerPlugins } from '@core/utils/plugins'

// Styles
import '@core/scss/template/index.scss'
import '@layouts/styles/index.scss'

if (typeof window !== 'undefined') {
  window.addEventListener('vite:preloadError', event => {
    event.preventDefault()
    const reloadKey = 'kronos-preload-reload-at'
    const lastReload = Number(sessionStorage.getItem(reloadKey) || 0)

    if (Date.now() - lastReload < 30_000)
      return

    sessionStorage.setItem(reloadKey, String(Date.now()))
    window.location.reload()
  })
}

// Create vue app
const app = createApp(App)

// Register plugins
registerPlugins(app)

// Mount vue app
app.mount('#app')
