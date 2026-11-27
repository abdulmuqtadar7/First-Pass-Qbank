import { useEffect, useState } from 'react'
import { Cloud, WifiOff } from 'lucide-react'
export function useBrowserOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const change = () => setOnline(navigator.onLine)
    window.addEventListener('online', change); window.addEventListener('offline', change)
    return () => { window.removeEventListener('online', change); window.removeEventListener('offline', change) }
  }, [])
  return online
}
export default function ConnectivityGate({ checking = false, retry }: { checking?: boolean; retry?: () => void }) {
  const Icon = checking ? Cloud : WifiOff
  return <section role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-center text-ink"><div className="w-full max-w-sm rounded-[30px] border border-line bg-surface p-8 shadow-xl"><Icon size={36} className="mx-auto mb-5 text-accent"/><h1 className="text-2xl font-bold">{checking ? 'Checking your cloud progress' : 'No internet connection'}</h1><p className="mt-3 text-sm leading-6 text-muted">{checking ? 'QB360 is checking the latest saved progress before opening your study desk.' : 'Please check your internet connection. QB360 will reconnect automatically. Any pending study progress stays on this device.'}</p>{!checking && retry && <button onClick={retry} className="mt-5 rounded-xl bg-accent px-5 py-3 text-sm font-semibold text-white">Check connectivity</button>}</div></section>
}
