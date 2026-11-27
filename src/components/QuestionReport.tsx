import { useState } from 'react'
import { supabase } from '../lib/supabase'
import type { Question } from '../types/qbank'

export default function QuestionReport({ q }: { q: Question }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState('answer')
  const [detail, setDetail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  async function send() {
    if (!supabase || !detail.trim() || busy) return
    setBusy(true); setMessage('')
    try {
      const { error } = await supabase.rpc('firstpass_report_question', { p_question_key: encodeURIComponent(q.id), p_category: category, p_detail: detail.trim().replaceAll('\u0000', '') })
      if (error) throw error
      setDetail(''); setOpen(false); setMessage('Report sent. Thank you for helping improve QB360.')
    } catch { setMessage('Could not send the report. Please try again.') }
    finally { setBusy(false) }
  }
  return <div className="border-t border-line px-5 py-3 text-xs sm:px-7">
    <button type="button" onClick={() => { setOpen(v => !v); setMessage('') }} className="font-semibold text-muted hover:text-accent" aria-expanded={open}>Report a question error</button>
    {open && <div className="mt-3 space-y-3"><label className="block">Issue type<select className="mt-1 block w-full rounded-xl border border-line bg-surface p-2" value={category} onChange={e=>setCategory(e.target.value)}><option value="answer">Incorrect answer</option><option value="explanation">Explanation</option><option value="wording">Question wording</option><option value="reference">First Aid reference</option><option value="other">Other</option></select></label><label className="block">Describe the issue<textarea className="mt-1 block w-full rounded-xl border border-line bg-surface p-3" rows={3} maxLength={1000} value={detail} onChange={e=>setDetail(e.target.value)} placeholder="Please explain the suspected error. Do not include personal information." /></label><button type="button" disabled={busy || !detail.trim()} onClick={()=>void send()} className="rounded-xl bg-accent px-4 py-2 font-bold text-white disabled:opacity-50">{busy?'Sending…':'Submit report'}</button></div>}
    {message && <p role="status" className="mt-2 text-muted">{message}</p>}
  </div>
}
