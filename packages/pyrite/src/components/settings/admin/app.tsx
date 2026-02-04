import {useEffect} from 'preact/hooks'
import {Router, Route} from 'preact-router'
import Controls from './controls/controls'
import GroupsContext from './context/context-groups'
import {Notifications, PanelContext} from '@garage44/common/components'
import {Groups} from './groups'
import {Users} from './users/users'
import {$s} from '@/app'

export const AdminApp = () => {
    useEffect(() => {
        const themeColor = getComputedStyle(document.querySelector('.app')).getPropertyValue('--grey-4')
        const metaTheme = document.querySelector('meta[name="theme-color"]')
        if (metaTheme && metaTheme instanceof HTMLMetaElement) {
            metaTheme.content = themeColor
        }
    }, [])

    return (
        <div class='c-admin-app app'>
            <PanelContext
                collapsed={$s.panels.context.collapsed}
            >
                <GroupsContext />
            </PanelContext>
            <Controls />
            <Router>
                <Route component={Groups} path='/settings/groups' />
                <Route component={Groups} path='/settings/groups/:groupId' />
                <Route component={Users} path='/settings/users' />
                <Route component={Users} path='/settings/users/:userId' />
                <Route component={Groups} default />
            </Router>
            <Notifications notifications={$s.notifications} />
        </div>
    )
}
