#!/usr/bin/env bash
# FirstPass speed update: static 2D doctors + separately loaded system JSON.
# Run from the project root in GitHub Codespaces.
set -euo pipefail

for file in package.json src/lib/data.ts src/lib/store.tsx src/App.tsx src/components/DoctorWalk.tsx src/assets/doctor-male-a.png src/assets/doctor-female-a.png; do
  if [ ! -f "$file" ]; then
    echo "Missing $file. Open the FirstPass project root before running this." >&2
    exit 1
  fi
done
if ! command -v patch >/dev/null; then
  echo "The 'patch' command is required. Run: sudo apt-get install patch" >&2
  exit 1
fi

patch_file=$(mktemp)
trap 'rm -f "$patch_file"' EXIT
cat <<'FIRSTPASS_SPEED_PATCH' > "$patch_file"
--- a/src/lib/data.ts
+++ b/src/lib/data.ts
@@ -140,13 +140,22 @@
 
 export const BUNDLED_FILES: BundledFile[] = []
 
-const modules = import.meta.glob<unknown>('../data/*.json', { eager: true, import: 'default' })
+// Keep large question banks out of the initial application bundle.
+// Vite creates a separate, cacheable chunk for each system JSON.
+const modules = import.meta.glob<unknown>('../data/*.json', { import: 'default' })
 
-function loadBundled(): RawQuestion[] {
+export const BASE_QUESTIONS: RawQuestion[] = []
+let loadPromise: Promise<RawQuestion[]> | undefined
+
+async function readBundled(): Promise<RawQuestion[]> {
   const seen = new Set<string>()
   const out: RawQuestion[] = []
-  for (const path of Object.keys(modules).sort()) {
-    const { valid, errors, rejected } = validateQuestions(modules[path])
+  BUNDLED_FILES.length = 0
+  // Download independent system chunks concurrently, then merge in stable order.
+  const paths = Object.keys(modules).sort()
+  const files = await Promise.all(paths.map(async (path) => ({ path, raw: await modules[path]() })))
+  for (const { path, raw } of files) {
+    const { valid, errors, rejected } = validateQuestions(raw)
     let added = 0
     for (const q of valid) {
       const id = makeId(q)
@@ -158,8 +167,17 @@
     }
     BUNDLED_FILES.push({ name: path.split('/').pop() ?? path, count: added, rejected })
     if (errors.length) console.warn(`[FirstPass] ${path}: ${rejected} rejected`, errors)
+    // Let the browser paint and handle input between large JSON files.
+    await new Promise<void>((resolve) => setTimeout(resolve, 0))
   }
-  return out
+  BASE_QUESTIONS.push(...out)
+  return BASE_QUESTIONS
 }
 
-export const BASE_QUESTIONS: RawQuestion[] = loadBundled()
+// One promise also prevents React StrictMode from loading twice in development.
+export function loadBundledQuestions(): Promise<RawQuestion[]> {
+  return (loadPromise ??= readBundled().catch((error: unknown) => {
+    loadPromise = undefined
+    throw error
+  }))
+}
--- a/src/lib/store.tsx
+++ b/src/lib/store.tsx
@@ -8,7 +8,7 @@
   type ReactNode,
 } from 'react'
 import type { Confidence, PersistedState, Progress, Question, RawQuestion } from '../types/qbank'
-import { BASE_QUESTIONS, makeId, toQuestions, validateQuestions } from './data'
+import { loadBundledQuestions, makeId, toQuestions, validateQuestions } from './data'
 import { dateKey } from './stats'
 import { conceptKey } from './sessionBuilder'
 
@@ -54,6 +54,7 @@
 }
 
 interface Store {
+  bankStatus: 'loading' | 'ready' | 'error'
   questions: Question[]
   byId: Map<string, Question>
   state: PersistedState
@@ -75,12 +76,28 @@
   const [state, setState] = useState<PersistedState>(loadState)
   const [imported, setImported] = useState<RawQuestion[]>(loadImported)
   const [daily, setDaily] = useState<Record<string, number>>(loadDaily)
+  const [baseQuestions, setBaseQuestions] = useState<RawQuestion[]>([])
+  const [bankStatus, setBankStatus] = useState<Store['bankStatus']>('loading')
+
+  useEffect(() => {
+    let current = true
+    loadBundledQuestions().then((loaded) => {
+      if (current) {
+        setBaseQuestions(loaded)
+        setBankStatus('ready')
+      }
+    }).catch((error: unknown) => {
+      console.error('[FirstPass] Question bank failed to load:', error)
+      if (current) setBankStatus('error')
+    })
+    return () => { current = false }
+  }, [])
 
   const questions = useMemo(() => {
     const map = new Map<string, Question>()
-    for (const q of toQuestions([...BASE_QUESTIONS, ...imported])) if (!map.has(q.id)) map.set(q.id, q)
+    for (const q of toQuestions([...baseQuestions, ...imported])) if (!map.has(q.id)) map.set(q.id, q)
     return [...map.values()]
-  }, [imported])
+  }, [baseQuestions, imported])
 
   const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])
 
