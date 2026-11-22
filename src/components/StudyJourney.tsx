import { ArrowUpRight, Flag, Sparkles } from 'lucide-react'
import { motion } from 'motion/react'
import { useId } from 'react'
import { card, label } from '../lib/ui'

interface Props {
  mastered: number
  total: number
  today: number
  dailyGoal: number
  compact?: boolean
}

export default function StudyJourney({ mastered, total, today, dailyGoal, compact = false }: Props) {
  const id = useId().replace(/:/g, '')
  const pct = total ? Math.round((mastered / total) * 100) : 0
  const step = Math.min(100, Math.max(0, pct))
  const x = 56 + 7.06 * step
  const y = 225 - 1.49 * step

  return (
    <section className={`${card} journey-panel relative isolate overflow-hidden rounded-[26px] ${compact ? 'p-5 sm:p-7' : 'p-6 sm:p-8'}`}>
      <div className="pointer-events-none absolute inset-0 journey-dots opacity-50" />
      <div className={`relative grid items-center gap-4 ${compact ? 'lg:grid-cols-[.8fr_1.2fr]' : 'lg:grid-cols-[.7fr_1.3fr]'}`}>
        <div className="z-10">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#d2c3fc]/70 bg-[#f0eafa] px-3 py-1.5 text-[10px] font-extrabold uppercase tracking-[.13em] text-[#61579c] dark:border-[#6b598e]/45 dark:bg-[#292436] dark:text-[#c8b5ff]"><Sparkles size={12} /> The study journey</span>
          <p className={`${label} mt-5`}>First Aid concepts secured</p>
          <div className="mt-1 flex items-end gap-2">
            <span className="text-[68px] font-extrabold leading-none tracking-[-.09em] tabular-nums sm:text-[80px]">{mastered}</span>
            <span className="pb-2 font-mono text-[14px] text-muted">/ {total}</span>
          </div>
          <p className="mt-3 max-w-[25ch] text-[13px] leading-[1.7] text-muted">Little steps make big progress. Your next milestone is waiting.</p>
          <div className="mt-5 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
            <span className="rounded-full border border-line bg-surface/75 px-3 py-1.5 text-ink">{pct}% of the map explored</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface/75 px-3 py-1.5 text-muted"><Flag size={12} /> {today}/{dailyGoal} today</span>
          </div>
        </div>

        <div className="relative min-w-0" role="img" aria-label={`Illustrated study journey showing ${pct}% of concepts mastered`}>
          <svg viewBox="0 0 820 275" className="w-full overflow-visible" aria-hidden="true">
            <defs>
              <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#dde9f4" stopOpacity=".7" /><stop offset="1" stopColor="#fff5e7" stopOpacity=".28" /></linearGradient>
              <linearGradient id={`${id}-hill`} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bad9c3" /><stop offset="1" stopColor="#8fc7bc" /></linearGradient>
              <linearGradient id={`${id}-road`} x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#d8b3af" /><stop offset="1" stopColor="#9c8bd4" /></linearGradient>
            </defs>
            <rect x="0" y="3" width="820" height="260" rx="38" fill={`url(#${id}-sky)`} opacity=".7" />
            <circle cx="715" cy="55" r="36" fill="#ffdaa1" opacity=".7" />
            <circle cx="715" cy="55" r="52" fill="#ffdaa1" opacity=".14" />
            <path d="M0 177 Q130 90 247 176 Q352 105 462 163 Q635 40 820 159 V275 H0Z" fill="#c9c5eb" opacity=".55" />
            <path d="M0 220 Q124 146 235 206 Q354 142 490 196 Q624 136 820 178 V275 H0Z" fill={`url(#${id}-hill)`} opacity=".85" />
            <path d="M0 252 Q176 206 337 247 Q500 199 662 221 Q743 231 820 206 V275 H0Z" fill="#8ec2b0" opacity=".45" />

            <path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke="#fff" strokeWidth="15" strokeLinecap="round" opacity=".72" />
            <path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke="#b6add5" strokeWidth="5" strokeLinecap="round" strokeDasharray="3 15" opacity=".9" />
            <motion.path d="M50 225 C180 228 200 172 300 174 S460 164 535 126 S680 100 765 72" fill="none" stroke={`url(#${id}-road)`} strokeWidth="8" strokeLinecap="round" pathLength={100} strokeDasharray="100" animate={{ strokeDashoffset: 100 - step }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} />

            {([25, 50, 75] as const).map((marker, i) => (
              <g key={marker} transform={`translate(${[224, 402, 587][i]},${[194, 160, 107][i]})`}>
                <circle r="12" fill={step >= marker ? '#887ac2' : '#fff'} stroke={step >= marker ? '#fff' : '#aca3d3'} strokeWidth="3" />
                <text y="4" textAnchor="middle" fontSize="9" fontWeight="bold" fill={step >= marker ? '#fff' : '#746993'}>{marker}</text>
              </g>
            ))}

            <g transform="translate(770,65)">
              <path d="M0 0 V-38" stroke="#695a75" strokeWidth="4" strokeLinecap="round" />
              <path d="M2 -38 L49 -31 L2 -17Z" fill="#fa887b" />
              <path d="M6 -33 H29" stroke="#fff" strokeWidth="2" opacity=".6" />
              <ellipse cy="5" rx="15" ry="5" fill="#697a8c" opacity=".17" />
            </g>

            <g transform="translate(125,187)"><path d="M0 12 Q-8 -19 0 -39" fill="none" stroke="#648c79" strokeWidth="4" /><path d="M0 -27 Q-24 -31 -18 -48 Q-4 -50 0 -27M0 -12 Q21 -28 18 -42 Q3 -35 0 -12" fill="#80b798"/><circle cy="-49" r="5" fill="#f7b6a7" /></g>
            <g transform="translate(680,167)"><path d="M0 14 V-32" stroke="#5d836e" strokeWidth="4" /><path d="M0 -26 Q-23 -44 -25 -22 Q-7 -10 0 -26 M0 -15 Q21 -30 24 -13 Q7 0 0 -15" fill="#78a989" /><circle cy="-39" r="7" fill="#e5a4bb" /></g>

            <motion.g animate={{ x: 0, y: 0 }}>
              <g transform={`translate(${x},${y - 10})`} className="journey-walker">
                <ellipse cx="0" cy="17" rx="22" ry="6" fill="#334c58" opacity=".18" />
                <g className="journey-leg-a"><path d="M-6 -16 L-11 10 L-21 14" fill="none" stroke="#333951" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="M-22 13 h-11" stroke="#f5f1e7" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-leg-b"><path d="M4 -16 L12 10 L26 14" fill="none" stroke="#333951" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><path d="M25 13 h12" stroke="#f5f1e7" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-body"><rect x="-15" y="-54" width="32" height="43" rx="12" fill="#7d75b1" /><path d="M-12 -45 Q0 -39 14 -43" fill="none" stroke="#c8b9ec" strokeWidth="3" /><rect x="-24" y="-49" width="13" height="28" rx="6" fill="#e4a180" /><path d="M-18 -27 L-19 -12" stroke="#d69575" strokeWidth="7" strokeLinecap="round" /></g>
                <g className="journey-arm"><path d="M15 -47 L26 -33 L20 -18" fill="none" stroke="#e4a180" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" /><rect x="12" y="-31" width="20" height="16" rx="3" fill="#f2cd79" transform="rotate(-11 22 -24)" /><path d="M18 -29 V-19" stroke="#fff" strokeWidth="1.5" /></g>
                <path d="M-15 -47 Q-30 -35 -25 -17" fill="none" stroke="#514c7c" strokeWidth="8" strokeLinecap="round" />
                <circle cy="-72" r="17" fill="#e5aa89" /><path d="M-17 -77 Q-17 -96 0 -95 Q18 -97 18 -77 L10 -84 L-5 -82 L-13 -75Z" fill="#3f4053" /><path d="M-17 -82 Q-12 -102 6 -96 Q18 -91 18 -82" fill="#3f4053" /><circle cx="6" cy="-73" r="1.8" fill="#38374b" /><path d="M5 -66 Q10 -62 14 -68" fill="none" stroke="#ad6c65" strokeWidth="1.6" strokeLinecap="round" />
                <path d="M-8 -54 L2 -49 L11 -54" fill="#fff2e6" />
              </g>
            </motion.g>
          </svg>
          <div className="absolute bottom-1 right-2 inline-flex items-center gap-1 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[10px] font-bold text-[#615e80] shadow-sm backdrop-blur-sm dark:border-[#646276]/40 dark:bg-[#262735]/80 dark:text-[#d9d4f4]">Your next milestone <ArrowUpRight size={12} /></div>
        </div>
      </div>
    </section>
  )
}
