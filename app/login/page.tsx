'use client'

import Image from 'next/image'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Icon } from '@/components/ui/Icon'
import { cls } from '@/lib/utils'

export default function LoginPage() {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<'signin' | 'signup'>('signin')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pendingEmail, setPendingEmail] = useState('')

  // Sign in fields
  const [siEmail, setSiEmail] = useState('')
  const [siPass, setSiPass] = useState('')

  // Sign up fields
  const [suName, setSuName] = useState('')
  const [suEmail, setSuEmail] = useState('')
  const [suPass, setSuPass] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      const { data, error: authErr } = await supabase.auth.signInWithPassword({
        email: siEmail, password: siPass,
      })
      if (authErr) throw authErr

      // Check approval status
      const { data: account } = await supabase
        .from('accounts').select('status').eq('id', data.user!.id).single()

      if (!account || account.status === 'pending') {
        await supabase.auth.signOut()
        setPendingEmail(siEmail)
        return
      }
      if (account.status === 'denied') {
        await supabase.auth.signOut()
        throw new Error('Your access request was not approved. Contact colin.jenson@neohomeloans.com.')
      }
      router.push('/dashboard')
    } catch (err: any) {
      setError(err.message || 'Sign-in failed.')
    } finally {
      setLoading(false)
    }
  }

  async function handleSignUp(e: React.FormEvent) {
    e.preventDefault()
    setError(''); setLoading(true)
    try {
      if (!suEmail.toLowerCase().endsWith('@neohomeloans.com')) {
        throw new Error('Use a @neohomeloans.com email address.')
      }
      if (suPass.length < 6) throw new Error('Password must be at least 6 characters.')
      if (!suName.trim()) throw new Error('Name is required.')

      const { data, error: authErr } = await supabase.auth.signUp({
        email: suEmail, password: suPass,
        options: { data: { name: suName } },
      })
      if (authErr) throw authErr

      // Insert into accounts as pending
      await supabase.from('accounts').upsert({
        id: data.user!.id,
        email: suEmail.toLowerCase(),
        name: suName,
        role: 'team_member',
        status: 'pending',
        initials: suName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2),
        color: '#4D7FFF',
      })

      setPendingEmail(suEmail)
    } catch (err: any) {
      setError(err.message || 'Sign-up failed.')
    } finally {
      setLoading(false)
    }
  }

  if (pendingEmail) {
    return (
      <div className="login">
        <div className="login__pane">
          <div className="login__mark">
            <Image src="/ninja-logo.png" alt="Mettle" width={56} height={38} priority />
            <div>
              <div className="login__brand">Mettle</div>
              <div className="login__sub">Marketing Hub</div>
            </div>
          </div>
          <div className="login__pending">
            <div className="login__pending-icon"><Icon name="check" size={24} /></div>
            <h2>Request sent</h2>
            <p className="login__pending-body">
              Your access request has been sent to{' '}
              <strong>colin.jenson@neohomeloans.com</strong>.
              You&apos;ll receive an email once your account is approved.
            </p>
            <div className="login__note">
              <Icon name="mail" size={14} />
              Signed up as {pendingEmail}
            </div>
            <button className="btn" onClick={() => setPendingEmail('')}>← Back to sign in</button>
          </div>
        </div>
        <div className="login__art">
          <ArtGrid />
          <Image
            src="/ninja-logo.png"
            alt="Marketing Ninjas"
            width={520}
            height={347}
            className="login__ninja"
            priority
          />
          <div className="login__art-text">
            <div className="login__art-kicker">Neo Home Loans</div>
            <div className="login__art-name">Mettle Marketing Hub</div>
            <div className="login__art-tagline">
              AI-assisted content operations for CRNA, Entrepreneur, and Physician home loan channels.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login">
      <div className="login__pane">
        <div className="login__mark">
          <div className="wordmark__mark">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <rect x="3" y="6" width="3" height="16" fill="currentColor" opacity="0.55"/>
              <rect x="9" y="2" width="3" height="20" fill="currentColor" opacity="0.80"/>
              <rect x="15" y="6" width="3" height="16" fill="currentColor" opacity="0.55"/>
              <rect x="21" y="9" width="3" height="13" fill="var(--accent)"/>
              <circle cx="22.5" cy="6" r="1.6" fill="var(--accent)"/>
            </svg>
          </div>
          <div>
            <div className="login__brand">Mettle</div>
            <div className="login__sub">Marketing Hub · Neo Home Loans</div>
          </div>
        </div>

        <div className="login__tabs">
          <button
            className={cls('login__tab', tab === 'signin' && 'login__tab--active')}
            onClick={() => { setTab('signin'); setError('') }}
          >
            Sign in
          </button>
          <button
            className={cls('login__tab', tab === 'signup' && 'login__tab--active')}
            onClick={() => { setTab('signup'); setError('') }}
          >
            Request access
          </button>
        </div>

        {tab === 'signin' ? (
          <form className="login__form" onSubmit={handleSignIn}>
            {error && <div className="login__error">{error}</div>}
            <div className="login__field">
              <label>Work email</label>
              <input
                className="input"
                type="email"
                placeholder="you@neohomeloans.com"
                value={siEmail}
                onChange={e => setSiEmail(e.target.value)}
                required
              />
            </div>
            <div className="login__field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                placeholder="••••••••"
                value={siPass}
                onChange={e => setSiPass(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        ) : (
          <form className="login__form" onSubmit={handleSignUp}>
            {error && <div className="login__error">{error}</div>}
            <div className="login__note">
              <Icon name="lock" size={14} />
              Only @neohomeloans.com addresses are accepted. Admin approval required.
            </div>
            <div className="login__field">
              <label>Full name</label>
              <input
                className="input"
                type="text"
                placeholder="Jane Smith"
                value={suName}
                onChange={e => setSuName(e.target.value)}
                required
              />
            </div>
            <div className="login__field">
              <label>Work email</label>
              <input
                className="input"
                type="email"
                placeholder="you@neohomeloans.com"
                value={suEmail}
                onChange={e => setSuEmail(e.target.value)}
                required
              />
            </div>
            <div className="login__field">
              <label>Password</label>
              <input
                className="input"
                type="password"
                placeholder="At least 6 characters"
                value={suPass}
                onChange={e => setSuPass(e.target.value)}
                required
                minLength={6}
              />
            </div>
            <button type="submit" className="btn btn--primary" disabled={loading}>
              {loading ? 'Sending request…' : 'Request access'}
            </button>
          </form>
        )}
      </div>

      <div className="login__art">
        <ArtGrid />
        <Image
          src="/ninja-logo.png"
          alt="Marketing Ninjas"
          width={520}
          height={347}
          className="login__ninja"
          priority
        />
        <div className="login__art-text">
          <div className="login__art-kicker">Neo Home Loans</div>
          <div className="login__art-name">Mettle Marketing Hub</div>
          <div className="login__art-tagline">
            AI-assisted content operations for CRNA, Entrepreneur, and Physician home loan channels.
          </div>
        </div>
      </div>
    </div>
  )
}

function ArtGrid() {
  const dots = Array.from({ length: 49 })
  return (
    <div className="login__art-grid">
      {dots.map((_, i) => (
        <span key={i} style={{ animationDelay: `${(i % 7) * 0.18 + Math.floor(i / 7) * 0.12}s` }} />
      ))}
    </div>
  )
}
