import { useEffect, useState } from 'react'
import { Smartphone, Download } from 'lucide-react'
import { canInstall, isStandalone, requestInstall, subscribeInstall } from '../lib/pwa'
import { card, label } from '../lib/ui'

export default function InstallQB360() {
  const [available, setAvailable] = useState(canInstall)
  const [installed, setInstalled] = useState(isStandalone)
  const [message, setMessage] = useState('')
  useEffect(() => {
    const refresh = () => { setAvailable(canInstall()); setInstalled(isStandalone()) }
    const unsubscribe = subscribeInstall(refresh)
    refresh()
    return unsubscribe
  }, [])
  return <section aria-label="Install QB360">
    <p className={`${label} mb-3`}>Application</p>
    <div className={`${card} p-5`}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent"><Smartphone size={18}/></span>
        <div className="min-w-0 flex-1"><h2 className="text-[13px] font-semibold">{installed ? 'QB360 is installed' : 'Install QB360'}</h2>
          <p className="mt-1 text-xs leading-5 text-muted">{installed ? 'You are using the standalone app. Your account stays synchronized.' : 'Open QB360 from your home screen or desktop, without a browser address bar.'}</p>
        </div>
        {available && !installed && <button type="button" onClick={() => { setMessage(''); void requestInstall().catch(() => setMessage('Use your browser menu to install QB360.')) }} className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-3 py-2 text-xs font-semibold text-white"><Download size={14}/> Install</button>}
      </div>
      {message && <p role="status" className="mt-3 text-xs text-muted">{message}</p>}
      {!installed && <details className="mt-4 border-t border-line pt-3"><summary className="cursor-pointer text-xs font-semibold text-accent">How to install on your device</summary><div className="mt-3 space-y-2 text-xs leading-5 text-muted">
        <p><strong className="text-ink">Android:</strong> Open QB360 in Chrome. Open the browser menu and choose Install app or Add to Home screen.</p>
        <p><strong className="text-ink">iPhone / iPad:</strong> Open QB360 in Safari. Tap Share, then Add to Home Screen.</p>
        <p><strong className="text-ink">Desktop:</strong> In Chrome or Edge, use the install icon in the address bar or the browser menu.</p>
        <p>Installation depends on browser support. Internet is required for normal use; a loaded question session can finish offline.</p>
      </div></details>}
    </div>
  </section>
}
