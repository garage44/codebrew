export interface Notification {
    icon?: string
    id?: number
    level?: 'info' | 'success' | 'warning' | 'error'
    link?: {
        text: string
        url: string
    }
    list?: string[]
    message: string
    progress?: {
        boundaries: number[]
        percentage: number
    }
    type?: string
}

export class Notifier {
    notificationId = 1

    notifications: Notification[] = []

    init(notifications: Notification[]): void {
        this.notifications = notifications
    }

    notify(notification: Notification, timeout = 3000) {
        notification.id = this.notificationId
        this.notifications.push(notification)

        if (timeout) {
            setTimeout(() => {
                const findFn = (_notification: Notification) => _notification.id === notification.id
                const index = this.notifications.findIndex(findFn)
                this.notifications.splice(index, 1)
            }, timeout)
        }

        this.notificationId += 1
        return this.notifications.find((_notification) => _notification.id === notification.id)
    }
}
