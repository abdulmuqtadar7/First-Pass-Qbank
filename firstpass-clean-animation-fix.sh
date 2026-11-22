#!/usr/bin/env bash
set -euo pipefail

# FirstPass Q-Bank — prevent walking frame ghosting; give doctor clear space above cards.
# This only changes the two files listed below, not question JSON or localStorage.
if [ ! -f package.json ] || [ ! -f src/components/DoctorWalk.tsx ]; then
  echo "Run this from your FirstPass Q-Bank GitHub Codespaces project root." >&2
  exit 1
fi
if ! grep -Fq -- 'journey-big-doctor' src/index.css; then
  echo "Study Journey CSS is not installed; no changes made." >&2
  exit 1
fi
backup_archive="$(mktemp ./firstpass-before-clean-walk-XXXXXXXX.tar.gz)"
tar -czf "$backup_archive" src/components/DoctorWalk.tsx src/index.css
echo "Backup saved: $backup_archive"
mkdir -p src/components

cat << 'FIRSTPASS_EOF' > src/components/DoctorWalk.tsx
import { motion, useReducedMotion } from 'motion/react'
import maleA from '../assets/doctor-male-a.png'
import maleB from '../assets/doctor-male-b.png'
import femaleA from '../assets/doctor-female-a.png'
import femaleB from '../assets/doctor-female-b.png'

export type DoctorAvatar = 'male' | 'female'

export const AVATAR_KEY = 'ui_doctor_avatar'

export function readAvatar(): DoctorAvatar | null {
  try {
    const saved = localStorage.getItem(AVATAR_KEY)
    return saved === 'male' || saved === 'female' ? saved : null
  } catch { return null }
}

