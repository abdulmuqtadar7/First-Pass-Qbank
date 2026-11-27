// Install support only. Never refresh an open exam or cache student data.
interface InstallPrompt extends Event {
  prompt(): Promise<unknown>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}
let pending: InstallPrompt | null = null
const listeners = new Set<() => void>()
function notify() { for (const listener of listeners) listener() }
export function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
}
export function canInstall() { return pending !== null && !isStandalone() }
export function subscribeInstall(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
export async function requestInstall() {
  const event = pending
  if (!event) return
  pending = null
  notify()
  await event.prompt()
  await event.userChoice
  notify()
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault()
  pending = event as InstallPrompt
  notify()
})
window.addEventListener('appinstalled', () => { pending = null; notify() })
window.matchMedia('(display-mode: standalone)').addEventListener?.('change', notify)
// Service worker registration is maintained in src/main.tsx.
