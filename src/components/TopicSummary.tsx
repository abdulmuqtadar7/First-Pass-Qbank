import type { ReactNode } from 'react'

function inline(text: string): ReactNode[] {
  return text
    .split(/(\*\*[^*]+\*\*)/g)
    .filter(Boolean)
    .map((part, i) =>
      part.startsWith('**') && part.endsWith('**') && part.length > 4 ? (
        <strong key={i} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={i}>{part}</span>
      ),
    )
}

type Block =
  | { kind: 'heading'; text: string }
  | { kind: 'bullet'; text: string; depth: number }
  | { kind: 'para'; text: string }
  | { kind: 'gap' }

function parse(text: string): Block[] {
  const blocks: Block[] = []
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      if (blocks.length && blocks[blocks.length - 1].kind !== 'gap') blocks.push({ kind: 'gap' })
      continue
    }
    const hash = line.match(/^\s*#{1,4}\s+(.*)$/)
    if (hash) {
      blocks.push({ kind: 'heading', text: hash[1].replace(/\*\*/g, '').replace(/:$/, '') })
      continue
    }
    const bullet = line.match(/^(\s*)([-•*▪‣–])\s+(.*)$/)
    if (bullet) {
      blocks.push({ kind: 'bullet', text: bullet[3], depth: Math.min(2, Math.floor(bullet[1].length / 2)) })
      continue
    }
    const bold = line.match(/^\s*\*\*(.+?)\*\*:?\s*$/)
    if (bold) {
      blocks.push({ kind: 'heading', text: bold[1].replace(/:$/, '') })
      continue
    }
    if (/^[A-Za-z][^.!?]{0,46}:$/.test(line.trim())) {
      blocks.push({ kind: 'heading', text: line.trim().slice(0, -1) })
      continue
    }
    blocks.push({ kind: 'para', text: line.trim() })
  }
  return blocks
}

export default function TopicSummary({ text }: { text: string }) {
  const blocks = parse(text)
  return (
    <div className="space-y-1.5 px-5 py-4 text-[14.5px] leading-[1.65]">
      {blocks.map((b, i) => {
        if (b.kind === 'gap') return <div key={i} className="h-2" />
        if (b.kind === 'heading')
          return (
            <p key={i} className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted first:pt-0">
              {b.text}
            </p>
          )
        if (b.kind === 'bullet')
          return (
            <div key={i} className="flex gap-2.5 whitespace-pre-line" style={{ paddingLeft: b.depth * 18 }}>
              <span className="mt-[0.62em] h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span className="min-w-0 flex-1">{inline(b.text)}</span>
            </div>
          )
        return (
          <p key={i} className="max-w-[65ch] whitespace-pre-line">
            {inline(b.text)}
          </p>
        )
      })}
    </div>
  )
}
