import {deepSignal, type DeepSignal} from 'deepsignal'
import {useRef} from 'preact/hooks'

import {api, notifier} from '@/app'

export interface CollectionManagerConfig<TItem, TFormData> {
    /**
     * API endpoint for creating items (e.g., '/api/users' or a function that takes formData)
     */
    createEndpoint: string | ((formData: TFormData) => string)

    /**
     * Function to build the delete endpoint URL (e.g., (id) => `/api/users/${id}/delete`)
     */
    deleteEndpoint: (id: string | number) => string

    /**
     * HTTP method for delete (default: 'DELETE', users API uses 'GET')
     */
    deleteMethod?: 'GET' | 'DELETE'

    /**
     * Function to get the ID from an item
     */
    getId: (item: TItem) => string | number

    /**
     * Initial form data
     */
    initialFormData: TFormData

    /**
     * API endpoint for listing items (e.g., '/api/users')
     */
    listEndpoint: string

    /**
     * Success messages
     */
    messages?: {
        createFailed?: string
        createSuccess?: string
        deleteConfirm?: (item: TItem) => string
        deleteFailed?: string
        deleteSuccess?: string
        loadFailed?: string
        updateFailed?: string
        updateSuccess?: string
    }

    /**
     * Function to populate form data from an item
     */
    populateFormData: (item: TItem) => TFormData

    /**
     * Function to transform form data to API payload for create
     */
    transformCreateData: (formData: TFormData) => unknown

    /**
     * Function to transform form data to API payload for update
     */
    transformUpdateData: (formData: TFormData) => unknown

    /**
     * Function to build the update endpoint URL (e.g., (id) => `/api/users/${id}`)
     */
    updateEndpoint: (id: string | number) => string

    /**
     * HTTP method for update (default: 'PUT', users API uses 'POST')
     */
    updateMethod?: 'PUT' | 'POST'
}

export interface CollectionManagerState<TItem, TFormData> {
    editing: string | number | null
    error: string | null
    formData: TFormData
    items: TItem[]
    loading: boolean
}

/**
 * Generic collection management hook for CRUD operations
 *
 * Provides a reusable pattern for managing collections with:
 * - Loading items from API
 * - Creating new items
 * - Updating existing items
 * - Deleting items
 * - Form state management
 *
 * @example
 * const manager = useCollectionManager({
 *   listEndpoint: '/api/users',
 *   createEndpoint: '/api/users',
 *   updateEndpoint: (id) => `/api/users/${id}`,
 *   deleteEndpoint: (id) => `/api/users/${id}/delete`,
 *   getId: (user) => user.id,
 *   initialFormData: { username: '', password: '', admin: false },
 *   transformCreateData: (data) => ({ username: data.username, ... }),
 *   transformUpdateData: (data) => ({ username: data.username, ... }),
 *   populateFormData: (user) => ({ username: user.username, ... }),
 * })
 */
export function useCollectionManager<TItem, TFormData>(config: CollectionManagerConfig<TItem, TFormData>) {
    const stateRef = useRef(
        deepSignal<CollectionManagerState<TItem, TFormData>>({
            editing: null,
            error: null,
            formData: config.initialFormData,
            items: [],
            loading: false,
        }),
    )
    const state = stateRef.current

    const loadItems = async () => {
        state.loading = true
        state.error = null
        try {
            const data = await api.get(config.listEndpoint)
            state.items = Array.isArray(data) ? data : []
        } catch {
            state.error = config.messages?.loadFailed || 'Failed to load items'
            notifier.notify({
                level: 'error',
                message: state.error,
            })
        } finally {
            state.loading = false
        }
    }

    const createItem = async () => {
        try {
            state.loading = true
            state.error = null
            const payload = config.transformCreateData(state.formData as TFormData)
            const endpoint =
                typeof config.createEndpoint === 'function'
                    ? config.createEndpoint(state.formData as TFormData)
                    : config.createEndpoint
            const newItem = (await api.post(endpoint, payload)) as TItem
            state.items = [...state.items, newItem] as (TItem & DeepSignal<TItem>)[]
            Object.assign(state.formData, config.initialFormData)
            notifier.notify({
                level: 'success',
                message: config.messages?.createSuccess || 'Item created successfully',
            })
            return newItem
        } catch (error) {
            const message = error instanceof Error ? error.message : config.messages?.createFailed || 'Failed to create item'
            state.error = message
            notifier.notify({
                level: 'error',
                message,
            })
            throw error
        } finally {
            state.loading = false
        }
    }

    const updateItem = async (itemId: string | number) => {
        try {
            state.loading = true
            state.error = null
            const payload = config.transformUpdateData(state.formData as TFormData)
            const method = config.updateMethod || 'PUT'
            const updatedItem =
                method === 'POST'
                    ? ((await api.post(config.updateEndpoint(itemId), payload)) as TItem)
                    : ((await api.put(config.updateEndpoint(itemId), payload)) as TItem)
            state.items = state.items.map((item) => {
                const itemValue = item as unknown as TItem
                return config.getId(itemValue) === itemId ? updatedItem : itemValue
            }) as (TItem & DeepSignal<TItem>)[]
            state.editing = null
            Object.assign(state.formData, config.initialFormData)
            notifier.notify({
                level: 'success',
                message: config.messages?.updateSuccess || 'Item updated successfully',
            })
            return updatedItem
        } catch (error) {
            const message = error instanceof Error ? error.message : config.messages?.updateFailed || 'Failed to update item'
            state.error = message
            notifier.notify({
                level: 'error',
                message,
            })
            throw error
        } finally {
            state.loading = false
        }
    }

    const deleteItem = async (item: TItem) => {
        const itemId = config.getId(item)
        const confirmMessage = config.messages?.deleteConfirm
            ? config.messages.deleteConfirm(item)
            : 'Are you sure you want to delete this item?'

        if (!confirm(confirmMessage)) {
            return
        }

        try {
            state.loading = true
            state.error = null
            const method = config.deleteMethod || 'DELETE'
            if (method === 'GET') {
                await api.get(config.deleteEndpoint(itemId))
            } else {
                await api.delete(config.deleteEndpoint(itemId), {})
            }
            state.items = state.items.filter((i) => config.getId(i as unknown as TItem) !== itemId) as (TItem &
                DeepSignal<TItem>)[]
            if (state.editing === itemId) {
                state.editing = null
                Object.assign(state.formData, config.initialFormData)
            }
            notifier.notify({
                level: 'success',
                message: config.messages?.deleteSuccess || 'Item deleted successfully',
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : config.messages?.deleteFailed || 'Failed to delete item'
            state.error = message
            notifier.notify({
                level: 'error',
                message,
            })
            throw error
        } finally {
            state.loading = false
        }
    }

    const startEdit = (item: TItem) => {
        state.editing = config.getId(item)
        Object.assign(state.formData, config.populateFormData(item))
    }

    const cancelEdit = () => {
        state.editing = null
        Object.assign(state.formData, config.initialFormData)
    }

    return {
        cancelEdit,
        createItem,
        deleteItem,
        loadItems,
        startEdit,
        state,
        updateItem,
    }
}
