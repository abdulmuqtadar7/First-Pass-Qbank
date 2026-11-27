import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Confidence, PersistedState, Progress, Question, RawQuestion } from '../types/qbank'
import { loadBundledQuestions, makeId, toQuestions, validateQuestions } from './data'
import { dateKey } from './stats'
import { conceptKey } from './sessionBuilder'
import { fieldKey, type AccountSnapshot } from './accountStorage'
import { EMPTY_BANK, mergeShared, readGlobalBank, type GlobalBank } from './globalBank'

export const DAILY_GOAL = 20

const blank = (): Progress => ({ attempts: 0, correct: 0, wrong: 0 })

function loadState(userId: string): PersistedState {
  const fallback: PersistedState = {
    progress: {},
    flagged: [],
    studyDates: [],
    theme: matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light',
  }
  try {
    const s = JSON.parse(localStorage.getItem(fieldKey(userId, 'state')) || 'null')
    const persisted = s ? { ...fallback, ...s } : fallback
    const uiTheme = localStorage.getItem(fieldKey(userId, 'theme'))
    return { ...persisted, theme: uiTheme === 'dark' || uiTheme === 'light' ? uiTheme : persisted.theme }
  } catch {
    return fallback
  }
}

function loadImported(userId: string): RawQuestion[] {
  try {
    return validateQuestions(JSON.parse(localStorage.getItem(fieldKey(userId, 'imported')) || '[]')).valid
  } catch {
    return []
  }
}

function loadDaily(userId: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(fieldKey(userId, 'daily')) || '{}')
  } catch {
    return {}
  }
}

interface Store {
  bankStatus: 'loading' | 'ready' | 'error'
  questions: Question[]
  sharedQuestions: Question[]
  globalBank: GlobalBank
  byId: Map<string, Question>
  state: PersistedState
  imported: RawQuestion[]
  daily: Record<string, number>
  importedCount: number
  todayCount: number
  dailyGoal: number
  importQuestions: (raw: RawQuestion[]) => { added: number; duplicates: number }
  clearImported: () => void
  recordAnswer: (id: string, correct: boolean) => void
  setConfidence: (id: string, level: Confidence) => void
  toggleFlag: (id: string) => void
  resetProgress: () => void
  toggleTheme: () => void
  applyCloudMerge: (snapshot: AccountSnapshot) => void
}

const Ctx = createContext<Store | null>(null)

