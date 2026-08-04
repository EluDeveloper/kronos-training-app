import { useNotificationsStore, type ConfirmationOptions, type NotificationColor } from '@/stores/notifications'

export function useNotifications() {
  const store = useNotificationsStore()

  return {
    notify: (message: string, color: NotificationColor = 'success') => store.show(message, color),
    success: (message: string) => store.show(message, 'success'),
    failure: (message: string) => store.show(message, 'error'),
    confirmAction: (options: ConfirmationOptions) => store.requestConfirmation(options),
  }
}
