import { useEffect, useState } from 'react'
import { useAuth } from './auth'
import { supabase } from './supabase'

export function useOwnerAccess(enabled = true) {
  const { user } = useAuth()
  const uid = user?.id
  const [result, setResult] = useState<{ uid: string; status: 'owner' | 'denied' | 'error' } | null>(null)
  useEffect(() => {
    if (!enabled || !uid || !supabase) return
    const client = supabase
    let live = true
    void (async () => {
      try {
        const { data, error } = await client.rpc('firstpass_is_owner')
        if (live) setResult({ uid, status: error ? 'error' : data === true ? 'owner' : 'denied' })
      } catch { if (live) setResult({ uid, status: 'error' }) }
    })()
    return () => { live = false }
  }, [enabled, uid])
  return !uid || !supabase ? 'denied' : result?.uid === uid ? result.status : 'loading'
}

// Mirrors the SQL's read-only analytics transform, not the stored progress codec.
export function analyticsKey(id: string): string {
  return JSON.parse(JSON.stringify(id).replaceAll('\\u0001', '\\u0001S').replaceAll('\\u0000', '\\u0001N')) as string
}
