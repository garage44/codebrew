import {$t} from '@garage44/common/app'
import {ChannelsForm} from '@garage44/common/components'

interface ChannelsFormWrapperProps {
    channelId?: string
}

export default function ChannelsFormWrapper({channelId}: ChannelsFormWrapperProps) {
    return <ChannelsForm $t={$t} channelId={channelId} />
}
