export const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/',
    component: () => import('@/layouts/default.vue'),
    children: [
      {
        path: 'dashboard',
        name: 'dashboard',
        meta: { access: 'dashboard' },
        component: () => import('@/pages/dashboard.vue'),
      },
      {
        path: 'atletas',
        name: 'athletes',
        meta: { access: 'athletes' },
        component: () => import('@/pages/atletas.vue'),
      },
      {
        path: 'pagos',
        name: 'payments',
        meta: { access: 'payments' },
        component: () => import('@/pages/pagos.vue'),
      },
      {
        path: 'visitas',
        name: 'visits',
        meta: { access: 'visits' },
        component: () => import('@/pages/visitas.vue'),
      },
      {
        path: 'rendimiento',
        name: 'performance',
        meta: { access: 'performance' },
        component: () => import('@/pages/rendimiento.vue'),
      },
      {
        path: 'tienda',
        name: 'store',
        meta: { access: 'store' },
        component: () => import('@/pages/tienda.vue'),
      },
      {
        path: 'egresos',
        name: 'expenses',
        meta: { access: 'expenses' },
        component: () => import('@/pages/egresos.vue'),
      },
      {
        path: 'programacion',
        name: 'workouts',
        meta: { access: 'workouts' },
        component: () => import('@/pages/programacion.vue'),
      },
      {
        path: 'comunidad',
        name: 'community',
        meta: { access: 'community' },
        component: () => import('@/pages/comunidad.vue'),
      },
      {
        path: 'planes',
        name: 'plans',
        meta: { access: 'plans' },
        component: () => import('@/pages/planes.vue'),
      },
      {
        path: 'usuarios',
        name: 'users',
        meta: { adminOnly: true },
        component: () => import('@/pages/usuarios.vue'),
      },
      {
        path: 'sin-acceso',
        name: 'no-access',
        component: () => import('@/pages/sin-acceso.vue'),
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/blank.vue'),
    children: [
      {
        path: 'kiosco',
        name: 'kiosk',
        meta: { adminOnly: true },
        component: () => import('@/pages/kiosco.vue'),
      },
      {
        path: '/:pathMatch(.*)*',
        component: () => import('@/pages/[...error].vue'),
      },
    ],
  },
]
