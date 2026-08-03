import { defineStore } from 'pinia'

export type NotificationColor = 'success' | 'error' | 'warning' | 'info'

export const useNotificationsStore = defineStore('notifications', () => {
  const visible = ref(false)
  const message = ref('')
  const color = ref<NotificationColor>('success')

  function show(text: string, notificationColor: NotificationColor = 'success') {
    message.value = text
    color.value = notificationColor
    visible.value = true
  }

  return { visible, message, color, show }
})
