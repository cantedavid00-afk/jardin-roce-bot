import { createBrowserClient } from '@supabase/ssr'

export function createSupabaseBrowserClient() {
  // Solo claves públicas: formato nuevo `sb_publishable_…` o `anon` (legado). Respetan RLS.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)!
  )
}