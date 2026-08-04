import type { App } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import { routes } from './routes'
import { store } from '@/plugins/pinia'
import { useSessionStore } from '@/stores/session'
import type { AccessModule } from '@/types/access'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
})

router.beforeEach(to => {
  const session = useSessionStore(store)

  if (session.status !== 'authorized')
    return true

  if (to.meta.adminOnly === true && !session.isAdmin)
    return session.defaultRoute

  const access = to.meta.access as AccessModule | undefined
  if (access && !session.canAccess(access))
    return session.defaultRoute

  return true
})

export default function (app: App) {
  app.use(router)
}

export { router }
