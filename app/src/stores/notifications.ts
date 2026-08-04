import { defineStore } from 'pinia'

export type NotificationColor = 'success' | 'error' | 'warning' | 'info'

export interface ConfirmationOptions {
  title: string
  message: string
  detail?: string
  confirmText?: string
  cancelText?: string
  color?: NotificationColor
  icon?: string
}

export const useNotificationsStore = defineStore('notifications', () => {
  const visible = ref(false)
  const message = ref('')
  const color = ref<NotificationColor>('success')
  const confirmVisible = ref(false)
  const confirmation = reactive<Required<Omit<ConfirmationOptions, 'detail'>> & { detail: string }>({
    title: 'Confirmar acción',
    message: '',
    detail: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    color: 'warning',
    icon: 'ri-alert-line',
  })
  let pendingResolver: ((accepted: boolean) => void) | null = null

  function show(text: string, notificationColor: NotificationColor = 'success') {
    message.value = text
    color.value = notificationColor
    visible.value = true
  }

  function requestConfirmation(options: ConfirmationOptions) {
    pendingResolver?.(false)
    Object.assign(confirmation, {
      title: options.title,
      message: options.message,
      detail: options.detail ?? '',
      confirmText: options.confirmText ?? 'Confirmar',
      cancelText: options.cancelText ?? 'Cancelar',
      color: options.color ?? 'warning',
      icon: options.icon ?? 'ri-alert-line',
    })
    confirmVisible.value = true

    return new Promise<boolean>(resolve => {
      pendingResolver = resolve
    })
  }

  function resolveConfirmation(accepted: boolean) {
    confirmVisible.value = false
    const resolve = pendingResolver

    pendingResolver = null
    resolve?.(accepted)
  }

  return { visible, message, color, show, confirmVisible, confirmation, requestConfirmation, resolveConfirmation }
})
