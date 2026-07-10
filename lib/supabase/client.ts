import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  // Fallback values prevent createBrowserClient from throwing during next build
  // when NEXT_PUBLIC vars are not yet set in the deploy environment.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  return createBrowserClient(url, key)
}
