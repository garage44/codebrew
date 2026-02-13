/**
 * Agent Task Queue Management
 * Handles creation, retrieval, and status updates for agent tasks
 */

import {db} from '../database.ts'
import {randomId} from '@garage44/common/lib/utils'
import type {AgentTask} from '../database.ts'

export type TaskType = 'mention' | 'assignment' | 'manual' | 'refinement'

export type TaskStatus = 'pending' | 'processing' | 'completed' | 'failed'

export interface TaskData {
    [key: string]: unknown
}

/**
 * Create a new agent task
 */
export function createTask(
    agentId: string,
    taskType: TaskType,
    taskData: TaskData,
    priority = 0,
): string {
    const taskId = randomId()
    const now = Date.now()

    db.prepare(`
        INSERT INTO agent_tasks (
            id, agent_id, task_type, task_data, status, priority, created_at
        )
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
    `).run(
        taskId,
        agentId,
        taskType,
        JSON.stringify(taskData),
        priority,
        now,
    )

    return taskId
}

/**
 * Get all pending tasks for an agent, ordered by priority and creation time
 */
export function getPendingTasks(agentId: string): AgentTask[] {
    return db.prepare(`
        SELECT *
        FROM agent_tasks
        WHERE agent_id = ? AND status = 'pending'
        ORDER BY priority DESC, created_at ASC
    `).all(agentId) as AgentTask[]
}

/**
 * Get a task by ID
 */
export function getTask(taskId: string): AgentTask | undefined {
    return db.prepare(`
        SELECT *
        FROM agent_tasks
        WHERE id = ?
    `).get(taskId) as AgentTask | undefined
}

/**
 * Update task status
 */
export function updateTaskStatus(
    taskId: string,
    status: TaskStatus,
    error?: string | null,
): void {
    const now = Date.now()

    if (status === 'processing') {
        db.prepare(`
            UPDATE agent_tasks
            SET status = ?, started_at = ?
            WHERE id = ?
        `).run(status, now, taskId)
    } else if (status === 'completed' || status === 'failed') {
        db.prepare(`
            UPDATE agent_tasks
            SET status = ?, completed_at = ?, error = ?
            WHERE id = ?
        `).run(status, now, error || null, taskId)
    } else {
        db.prepare(`
            UPDATE agent_tasks
            SET status = ?
            WHERE id = ?
        `).run(status, taskId)
    }
}

/**
 * Mark task as processing
 */
export function markTaskProcessing(taskId: string): void {
    updateTaskStatus(taskId, 'processing')
}

/**
 * Mark task as completed
 */
export function markTaskCompleted(taskId: string): void {
    updateTaskStatus(taskId, 'completed')
}

/**
 * Mark task as failed
 */
export function markTaskFailed(taskId: string, error: string): void {
    updateTaskStatus(taskId, 'failed', error)
}

/**
 * Get task statistics for an agent
 */
export function getTaskStats(agentId: string): {
    completed: number
    failed: number
    pending: number
    processing: number
} {
    const stats = db.prepare(`
        SELECT status, COUNT(*) as count
        FROM agent_tasks
        WHERE agent_id = ?
        GROUP BY status
    `).all(agentId) as {count: number; status: string}[]

    const result = {
        completed: 0,
        failed: 0,
        pending: 0,
        processing: 0,
    }

    for (const stat of stats) {
        if (stat.status in result) {
            result[stat.status as keyof typeof result] = stat.count
        }
    }

    return result
}
