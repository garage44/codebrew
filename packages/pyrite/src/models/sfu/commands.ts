// Copyright (c) 2020 by Juliusz Chroboczek.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
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

function findUserId(username) {
    for (const user of $s.users) {
        if (user.username === username) {
            return user.id
        }
    }
    return null
}

function userCommand(c, r) {
    let p = parseCommand(r)
    if (!p[0]) throw new Error(`/${c} requires parameters`)
    let id = findUserId(p[0])
    if (!id) throw new Error(`Unknown user ${p[0]}`)
    connection.userAction(c, id, p[1])
}

function userMessage(c, r) {
    let p = parseCommand(r)
    if (!p[0]) throw new Error(`/${c} requires parameters`)
    let id = findUserId(p[0])
    if (!id) throw new Error(`Unknown user ${p[0]}`)
    connection.userMessage(c, id, p[1])
}

interface Command {
    description?: string
    f: (c?: any, r?: any) => void
    parameters?: string
    predicate?: () => string | null
}

let commands: Record<string, Command> = {}

function operatorPredicate() {
    if (connection && $s.permissions.op)
        return null
    return 'You are not an operator'
}

function recordingPredicate() {
    if (connection && $s.permissions.record)
        return null
    return 'You are not allowed to record'
}

commands.help = {
    description: 'display this help',
    f: () => {
        /** @type {string[]} */
        let cs = []
        for (let cmd in commands) {
            let c = commands[cmd]
            if (!c.description)
                continue
            if (c.predicate && c.predicate())
                continue
            cs.push(`/${cmd}${c.parameters?' ' + c.parameters:''}: ${c.description}`)
        }
        cs.sort()
        let s = ''
        for (let i = 0; i < cs.length; i++)
            s = s + cs[i] + '\n'
        $s.chat.channels.main.messages.push({message: s, nick: null, time: Date.now()})
    },
}

commands.me = {
    f: () => {
        // handled as a special case
        throw new Error("this shouldn't happen")
    },
}

commands.leave = {
    description: "leave group",
    f: () => {
        if (!connection)
            throw new Error('Not connected')
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
    f: (c, r) => {
        connection.groupAction('lock', r)
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
        for (let id in connection.up) {
            connection.up[id].restartIce()
        }
        for (let id in connection.down) {
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
    f: (c, r) => {
        userMessage('warning', r)
    },
    parameters: 'user message',
    predicate: operatorPredicate,
}

commands.wall = {
    description: 'send a warning to all users',
    f: (c, r) => {
        if (!r) throw new Error('empty message')
        connection.userMessage('warning', '', r)
    },
    parameters: 'message',
    predicate: operatorPredicate,

}

/**
 * parseCommand splits a string into two space-separated parts.
 * The first part may be quoted and may include backslash escapes.
 * @param {string} line
 * @returns {string[]}
 */
function parseCommand(line) {
    let i = 0
    while (i < line.length && line[i] === ' ')
        i++
    let start = ' '
    if (i < line.length && line[i] === '"' || line[i] === "'") {
        start = line[i]
        i++
    }
    let first = ""
    while (i < line.length) {
        if (line[i] === start) {
            if (start !== ' ')
                i++
            break
        }
        if (line[i] === '\\' && i < line.length - 1)
            i++
        first = first + line[i]
        i++
    }

    while (i < line.length && line[i] === ' ')
        i++
    return [first, line.slice(i)]
}

export default commands
