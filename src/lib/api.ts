import { supabase } from "./supabase"

const apiBaseUrl =
  import.meta.env.VITE_API_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session)
    throw new Error("Your session has expired. Please sign in again.")

  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init.body && !(init.body instanceof FormData)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init.headers,
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as {
      message?: string | string[]
    } | undefined
    const message = Array.isArray(payload?.message)
      ? payload.message.join(". ")
      : payload?.message
    throw new Error(
      message || `API request failed with status ${response.status}`,
    )
  }

  return (await response.json()) as T
}

export async function apiDownload(
  path: string,
): Promise<{ blob: Blob; fileName: string }> {
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession()
  if (sessionError) throw sessionError
  if (!session)
    throw new Error("Your session has expired. Please sign in again.")

  const response = await fetch(`${apiBaseUrl.replace(/\/+$/, "")}${path}`, {
    headers: {
      Accept: "*/*",
      Authorization: `Bearer ${session.access_token}`,
    },
  })

  if (!response.ok) {
    const payload = (await response.json().catch(() => undefined)) as {
      message?: string | string[]
    } | undefined
    const message = Array.isArray(payload?.message)
      ? payload.message.join(". ")
      : payload?.message
    throw new Error(
      message || `Download failed with status ${response.status}`,
    )
  }

  const disposition = response.headers.get("content-disposition") ?? ""
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  return {
    blob: await response.blob(),
    fileName: match?.[1] || "cyber-sathi-report",
  }
}
