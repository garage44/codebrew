import {$t} from '@garage44/common/app'
import {UsersForm} from '@garage44/common/components'

interface UsersFormWrapperProps {
    userId?: string
}

export default function UsersFormWrapper({userId}: UsersFormWrapperProps) {
    return <UsersForm $t={$t} userId={userId} />
}
