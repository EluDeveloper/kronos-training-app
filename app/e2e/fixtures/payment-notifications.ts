import { createApp } from 'vue'
import fixture from './PaymentNotificationsFixture.vue'
import installVuetify from '../../src/plugins/vuetify'
import '../../src/plugins/iconify/icons.css'

export function mountFixture() {
  const app = createApp(fixture)

  installVuetify(app)
  app.mount('#app')
}
