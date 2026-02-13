// Copyright (c) 2020 by Juliusz Chroboczek.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// Of this software and associated documentation files (the "Software"), to deal
// In the Software without restriction, including without limitation the rights
// To use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// Copies of the Software, and to permit persons to whom the Software is
// Furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// All copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.  IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import {$s} from '@/app'
import {connection} from './sfu.ts'

function findUserId(username: string): string | null {
    for (const user of $s.users) {
        if (user.username === username) {
            return String(user.id)
        }
    }
    return null
}

function userCommand(c: string, r: string): void {
    const p = parseCommand(r)
    if (!p.cmd) {throw new Error(`/${c} requires parameters`)}
    const id = findUserId(p.cmd)
    if (!id) {throw new Error(`Unknown user ${p.cmd}`)}
    connection.userAction(c, id, p.args.join(' '))
}

function userMessage(c: string, r: string): void {
    const p = parseCommand(r)
    if (!p.cmd) {throw new Error(`/${c} requires parameters`)}
    const id = findUserId(p.cmd)
    if (!id) {throw new Error(`Unknown user ${p.cmd}`)}
    connection.userMessage(c, id, p.args.join(' '))
}

interface Command {
    description?: string
    f: (c?: any, r?: any) => void
    parameters?: string
    predicate?: () => string | null
}

const commands: Record<string, Command> = {}

function operatorPredicate(): string | null {
    if (connection && $s.permissions.op)
        {return null}
    return 'You are not an operator'
}

function recordingPredicate(): string | null {
    if (connection && $s.permissions.record)
        {return null}
    return 'You are not allowed to record'
}

commands.help = {
    description: 'display this help',
    f: () => {
        /** @type {string[]} */
        const cs = []
        for (const cmd in commands) {
            const c = commands[cmd]
            if (!c.description)
                {continue}
            if (c.predicate && c.predicate())
                {continue}
            cs.push(`/${cmd}${c.parameters ? ' ' + c.parameters : ''}: ${c.description}`)
        }
        cs.sort()
        let s = ''
        for (let i = 0; i < cs.length; i++)
            {s = s + cs[i] + '\n'}
        $s.chat.channels.main.messages.push({kind: 'message', message: s, nick: null, time: Date.now()})
    },
}

commands.me = {
    f: () => {
        // Handled as a special case
        throw new Error("this shouldn't happen")
    },
}

commands.leave = {
    description: "leave group",
    f: () => {
        if (!connection)
            {throw new Error('Not connected')}
        connection.close()
    },
}

commands.clear = {
    description: 'clear the chat history',
    f: () => {
        connection.groupAction('clearchat')
    },
    predicate: operatorPredicate,
}

commands.lock = {
    description: 'lock this group',
    f: (_c: string | undefined, r: string | undefined): void => {
        connection.groupAction('lock', r || '')
    },
    parameters: '[message]',
    predicate: operatorPredicate,
}

commands.unlock = {
    description: 'unlock this group, revert the effect of /lock',
    f: () => {
        connection.groupAction('unlock')
    },
    predicate: operatorPredicate,
}

commands.record = {
    description: 'start recording',
    f: () => {
        connection.groupAction('record')
    },
    predicate: recordingPredicate,
}

commands.unrecord = {
    description: 'stop recording',
    f: () => {
        connection.groupAction('unrecord')
    },
    predicate: recordingPredicate,
}

commands.subgroups = {
    description: 'list subgroups',
    f: () => {
        connection.groupAction('subgroups')
    },
    predicate: operatorPredicate,
}

commands.renegotiate = {
    description: 'renegotiate media streams',
    f: () => {
        for (const id in connection.up) {
            connection.up[id].restartIce()
        }
        for (const id in connection.down) {
            connection.down[id].restartIce()
        }
    },
}

commands.kick = {
    description: 'kick out a user',
    f: userCommand,
    parameters: 'user [message]',
    predicate: operatorPredicate,
}

commands.op = {
    description: 'give operator status',
    f: userCommand,
    parameters: 'user',
    predicate: operatorPredicate,
}

commands.unop = {
    description: 'revoke operator status',
    f: userCommand,
    parameters: 'user',
    predicate: operatorPredicate,
}

commands.present = {
    description: 'give user the right to present',
    f: userCommand,
    parameters: 'user',
    predicate: operatorPredicate,
}

commands.unpresent = {
    description: 'revoke the right to present',
    f: userCommand,
    parameters: 'user',
    predicate: operatorPredicate,
}

commands.mute = {
    description: 'mute a remote user',
    f: userMessage,
    parameters: 'user',
    predicate: operatorPredicate,
}

commands.muteall = {
    description: 'mute all remote users',
    f: () => {
        connection.userMessage('mute', null, null, true)
    },
    predicate: operatorPredicate,
}

commands.warn = {
    description: 'send a warning to a user',
    f: (_c: string | undefined, r: string | undefined): void => {
        if (!r) {throw new Error('empty message')}
        userMessage('warning', r)
    },
    parameters: 'user message',
    predicate: operatorPredicate,
}

commands.wall = {
    description: 'send a warning to all users',
    f: (_c: string | undefined, r: string | undefined): void => {
        if (!r) {throw new Error('empty message')}
        connection.userMessage('warning', '', r)
    },
    parameters: 'message',
    predicate: operatorPredicate,

}

/**
 * ParseCommand splits a string into two space-separated parts.
 * The first part may be quoted and may include backslash escapes.
 * @param {string} line
 * @returns {string[]}
 */
function parseCommand(line: string): {cmd: string; args: string[]} {
    let i = 0
    while (i < line.length && line[i] === ' ')
        {i++}
    let start = ' '
    if (i < line.length && line[i] === '"' || line[i] === "'") {
        start = line[i]
        i++
    }
    let first = ""
    while (i < line.length) {
        if (line[i] === start) {
            if (start !== ' ')
                {i++}
            break
        }
        if (line[i] === '\\' && i < line.length - 1)
            {i++}
        first += line[i]
        i++
    }

    while (i < line.length && line[i] === ' ')
        {i++}
    const rest = line.slice(i)
    const args = rest ? rest.split(' ').filter((arg): boolean => arg.length > 0) : []
    return {args, cmd: first}
}

export default commands
