import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import maleA from '../assets/doctor-male-a.png'
import maleB from '../assets/doctor-male-b.png'
import maleC from '../assets/doctor-male-c.png'
import maleD from '../assets/doctor-male-d.png'
import femaleA from '../assets/doctor-female-a.png'
import femaleB from '../assets/doctor-female-b.png'
import femaleC from '../assets/doctor-female-c.png'
import femaleD from '../assets/doctor-female-d.png'

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
  const poses = avatar === 'male'
    ? [maleA, maleB, maleC, maleD]
    : [femaleA, femaleB, femaleC, femaleD]
  const [imagesReady, setImagesReady] = useState(false)
  useEffect(() => {
    setImagesReady(false)
    if (reduceMotion) return
    let active = true
    // Decode every frame before starting the loop, avoiding a hitch when a
    // new pose is first displayed on slower browsers and mobile connections.
    const sources = avatar === 'male'
      ? [maleA, maleB, maleC, maleD]
      : [femaleA, femaleB, femaleC, femaleD]
    Promise.all(sources.map((src) => {
      const image = new Image()
      image.src = src
      return image.decode().catch(() => undefined)
    })).then(() => { if (active) setImagesReady(true) })
    return () => { active = false }
  }, [avatar, reduceMotion])
  const running = !reduceMotion && imagesReady
  const poseClass = avatar === 'female' && !small ? 'doctor-female-pose-a' : ''
  // Four gait poses are synchronized to the continuous wrapper movement.
  // Only one opaque frame may appear at once; crossfades create extra legs.
  const gaitSeconds = 0.92
  const move = {
    x: small ? [0, 3, 0, -3, 0] : [0, 7, 0, -7, 0],
    y: [0, -3, 0, -3, 0],
    rotate: [0, 0.35, 0, -0.35, 0],
  }

  return (
    <motion.div
      // IMPORTANT: do not add `relative` here. Both the picker and the hero
      // place this element with `absolute`; conflicting positioning utilities
      // left the doctor in normal flow, cropping heads and floating above base.
      className={`doctor-walker isolate pointer-events-none select-none ${small ? 'doctor-walker-small' : ''} ${className}`}
      aria-label={`Illustration of a ${avatar} doctor walking in a white coat`}
      role="img"
      animate={running ? move : undefined}
      transition={{ duration: gaitSeconds, ease: 'easeInOut', repeat: Infinity, times: [0, .25, .5, .75, 1] }}
    >
      {(running ? poses : poses.slice(0, 1)).map((src, i) => (
        <img
          key={src}
          src={src}
          draggable={false}
          alt=""
          decoding="async"
          fetchPriority={i === 0 && !small ? 'high' : 'auto'}
          className={`pointer-events-none absolute inset-0 h-full w-full object-contain object-bottom ${poseClass} ${running ? `doctor-frame-${i}` : ''}`}
        />
      ))}
    </motion.div>
  )
}

