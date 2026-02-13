import {config} from './config.ts'

export async function loadStats(groupId: string) {
    const headers = new Headers()
    const sfuConfig = config.sfu as {admin?: {password: string; username: string}; path: string | null; url: string}
    const {password = '', username = ''} = sfuConfig.admin ?? {}
    const authHeader = `Basic ${Buffer.from(`${username}:${password}`, 'utf8').toString('base64')}`
    headers.append('Authorization', authHeader)
    const stats = await (await fetch(`${config.sfu.url}/stats.json`, {headers})).json()
    return (stats as {name: string; [key: string]: unknown}[]).find((i: {name: string}) => i.name === groupId)
}
