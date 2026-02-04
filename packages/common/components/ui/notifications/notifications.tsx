import {CSSTransition, TransitionGroup} from 'preact-transitioning'
import {Icon, Progress} from '@/components'
import type {Notification} from '@/lib/notifier'
import classnames from 'classnames'

export function Notifications({notifications}) {
    return <div class="c-notifications">
        <TransitionGroup>
            {notifications.map((notification:Notification) =>
                <CSSTransition
                    key={notification.id}
                    classNames={classnames('notification', `type-${notification.type}`, 'fade')}
                >
                    <div>
                        <Icon
                            className="icon icon-d"
                            name={notification.icon ? notification.icon : 'info_outline'}
                            type={notification.type}
                        />
                        <div class="text-wrapper">
                            {notification.progress && <Progress
                                boundaries={notification.progress.boundaries}
                                percentage={notification.progress.percentage}
                                loading={false}
                            />}

                            <div class="message-text">
                                <span>{notification.message}</span>
                                {notification.link && (
                                    <span class="cf link" onClick={() => {
                                        window.open(notification.link.url, '_blank')
                                    }}>
                                        {notification.link.text}
                                    </span>
                                )}
                                {notification.list && <ul class="message-list">
                                    {notification.list.map((item) => <li>{item}</li>)}
                                </ul>}
                            </div>
                        </div>

                        <Icon
                            className="icon btn-close"
                            name="close"
                            onClick={() => {
                                notifications.splice(notifications.findIndex(i => i.id === notification.id), 1)
                            }}
                            type={notification.type}
                        />
                    </div>
                </CSSTransition>
            )}
        </TransitionGroup>

    </div>
}
