/**
 * Firebase Realtime Database — thin REST wrapper.
 * No SDK needed; all operations use the public REST API.
 */

const DB = 'https://signalxauusd-d1e20-default-rtdb.asia-southeast1.firebasedatabase.app'

async function req<T>(
  path:   string,
  method: string,
  body?:  unknown,
  params?: Record<string, string>,
): Promise<T | null> {
  try {
    const url = new URL(`${DB}/${path}.json`)
    if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v))
    const res = await fetch(url.toString(), {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body:    body ? JSON.stringify(body) : undefined,
      cache:   'no-store',
    })
    if (!res.ok) return null
    return res.json() as Promise<T>
  } catch {
    return null
  }
}

export const fbGet    = <T>(path: string, params?: Record<string, string>) => req<T>(path, 'GET', undefined, params)
export const fbSet    = (path: string, value: unknown) => req(path, 'PUT', value)
export const fbDelete = (path: string) => req(path, 'DELETE')

/** Atomic server-side increment using Firebase server values — no read/write race. */
export function fbIncrement(path: string, delta = 1): Promise<unknown> {
  return req(path, 'PUT', { '.sv': { increment: delta } })
}
