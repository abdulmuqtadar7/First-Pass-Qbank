import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'motion/react'
import './index.css'
import App from './App'
import { StoreProvider } from './lib/store'
import { LearningProvider } from './lib/learning'
import { AuthProvider } from './lib/auth'
import { CloudSyncProvider } from './lib/cloudSync'
import AccountGate from './components/AccountGate'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 420, damping: 32, mass: 0.8 }}>
      <AuthProvider>
        <AccountGate>{(userId, boot) => (
          <StoreProvider key={userId} userId={userId}>
            <LearningProvider userId={userId}>
              <CloudSyncProvider userId={userId} boot={boot}>
                <App userId={userId} />
              </CloudSyncProvider>
            </LearningProvider>
          </StoreProvider>
        )}</AccountGate>
      </AuthProvider>
    </MotionConfig>
  </StrictMode>,
)

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {})
  })
}