export function DoctorWalk({ avatar, className = '', small = false }: {
  avatar: DoctorAvatar
  className?: string
  small?: boolean
}) {
  const reduceMotion = useReducedMotion()
  const a = avatar === 'male' ? maleA : femaleA
  const b = avatar === 'male' ? maleB : femaleB
  const poseClass = avatar === 'female' && !small ? 'doctor-female-pose-a' : ''
  // Pose A and pose B have different leg positions. They must swap as whole
  // frames: fading B over a permanently visible A creates ghost/extra legs.
  const move = {
    x: small ? [0, 7, 0] : ['-7%', '7%', '-7%'],
    y: [0, -3, 0, -3, 0],
    rotate: [0, 0.7, 0, -0.7, 0],
  }

  return (
    <motion.div
      // IMPORTANT: do not add `relative` here. Both the picker and the hero
      // place this element with `absolute`; conflicting positioning utilities
      // left the doctor in normal flow, cropping heads and floating above base.
      className={`doctor-walker isolate pointer-events-none select-none ${small ? 'doctor-walker-small' : ''} ${className}`}
      aria-label={`Illustration of a ${avatar} doctor walking in a white coat`}
      role="img"
      animate={reduceMotion ? undefined : move}
      transition={{ duration: small ? 3.4 : 5.4, ease: 'easeInOut', repeat: Infinity }}
    >
      <img src={a} draggable={false} alt="" decoding="async" fetchPriority={small ? 'auto' : 'high'} className={`pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom ${poseClass} ${reduceMotion ? '' : 'doctor-frame-a'}`} />
      {!reduceMotion && (
        <img
          src={b}
          draggable={false}
          alt=""
          decoding="async"
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom ${poseClass} doctor-frame-b`}
        />
      )}
    </motion.div>
  )
}

FIRSTPASS_EOF

cat << 'FIRSTPASS_EOF' > src/index.css
@import "tailwindcss";

@custom-variant dark (&:where(.dark, .dark *));

:root {
  --canvas: #faf9f6;
  --surface: #ffffff;
  --sunken: #f7f1f8;
  --line: #eae2ed;
  --ink: #272252;
  --muted: #817993;
  --accent: #7f41d8;
  --good: #07856b;
  --bad: #d14e56;
  --shadow-card: 0 1px 2px rgba(36, 41, 59, .035), 0 14px 40px -26px rgba(36, 41, 59, .18);
  --shadow-float: 0 24px 70px -28px rgba(32, 40, 67, .25);
}

.dark {
  --canvas: #0b0d11;
  --surface: #13161c;
  --sunken: #241d2e;
  --line: #393147;
  --ink: #f2ecff;
  --muted: #b4a9c6;
  --accent: #b68cff;
  --good: #5bd4ae;
  --bad: #ff9296;
  --shadow-card: inset 0 1px rgba(255, 255, 255, .045), 0 14px 44px -30px rgba(0, 0, 0, .75);
  --shadow-float: 0 26px 90px -26px rgba(0, 0, 0, .88);
}

@theme inline {
  --color-canvas: var(--canvas);
  --color-surface: var(--surface);
  --color-sunken: var(--sunken);
  --color-line: var(--line);
  --color-ink: var(--ink);
  --color-muted: var(--muted);
  --color-accent: var(--accent);
  --color-good: var(--good);
  --color-bad: var(--bad);
  --font-sans: "Inter", "Geist", ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --font-mono: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace;
  --font-reading: "Charter", "Iowan Old Style", "Source Serif Pro", Georgia, serif;
  --font-display: "Bodoni MT", "Didot", "Times New Roman", Georgia, serif;
}

html {
  color-scheme: light;
  -webkit-tap-highlight-color: transparent;
}
html.dark {
  color-scheme: dark;
}
body {
  margin: 0;
  background: var(--canvas);
  color: var(--ink);
  font-family: var(--font-sans);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
  font-feature-settings: "ss01" on, "cv11" on;
  min-height: 100vh;
  background-image: radial-gradient(ellipse 65% 28% at 50% -8%, color-mix(in srgb, var(--accent) 6%, transparent), transparent 90%);
  overscroll-behavior-y: contain;
}
button {
  cursor: pointer;
}
button:disabled {
  cursor: not-allowed;
}
button, input { -webkit-tap-highlight-color: transparent; }
::selection { background: color-mix(in srgb, var(--accent) 20%, transparent); }
:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--accent) 75%, white);
  outline-offset: 3px;
}

.surface-card { box-shadow: var(--shadow-card); }
.surface-float { box-shadow: var(--shadow-float); }
.surface-highlight { box-shadow: inset 0 1px rgba(255,255,255,.055), var(--shadow-card); }
.fine-grid {
  background-image: radial-gradient(color-mix(in srgb, var(--muted) 16%, transparent) .65px, transparent .65px);
  background-size: 17px 17px;
}
.study-shell { isolation: isolate; }
.journey-app { background: radial-gradient(ellipse 70% 34% at 50% -6%, #f3e8fb66, transparent 85%); }
.dark .journey-app { background: radial-gradient(ellipse 70% 40% at 50% 0%, #3c235333, transparent 82%); }
.journey-scene {
  height: clamp(575px, 50vw, 690px);
  background: radial-gradient(ellipse at 47% 25%, #fffdfd 0%, #fff6f3 45%, #fce9e4 100%);
  box-shadow: inset 0 1px 0 #ffffffcc, 0 16px 46px -42px #7d4b8a88;
}
.dark .journey-scene { background: radial-gradient(ellipse at 48% 20%, #382b44 0%, #2d253a 50%, #201d2c 100%); }
.journey-mountain { position: absolute; bottom: 7%; width: 37%; aspect-ratio: 1.1; clip-path: polygon(47% 0%, 100% 100%, 0% 100%); background: linear-gradient(128deg, #f7d9d8bd, #efc6d8b0); opacity: .62; }
.mountain-one { left: 15%; bottom: 5%; transform: scale(.83); }
.mountain-two { left: 50%; bottom: 9%; transform: scale(1.14); }
.mountain-three { right: -9%; bottom: 0%; transform: scale(.8); }
.dark .journey-mountain { background: linear-gradient(128deg,#61445e88,#64436966); opacity: .55; }
.journey-ground { position:absolute; bottom:-31%;left:-16%;width:132%;height:40%;border-radius:50%;background:linear-gradient(180deg,#f8dddd99,#fff1e544);box-shadow:0 -3px 40px -20px #dba3c344; }
.dark .journey-ground { background:linear-gradient(180deg,#60406144,#34273d22); }
.journey-streak { position:absolute;left:6%;top:12%;width:28%;font-size:13px; }
.journey-streak-number { margin-top:23px;color:#2c285f;font-size:clamp(130px,12.5vw,212px);line-height:.72;letter-spacing:-.09em; }
.dark .journey-streak-number { color:#eee2ff; }
.journey-streak h1 { margin-top:30px;font-size:clamp(17px,1.7vw,23px); }
.journey-big-doctor { left:29%;bottom:5.5%;width:44%;height:78%; }
.doctor-walker { position: absolute; transform-origin: 50% 88%; will-change: transform; }
.doctor-female-pose-a { transform: scale(1.025);transform-origin:center bottom; }
.doctor-frame-a { animation: doctor-walk-a 1.35s steps(1, end) infinite; }
.doctor-frame-b { animation: doctor-walk-b 1.35s steps(1, end) infinite; }
/* A clean pose exchange, never two transparent figures layered at once. */
@keyframes doctor-walk-a { 0%, 49.999% { opacity: 1; } 50%, 100% { opacity: 0; } }
@keyframes doctor-walk-b { 0%, 49.999% { opacity: 0; } 50%, 100% { opacity: 1; } }
.journey-doctor-shadow { position:absolute;z-index:3;left:36%;bottom:4%;width:32%;height:18px;border-radius:50%;background:#78568a33;filter:blur(9px);animation:journey-shadow-track 5.2s ease-in-out infinite; }
@keyframes journey-shadow-track { 0%,100% { transform:translateX(-20%);opacity:.7; } 50% { transform:translateX(20%);opacity:1; } }
.journey-float-stats { position:absolute;right:4%;top:13%;width:270px;display:grid;gap:15px; }
.journey-stat-card { min-height:96px;padding:18px 20px;border:1px solid #ffffffd8;border-radius:27px;background:#ffffffb0;box-shadow:0 12px 30px -23px #65517666;backdrop-filter:blur(12px); }
.dark .journey-stat-card { background:#362c43db;border-color:#6d577066;box-shadow:0 12px 30px -23px #0008; }
.journey-actions { margin:-19px 4.2% 0; }
.journey-action-card { background:#ffffffec;border:1px solid #ffffff;box-shadow:0 13px 30px -19px #7f608766, inset 0 1px #fff;backdrop-filter:blur(12px); }
.dark .journey-action-card { background:#30283c;border-color:#4e405c; }
.journey-start-button { background:linear-gradient(145deg,#a550f4,#6220bd);box-shadow:inset 0 2px #ffffff5c,0 15px 28px -18px #5721bbaa; }
.journey-system-card { background:linear-gradient(155deg,#fffdfd,#fff7fc);box-shadow:0 8px 26px -24px #6e447870,inset 0 1px #fff; }
.dark .journey-system-card { background:linear-gradient(145deg,#25202f,#1c1b29); }
.journey-system-glow { position:absolute;right:-35px;top:-45px;width:150px;height:150px;border-radius:50%;filter:blur(30px);opacity:.5;pointer-events:none; }
.journey-glow-0 { background:#d7c7fb; }.journey-glow-1 { background:#f4d9d4; }.journey-glow-2 { background:#d3dfeb; }.journey-glow-3 { background:#d8efd9; }

@media (max-width: 1023px) and (min-width: 768px) {
  .journey-streak { width:31%;top:13%; }
  .journey-streak-number { font-size:148px; }
  .journey-big-doctor { left:28%;width:46%;height:73%;bottom:6%; }
  .journey-float-stats { right:2%;width:220px;top:11%; }
  .journey-stat-card { padding:13px 12px; }
}
@media (max-width: 767px) {
  .journey-scene { height:550px; }
  .journey-streak { left:5.5%;top:9%;width:58%;font-size:10px; }
  .journey-streak-number { font-size:clamp(125px,37vw,170px);margin-top:22px; }
  .journey-streak h1 { margin-top:17px;font-size:15px; }
  .journey-streak p.font-reading { max-width:142px;margin-top:15px;font-size:14px;line-height:1.4; }
  .journey-streak > span { margin-top:16px; }
  .journey-big-doctor { left:7%;bottom:5%;width:90%;height:67%; }
  .journey-doctor-shadow { left:26%;bottom:3.5%;width:51%;height:12px; }
  .journey-float-stats { top:10%;right:3%;width:160px; }
  .journey-stat-card { min-height:75px;padding:11px 9px;border-radius:20px;gap:7px; }
  .journey-stat-card > span { width:31px;height:31px;border-radius:12px; }
  .journey-stat-card p:first-child { font-size:16px; }
  .journey-stat-card p:nth-child(2) { font-size:10px; }
  .journey-stat-card.goal-card,.journey-stat-card.milestone-card { display:none; }
  .journey-actions { margin:14px 0 0; }
  .journey-actions .journey-action-card { min-height:78px; }
  .journey-start-button { min-height:70px;font-size:17px; }
  .mountain-one { left:-21%;bottom:7%; }.mountain-two { left:41%;bottom:9%; }.mountain-three { right:-15%; }
}
.journey-panel { background: linear-gradient(120deg, #fff9ec, #fff9f6 40%, #f4f1ff); }
.dark .journey-panel { background: linear-gradient(125deg, #211e2b, #1c2229 48%, #202438); }
.journey-dots { background-image: radial-gradient(#bba4d9 0.8px, transparent 0.8px); background-size: 23px 23px; mask-image: linear-gradient(to right, transparent 10%, black); }
.journey-walker { filter: drop-shadow(0 7px 4px #33394522); animation: journey-bob .42s ease-in-out infinite alternate; }
.journey-leg-a { transform-origin: 0 -15px; animation: journey-step .72s ease-in-out infinite alternate; }
.journey-leg-b { transform-origin: 0 -15px; animation: journey-step .72s ease-in-out infinite alternate-reverse; }
.journey-arm { transform-origin: 14px -47px; animation: journey-step .72s ease-in-out infinite alternate-reverse; }
@keyframes journey-bob { from { translate: 0 1px; } to { translate: 0 -3px; } }
@keyframes journey-step { from { rotate: -12deg; } to { rotate: 12deg; } }
.kbd {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 19px; height: 19px; padding: 0 4px;
  border: 1px solid var(--line); border-radius: 5px;
  background: var(--sunken); color: var(--muted);
  font-family: var(--font-mono); font-size: 10px; font-weight: 550;
}

@keyframes fade {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes rise {
  from { opacity: 0; transform: translateY(6px); }
  to { opacity: 1; transform: none; }
}
.animate-fade { animation: fade 160ms ease-out both; }
.animate-rise { animation: rise 200ms ease-out both; }

.no-scrollbar { scrollbar-width: none; }
.no-scrollbar::-webkit-scrollbar { display: none; }

@media (prefers-reduced-motion: reduce) {
  .doctor-frame-a, .doctor-frame-b { animation: none; }
  .doctor-frame-b { opacity: 0; }
  .animate-fade, .animate-rise { animation: none; }
  .journey-walker, .journey-leg-a, .journey-leg-b, .journey-arm { animation: none; }
  .journey-doctor-shadow { animation: none; }
  *, *::before, *::after { scroll-behavior: auto !important; }
}
FIRSTPASS_EOF

echo "Fixed: clean two-pose walking animation and shoe clearance above the tiles."
echo "Question JSON and progress keys are untouched."
npm run build
