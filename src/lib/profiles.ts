import { supabase } from "./supabase"

export type Profile = {
  id: string

  username: string | null

  full_name: string | null

  avatar_url: string | null

  bio: string | null

  created_at: string

  updated_at: string
}

type AuthUserLike = {
  id: string

  user_metadata?: Record<string, unknown> | null
}

function metaString(
  metadata: Record<string, unknown> | null | undefined,

  key: string,
): string | null {
  const value = metadata?.[key]

  if (typeof value !== "string") return null

  const trimmed = value.trim()

  return trimmed.length > 0 ? trimmed : null
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase

    .from("profiles")

    .select("*")

    .eq("id", userId)

    .maybeSingle()

  if (error) throw error

  return data
}

export async function ensureProfile(user: AuthUserLike): Promise<Profile> {
  const existing = await fetchProfile(user.id)

  if (existing) return existing

  const metadata = user.user_metadata ?? {}

  const row = {
    id: user.id,

    username: metaString(metadata, "username"),

    full_name:
      metaString(metadata, "full_name") ??
      metaString(metadata, "displayName") ??
      metaString(metadata, "name"),

    avatar_url: metaString(metadata, "avatar_url"),
  }

  const { data, error } = await supabase

    .from("profiles")

    .upsert(row, { onConflict: "id" })

    .select("*")

    .single()

  if (error) throw error

  return data
}

export async function updateProfile(
  userId: string,

  patch: Partial<Pick<Profile, "username" | "full_name" | "avatar_url" | "bio">>,
): Promise<Profile> {
  const { data, error } = await supabase

    .from("profiles")

    .update(patch)

    .eq("id", userId)

    .select("*")

    .single()

  if (error) throw error

  return data
}
