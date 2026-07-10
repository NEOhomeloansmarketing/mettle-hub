'use client'

import dynamic from 'next/dynamic'

// ssr:false prevents LoginForm (which calls createBrowserClient) from running
// during next build when NEXT_PUBLIC_SUPABASE_ANON_KEY may not be set yet.
const LoginForm = dynamic(() => import('./LoginForm'), { ssr: false, loading: () => null })

export default function LoginPage() {
  return <LoginForm />
}
