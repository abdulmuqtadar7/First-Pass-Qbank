import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from './supabase'

interface AuthContextValue {
  user: User | null
  loading: boolean
  recoveringPassword: boolean
  finishPasswordRecovery: () => void
  signOut: () => Promise<void>
}

const Context = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!!supabase)
  const [recoveringPassword, setRecoveringPassword] = useState(false)

  useEffect(() => {
    if (!supabase) return
    const client = supabase
    let mounted = true
    // Synchronous subscription callback avoids Supabase auth-lock deadlocks.
    const { data: { subscription } } = client.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return
      setSession(nextSession)
      setLoading(false)
      if (event === 'PASSWORD_RECOVERY') setRecoveringPassword(true)
      if (event === 'SIGNED_OUT') setRecoveringPassword(false)
    })
    client.auth.getSession().then(({ data, error }) => {
      if (!mounted) return
      if (error) console.warn('[FirstPass] Could not restore login:', error.message)
      setSession(data.session)
      setLoading(false)
    }).catch(() => { if (mounted) setLoading(false) })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  const value = useMemo<AuthContextValue>(() => ({
    user: session?.user ?? null,
    loading,
    recoveringPassword,
    finishPasswordRecovery: () => setRecoveringPassword(false),
    signOut: async () => {
      if (!supabase) return
      const { error } = await supabase.auth.signOut({ scope: 'local' })
      if (error) throw error
    },
  }), [session, loading, recoveringPassword])
  return <Context.Provider value={value}>{children}</Context.Provider>
}

export function useAuth(): AuthContextValue {
  const context = useContext(Context)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
