import { createClient } from "@supabase/supabase-js"

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  import.meta.env.EXPO_PUBLIC_SUPABASE_URL ||
  ""
const supabaseAnonKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  import.meta.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  ""

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or the EXPO_PUBLIC equivalents).",
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
