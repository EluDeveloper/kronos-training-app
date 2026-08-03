export const routes = [
  { path: '/', redirect: '/dashboard' },
  {
    path: '/',
    component: () => import('@/layouts/default.vue'),
    children: [
      {
        path: 'dashboard',
        component: () => import('@/pages/dashboard.vue'),
      },
      {
        path: 'atletas',
        component: () => import('@/pages/atletas.vue'),
      },
      {
        path: 'pagos',
        component: () => import('@/pages/pagos.vue'),
      },
      {
        path: 'visitas',
        component: () => import('@/pages/visitas.vue'),
      },
      {
        path: 'rendimiento',
        component: () => import('@/pages/rendimiento.vue'),
      },
      {
        path: 'tienda',
        component: () => import('@/pages/tienda.vue'),
      },
      {
        path: 'egresos',
        component: () => import('@/pages/egresos.vue'),
      },
      {
        path: 'programacion',
        component: () => import('@/pages/programacion.vue'),
      },
      {
        path: 'comunidad',
        component: () => import('@/pages/comunidad.vue'),
      },
      {
        path: 'planes',
        component: () => import('@/pages/planes.vue'),
      },
    ],
  },
  {
    path: '/',
    component: () => import('@/layouts/blank.vue'),
    children: [
      {
        path: '/:pathMatch(.*)*',
        component: () => import('@/pages/[...error].vue'),
      },
    ],
  },
]
