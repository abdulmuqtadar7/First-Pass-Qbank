import { useState, type FormEvent } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { ArrowRight, BookOpen, Check, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, Sparkles } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { isCloudConfigured, supabase } from '../lib/supabase'

type Mode = 'login' | 'signup' | 'forgot' | 'recover'

export default function AuthScreen() {
  const { recoveringPassword, finishPasswordRecovery } = useAuth()
  const [mode, setMode] = useState<Mode>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [reveal, setReveal] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const currentMode = recoveringPassword ? 'recover' : mode

  const changeMode = (next: Mode) => {
    setMode(next); setError(''); setMessage(''); setPassword(''); setConfirmPassword('')
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(''); setMessage('')
    if (!supabase) return
    if ((currentMode === 'signup' || currentMode === 'recover') && password !== confirmPassword) {
      setError('Passwords do not match.'); return
    }
    if ((currentMode === 'signup' || currentMode === 'recover') && password.length < 8) {
      setError('Use at least 8 characters for your password.'); return
    }
    setBusy(true)
    try {
      if (currentMode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else if (currentMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(), password,
          options: { emailRedirectTo: window.location.origin },
        })
        if (error) throw error
        setMessage(data.session
          ? 'Account created. Your private study space is ready.'
          : 'Check your inbox for a verification link, then come back and log in.')
        if (!data.session) { setMode('login'); setPassword(''); setConfirmPassword('') }
      } else if (currentMode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: window.location.origin,
        })
        if (error) throw error
        setMessage('If this email has an account, a password-reset link is on its way.')
      } else {
        const { error } = await supabase.auth.updateUser({ password })
        if (error) throw error
        finishPasswordRecovery()
        setMode('login')
        setPassword('')
        setConfirmPassword('')
        setMessage('Password updated successfully.')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not complete your request. Please try again.')
    } finally { setBusy(false) }
  }

  const title = currentMode === 'signup' ? 'Your journey starts here.'
    : currentMode === 'forgot' ? 'Reset your password.'
    : currentMode === 'recover' ? 'Choose a new password.' : 'Welcome back.'

  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(470px,0.82fr)]">
      <section className="relative hidden min-h-dvh flex-col justify-between overflow-hidden bg-[#2d2341] px-[clamp(32px,6vw,112px)] py-12 text-[#faf5ff] lg:flex">
        <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(circle at 65% 40%,#8553b44f,transparent 55%),radial-gradient(circle at 12% 100%,#784f944f,transparent 40%)' }} />
        <div className="relative flex items-center gap-3 text-xl font-bold tracking-tight"><Logo /> FirstPass <span className="font-light">Q-Bank</span></div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .48 }} className="relative max-w-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#d6b8ff3b] bg-[#bd98ef1c] px-4 py-2 text-[11px] font-extrabold tracking-[.22em] text-[#debfff]"><Sparkles size={14} /> YOUR STUDY JOURNEY</span>
          <h2 className="mt-7 font-display text-[clamp(58px,6.2vw,100px)] leading-[.97] tracking-[-.075em]">Medicine is a journey.<span className="block text-[#c6a0ff]">Make it yours.</span></h2>
          <p className="mt-8 max-w-md text-[16px] leading-8 text-[#ddd0e9]">One beautifully focused place for every First Aid concept, every practice question, and every step of your progress.</p>
        </motion.div>
        <div className="relative flex flex-wrap gap-5 text-xs text-[#d3c2e5]"><span className="inline-flex items-center gap-2"><ShieldCheck size={16} /> Private cloud progress</span><span className="inline-flex items-center gap-2"><BookOpen size={16} /> Your whole question bank</span></div>
      </section>

      <section className="flex min-h-dvh flex-col px-5 pb-16 pt-8 sm:px-10 lg:justify-center lg:px-[clamp(32px,6vw,110px)]">
        <div className="mb-14 flex items-center gap-2.5 text-[18px] font-bold lg:hidden"><Logo /> FirstPass <span className="font-normal">Q-Bank</span></div>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={currentMode} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: .18 }} className="mx-auto w-full max-w-[440px]">
            <span className="text-[11px] font-extrabold uppercase tracking-[.23em] text-accent">Your personal study space</span>
            <h1 className="mt-3 font-display text-[clamp(43px,4vw,62px)] leading-[1.07] tracking-[-.065em]">{title}</h1>
            <p className="mt-4 text-sm leading-7 text-muted">{currentMode === 'signup' ? 'Create an account to keep your learning safe and synced.' : currentMode === 'forgot' ? 'We’ll send you a secure link to get back in.' : currentMode === 'recover' ? 'Use a strong new password to protect your progress.' : 'Log in to pick up right where you left off.'}</p>

            {!isCloudConfigured ? (
              <div className="mt-9 rounded-2xl border border-[#eac69a] bg-[#fff4e6] p-5 text-[#674423] dark:bg-[#3d3028] dark:text-[#f8dbbe]">
                <p className="font-bold">Cloud setup needed</p>
                <p className="mt-2 text-[13px] leading-6">Create a Supabase project, run the supplied database SQL, and add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_PUBLISHABLE_KEY</code> to <code>.env.local</code>. Then restart Vite. Your existing progress is unchanged.</p>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 space-y-4">
                {currentMode !== 'recover' && <label className="block"><span className="mb-2 block text-[12px] font-bold">Email address</span><span className="relative block"><Mail size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input required type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="doctor@example.com" className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-4 text-[14px] outline-none transition focus:border-accent" /></span></label>}
                {currentMode !== 'forgot' && <label className="block"><span className="mb-2 block text-[12px] font-bold">{currentMode === 'recover' ? 'New password' : 'Password'}</span><span className="relative block"><LockKeyhole size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted"/><input required type={reveal ? 'text' : 'password'} autoComplete={currentMode === 'login' ? 'current-password' : 'new-password'} minLength={currentMode === 'login' ? undefined : 8} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" className="h-14 w-full rounded-2xl border border-line bg-surface pl-12 pr-12 text-[14px] outline-none transition focus:border-accent" /><button type="button" aria-label={reveal ? 'Hide password' : 'Show password'} onClick={() => setReveal(!reveal)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted">{reveal ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>}
                {(currentMode === 'signup' || currentMode === 'recover') && <label className="block"><span className="mb-2 block text-[12px] font-bold">Confirm password</span><input required type="password" minLength={8} autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter it again" className="h-14 w-full rounded-2xl border border-line bg-surface px-4 text-[14px] outline-none transition focus:border-accent" /></label>}
                {currentMode === 'login' && <div className="text-right"><button type="button" onClick={() => changeMode('forgot')} className="text-xs font-semibold text-accent hover:underline">Forgot password?</button></div>}
                {error && <p role="alert" className="rounded-xl border border-bad/25 bg-bad/10 px-4 py-3 text-xs leading-5 text-bad">{error}</p>}
                {message && <p role="status" className="flex gap-2 rounded-xl border border-good/25 bg-good/10 px-4 py-3 text-xs leading-5 text-good"><Check size={16} className="shrink-0" />{message}</p>}
                <button disabled={busy} className="flex h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#783aca] px-5 text-[14px] font-bold text-white shadow-[0_13px_30px_-14px_#783acaaa] transition hover:bg-[#682ac1] disabled:opacity-60">{busy ? 'Please wait…' : currentMode === 'signup' ? 'Create my account' : currentMode === 'forgot' ? 'Send reset link' : currentMode === 'recover' ? 'Save new password' : 'Log in to FirstPass'} <ArrowRight size={18} /></button>
              </form>
            )}

            {isCloudConfigured && currentMode !== 'recover' && <div className="mt-8 border-t border-line pt-6 text-center text-[13px] text-muted">{currentMode === 'login' ? 'New to FirstPass?' : 'Already have an account?'} <button onClick={() => changeMode(currentMode === 'login' ? 'signup' : 'login')} className="ml-1 font-bold text-accent hover:underline">{currentMode === 'login' ? 'Create an account' : 'Log in'}</button></div>}
            <p className="mt-12 flex items-center justify-center gap-1.5 text-center text-[11px] text-muted"><ShieldCheck size={14}/> Your progress is private to your account.</p>
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  )
}

function Logo() {
  return <span aria-hidden className="flex h-9 items-center gap-1"><span className="h-6 w-3 -skew-x-[18deg] rounded-[4px] bg-[#b78cfa]"/><span className="h-6 w-3 -skew-x-[18deg] rounded-[4px] bg-[#7130c7]"/></span>
}
