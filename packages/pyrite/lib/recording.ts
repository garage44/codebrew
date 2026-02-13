import {Glob} from 'bun'
import fs from 'fs-extra'
import path from 'node:path'

import {logger} from '../service.ts'
import {getSfuPath} from './config.ts'

export async function loadRecordings(groupId: string) {
    logger.debug(`load recordings from group: ${groupId}`)
    const recordingsPath = path.join(getSfuPath(), 'recordings')
    const glob = new Glob('*.webm')
    const scanPath = path.join(recordingsPath, groupId)
    const files = Array.from(glob.scanSync(scanPath)).map((f: string) => path.join(scanPath, f))
    const fileStats = await Promise.all(files.map((i: string) => fs.stat(i)))
    const fileNames = files.map((i) => {
        return i.replace(path.join(recordingsPath, groupId), '').replace('.webm', '').replace('/', '')
    })

    const filesData = []
    for (const [index, filename] of fileNames.entries()) {
        const data = {
            atime: fileStats[index].atime,
            extension: 'webm',
            filename,
            size: fileStats[index].size,
        }
        filesData.push(data)
    }

    return filesData
}

export function recordingPath(groupId: string, recording: string) {
    const recordingsPath = path.join(getSfuPath(), 'recordings')
    const dirname = path.join(recordingsPath, groupId)
    // Sanitize against directory traversal?
    return path.join(dirname, recording)
}

export async function deleteRecording(groupId: string, recording: string) {
    const recordingTarget = recordingPath(groupId, recording)
    await fs.remove(recordingTarget)
    const recordings = await loadRecordings(groupId)
    return recordings
}