export function StoreProvider({ children, userId }: { children: ReactNode; userId: string }) {
  const [state, setState] = useState<PersistedState>(() => loadState(userId))
  const [imported, setImported] = useState<RawQuestion[]>(() => loadImported(userId))
  const [daily, setDaily] = useState<Record<string, number>>(() => loadDaily(userId))
  const [baseQuestions, setBaseQuestions] = useState<RawQuestion[]>([])
  const [globalBank, setGlobalBank] = useState<GlobalBank>(EMPTY_BANK)
  const [bankStatus, setBankStatus] = useState<Store['bankStatus']>('loading')

  useEffect(() => {
    let current = true
    Promise.all([loadBundledQuestions(), readGlobalBank()]).then(([loaded, shared]) => {
      if (current) {
        setBaseQuestions(loaded)
        setGlobalBank(shared)
        setBankStatus('ready')
      }
    }).catch((error: unknown) => {
      console.error('[FirstPass] Question bank failed to load:', error)
      if (current) setBankStatus('error')
    })
    return () => { current = false }
  }, [])

  const sharedQuestions = useMemo(() => mergeShared(baseQuestions, globalBank.entries), [baseQuestions, globalBank])
  const questions = useMemo(() => {
    const map = new Map(sharedQuestions.map(q => [q.id, q]))
    for (const q of toQuestions(imported)) if (!map.has(q.id)) map.set(q.id, q)
    return [...map.values()]
  }, [sharedQuestions, imported])

  const byId = useMemo(() => new Map(questions.map((q) => [q.id, q])), [questions])

  useLayoutEffect(() => {
    localStorage.setItem(fieldKey(userId, 'state'), JSON.stringify(state))
    localStorage.setItem(fieldKey(userId, 'theme'), state.theme)
    document.documentElement.classList.toggle('dark', state.theme === 'dark')
  }, [state, userId])

  useEffect(() => {
    localStorage.setItem(fieldKey(userId, 'imported'), JSON.stringify(imported))
  }, [imported, userId])

  useLayoutEffect(() => {
    localStorage.setItem(fieldKey(userId, 'daily'), JSON.stringify(daily))
  }, [daily, userId])

  const importQuestions = useCallback(
    (raw: RawQuestion[]) => {
      const existing = new Set(questions.map((q) => q.id))
      const fresh: RawQuestion[] = []
      let duplicates = 0
      for (const r of raw) {
        const id = makeId(r)
        if (existing.has(id)) duplicates++
        else {
          existing.add(id)
          fresh.push(r)
        }
      }
      if (fresh.length) setImported((prev) => [...prev, ...fresh])
      return { added: fresh.length, duplicates }
    },
    [questions],
  )

  const clearImported = useCallback(() => setImported([]), [])

  const recordAnswer = useCallback((id: string, correct: boolean) => {
    const today = dateKey()
    setDaily((d) => ({ ...d, [today]: (d[today] ?? 0) + 1 }))
    setState((s) => {
      const p = s.progress[id] ?? blank()
      return {
        ...s,
        studyDates: s.studyDates.includes(today) ? s.studyDates : [...s.studyDates, today],
        progress: {
          ...s.progress,
          [id]: {
            ...p,
            attempts: p.attempts + 1,
            correct: p.correct + (correct ? 1 : 0),
            wrong: p.wrong + (correct ? 0 : 1),
            lastCorrect: correct,
            lastAt: Date.now(),
          },
        },
      }
    })
  }, [])

  const setConfidence = useCallback(
    (id: string, level: Confidence) => {
      setState((s) => {
        const progress = { ...s.progress }
        const cur = progress[id] ?? blank()
        progress[id] = { ...cur, status: level === 'hard' ? 'hard' : 'mastered' }
        if (level === 'easy') {
          const q = byId.get(id)
          if (q) {
            for (const o of questions) {
              if (conceptKey(o) === conceptKey(q) && o.id !== id) {
                const p = progress[o.id]
                if (!p || p.attempts === 0) progress[o.id] = { ...(p ?? blank()), status: 'skipped' }
              }
            }
          }
        }
        return { ...s, progress }
      })
    },
    [byId, questions],
  )

  const toggleFlag = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      flagged: s.flagged.includes(id) ? s.flagged.filter((x) => x !== id) : [...s.flagged, id],
    }))
  }, [])

  const resetProgress = useCallback(() => {
    setState((s) => ({ ...s, progress: {}, flagged: [], studyDates: [] }))
    setDaily({})
  }, [])

  const toggleTheme = useCallback(() => {
    setState((s) => ({ ...s, theme: s.theme === 'dark' ? 'light' : 'dark' }))
  }, [])

  const applyCloudMerge = useCallback((snapshot: AccountSnapshot) => {
    setState(snapshot.state); setImported(snapshot.imported); setDaily(snapshot.daily)
  }, [])

  const value: Store = {
    bankStatus,
    questions,
    sharedQuestions,
    globalBank,
    byId,
    state,
    imported,
    daily,
    importedCount: imported.length,
    todayCount: daily[dateKey()] ?? 0,
    dailyGoal: DAILY_GOAL,
    importQuestions,
    clearImported,
    recordAnswer,
    setConfidence,
    toggleFlag,
    resetProgress,
    toggleTheme,
    applyCloudMerge,
  }
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useStore(): Store {
  const c = useContext(Ctx)
  if (!c) throw new Error('useStore must be used inside StoreProvider')
  return c
}