@@ -182,6 +199,7 @@
   }, [])
 
   const value: Store = {
+    bankStatus,
     questions,
     byId,
     state,
--- a/src/App.tsx
+++ b/src/App.tsx
@@ -19,7 +19,7 @@
 import type { OptionKey, Session, SessionMode, SessionSource } from './types/qbank'
 
 export default function App() {
-  const { questions, state } = useStore()
+  const { questions, state, bankStatus } = useStore()
   const { active, setActive, schedule } = useLearning()
   const [path, setPath] = useState(window.location.pathname)
   const [tab, setTab] = useState<Tab>('study')
@@ -90,6 +90,22 @@
 
   if (path.startsWith('/admin')) return <Admin />
 
+  // Never mount a restored player against an empty, still-loading question map.
+  if (bankStatus !== 'ready') return (
+    <div className="flex min-h-dvh items-center justify-center bg-canvas px-6 text-center text-ink">
+      <div className="w-full max-w-sm rounded-[30px] border border-line bg-surface p-9 shadow-xl">
+        <span className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-accent/10 text-2xl font-bold text-accent">+</span>
+        <h1 className="text-2xl font-bold tracking-tight">FirstPass Q-Bank</h1>
+        <p className="mt-3 text-sm leading-relaxed text-muted">
+          {bankStatus === 'error' ? 'Your question bank could not be loaded. Please try again.' : 'Preparing your study desk and question bank…'}
+        </p>
+        {bankStatus === 'error' ? (
+          <button className="mt-6 rounded-full bg-accent px-6 py-3 text-sm font-semibold text-white" onClick={() => window.location.reload()}>Try again</button>
+        ) : <div className="mx-auto mt-6 h-1.5 w-40 overflow-hidden rounded-full bg-accent/10"><div className="h-full w-2/5 animate-pulse rounded-full bg-accent" /></div>}
+      </div>
+    </div>
+  )
+
   if (session) {
     return <Player key={sKey} session={session} onExit={() => setSession(null)} onReview={review} onRestart={restart} />
   }
FIRSTPASS_SPEED_PATCH

# Verify the patch before changing any source files.
if grep -Fq 'loadBundledQuestions()' src/lib/store.tsx; then
  echo "Question-bank speed update is already present; keeping it."
else
  patch --dry-run --batch -p1 < "$patch_file" >/dev/null || {
    echo "Source files differ from the expected FirstPass version; no changes made." >&2
    exit 1
  }
fi

backup_dir=$(mktemp -d './firstpass-speed-backup-XXXXXX')
mkdir -p "$backup_dir/src/lib" "$backup_dir/src/components"
cp src/lib/data.ts src/lib/store.tsx "$backup_dir/src/lib/"
cp src/App.tsx "$backup_dir/src/"
cp src/components/DoctorWalk.tsx "$backup_dir/src/components/"
echo "Source backup saved: $backup_dir"

if ! grep -Fq 'loadBundledQuestions()' src/lib/store.tsx; then
  patch --batch -p1 < "$patch_file"
fi

# Use the original 2D artwork. No Three.js, GLB downloads, walking timers, or sprites.
cat <<'FIRSTPASS_2D_DOCTOR' > src/components/DoctorWalk.tsx
import maleDoctor from '../assets/doctor-male-a.png'
import femaleDoctor from '../assets/doctor-female-a.png'

export type DoctorAvatar = 'male' | 'female'
export const AVATAR_KEY = 'ui_doctor_avatar'

export function readAvatar(): DoctorAvatar | null {
  try {
    const saved = localStorage.getItem(AVATAR_KEY)
    return saved === 'male' || saved === 'female' ? saved : null
  } catch {
    return null
  }
}

export function DoctorWalk({ avatar, className = '', small = false }: {
  avatar: DoctorAvatar
  className?: string
  small?: boolean
}) {
  return (
    <div className={`doctor-walker pointer-events-none select-none ${className}`} role="img" aria-label={`${avatar === 'male' ? 'Male' : 'Female'} doctor illustration`}>
      <img src={avatar === 'male' ? maleDoctor : femaleDoctor} alt="" draggable={false}
        className={`absolute inset-0 h-full w-full object-contain object-bottom ${avatar === 'female' && !small ? 'doctor-female-pose-a' : ''}`} />
    </div>
  )
}
FIRSTPASS_2D_DOCTOR

echo "2D doctors restored; large 3D files will not be downloaded."
echo "Question JSON files and browser progress keys remain untouched."
echo "Verifying TypeScript and Vite..."
npm run build
