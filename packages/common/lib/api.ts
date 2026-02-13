export class Api {
    async delete<T = unknown>(endpoint: string, data: unknown): Promise<T> {
        const response = await fetch(endpoint, {
            body: JSON.stringify(data),
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'DELETE',
        })
        return (await response.json()) as T
    }

    async get<T = unknown>(endpoint: string, params: Record<string, unknown> | null = null): Promise<T> {
        const url = new URL(endpoint, globalThis.location.origin)
        if (params) {
            Object.entries(params).forEach(([key, value]) => {
                if (!value) {
                    value = ''
                }
                url.searchParams.append(key, String(value))
            })
        }

        const res = await fetch(url, {
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'GET',
        })

        if (res.status === 401) {
            return {status: 'unauthorized'} as T
        }
        return (await res.json()) as T
    }

    async post<T = unknown>(endpoint: string, data: unknown): Promise<T> {
        const response = await fetch(endpoint, {
            body: JSON.stringify(data),
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
        })
        return (await response.json()) as T
    }

    async put<T = unknown>(endpoint: string, data: unknown): Promise<T> {
        const response = await fetch(endpoint, {
            body: JSON.stringify(data),
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'PUT',
        })
        return (await response.json()) as T
    }
}
