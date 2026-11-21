import { ArrowLeft, ArrowUpRight, Database, FileJson2, UploadCloud } from 'lucide-react'
import { useRef, useState } from 'react'
import { BUNDLED_FILES, validateQuestions } from '../lib/data'
import { navigate } from '../lib/nav'
import { useStore } from '../lib/store'
import { btnGhost, btnPrimary, card, label, page, tag } from '../lib/ui'

export default function Admin() {
  const { questions, importQuestions, importedCount, clearImported } = useStore()
  const input = useRef<HTMLInputElement>(null)
  const [log, setLog] = useState<string[]>([])

  async function onFiles(files: FileList | null) {
    if (!files) return
    const lines: string[] = []
    for (const f of Array.from(files)) {
      try {
        const { valid, errors, rejected } = validateQuestions(JSON.parse(await f.text()))
        const { added, duplicates } = importQuestions(valid)
        lines.push(`${f.name}: ${added} added, ${duplicates} duplicates, ${rejected} rejected`)
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
      <div className="mx-auto max-w-3xl space-y-7 px-4 pb-16 pt-[max(2rem,env(safe-area-inset-top))] sm:px-6 sm:pt-10">
        <button onClick={() => navigate('/')} className="flex items-center gap-2 text-[12px] font-semibold text-muted transition-colors hover:text-accent">
          <ArrowLeft size={15} /> Back to your study desk
        </button>
        <header>
          <p className={`${label} flex items-center gap-2`}><Database size={13} className="text-accent" /> Library / Administration</p>
          <h1 className="mt-2 text-[30px] font-bold tracking-[-.055em] sm:text-[36px]">Manage your library<span className="text-accent">.</span></h1>
          <p className="mt-1 text-[13px] text-muted">Your questions stay yours. Import, inspect and organize without losing progress.</p>
        </header>

        <section className={`${card} overflow-hidden`}>
          <div className="flex items-center justify-between border-b border-line px-5 py-4"><p className={label}>Bundled files · src/data/*.json</p><FileJson2 size={16} className="text-accent" /></div>
          <ul className="divide-y divide-line px-5 pb-2 pt-1">
            {BUNDLED_FILES.map((f) => (
              <li key={f.name} className="flex items-center justify-between gap-3 py-3 text-sm">
                <span className="truncate font-mono text-xs">{f.name}</span>
                <span className="flex items-center gap-2">
                  <span className={tag}>{f.count} Qs</span>
                  {f.rejected > 0 && <span className={tag}>{f.rejected} rejected</span>}
                </span>
              </li>
            ))}
            {BUNDLED_FILES.length === 0 && <li className="py-3 text-sm text-muted">No JSON files found in src/data.</li>}
          </ul>
          <p className="border-t border-line bg-sunken/40 px-5 py-3 text-[11px] text-muted">
            Any .json file dropped into src/data is bundled automatically at build time and merged without duplicates.
          </p>
        </section>

        <section className={`${card} space-y-4 p-6`}>
          <span className="grid h-11 w-11 place-items-center rounded-xl bg-accent/10 text-accent"><UploadCloud size={21} /></span>
          <div><p className={label}>Bring your own questions</p><h2 className="mt-1.5 text-[17px] font-bold tracking-tight">Import in browser</h2></div>
          <p className="text-[13px] leading-relaxed text-muted">
            Upload one or more <code className="font-mono text-xs">.json</code> files (4 or 5 options per question). Files are validated,
            de-duplicated and stored in this browser.
          </p>
          <input ref={input} type="file" accept=".json,application/json" multiple hidden onChange={(e) => onFiles(e.target.files)} />
          <button onClick={() => input.current?.click()} className={btnPrimary}>
            Choose JSON files <ArrowUpRight size={15} />
          </button>
          {log.length > 0 && (
            <pre className="whitespace-pre-wrap rounded-xl border border-line bg-sunken p-4 font-mono text-xs">{log.join('\n')}</pre>
          )}
        </section>

        <section className={`${card} overflow-hidden`}>
          <p className={`${label} border-b border-line px-5 py-4`}>Loaded bank · {questions.length.toLocaleString()} questions</p>
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
