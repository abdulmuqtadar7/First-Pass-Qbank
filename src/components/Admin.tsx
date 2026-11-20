import { ArrowLeft } from 'lucide-react'
import { useRef, useState } from 'react'
import { validateQuestions } from '../lib/data'
import { navigate } from '../lib/nav'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label, page } from '../lib/ui'

export default function Admin() {
  const { questions, importQuestions, importedCount, clearImported } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [log, setLog] = useState<string[]>([])

  async function onFiles(files: FileList | null) {
    if (!files) return
    const lines: string[] = []
    for (const f of Array.from(files)) {
      try {
        const { valid, errors } = validateQuestions(JSON.parse(await f.text()))
        const { added, duplicates } = importQuestions(valid)
        lines.push(`${f.name}: ${added} added, ${duplicates} duplicates, ${errors.length ? `${errors.length}+ rejected` : '0 rejected'}`)
        errors.forEach((e) => lines.push(`   • ${e}`))
      } catch (e) {
        lines.push(`${f.name}: invalid JSON (${(e as Error).message})`)
      }
    }
    setLog(lines)
    if (input.current) input.current.value = ''
  }

  const counts = new Map<string, number>()
  questions.forEach((q) => counts.set(q.system, (counts.get(q.system) ?? 0) + 1))

  return (
    <div className={page}>
      <div className="mx-auto max-w-2xl space-y-6 px-4 pb-16 pt-[max(1.5rem,env(safe-area-inset-top))]">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-sm text-muted transition-colors hover:text-ink">
          <ArrowLeft size={15} /> Back to app
        </button>
        <header>
          <p className={label}>Admin</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Import questions</h1>
        </header>

        <section className={`${card} space-y-3 p-5`}>
          <p className="text-sm text-muted">
            Upload one or more <code className="font-mono text-xs">.json</code> files containing an array of questions. Files are validated,
            de-duplicated and stored in this browser.
          </p>
          <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button onClick={() => input.current?.click()} className={btnPrimary}>
            Choose JSON files
          </button>
          {log.length > 0 && (
            <pre className="whitespace-pre-wrap rounded-md border border-line bg-sunken p-3 font-mono text-xs">{log.join('\n')}</pre>
          )}
        </section>

        <section className={`${card} overflow-hidden`}>
          <p className={`${label} px-5 pt-4`}>Loaded bank · {questions.length}</p>
          <ul className="divide-y divide-line px-5 pb-2 pt-1">
            {[...counts].map(([k, v]) => (
              <li key={k} className="flex justify-between py-2.5 text-sm">
                <span>{k}</span>
                <span className="font-mono text-xs tabular-nums text-muted">{v}</span>
              </li>
            ))}
          </ul>
          <p className="border-t border-line px-5 py-3 font-mono text-xs tabular-nums text-muted">{importedCount} imported via /admin</p>
        </section>

        <button
          disabled={!importedCount}
          onClick={() => window.confirm('Remove all imported questions?') && clearImported()}
          className={`${btnGhost} text-bad`}
        >
          Clear imported questions
        </button>
      </div>
    </div>
  )
}
