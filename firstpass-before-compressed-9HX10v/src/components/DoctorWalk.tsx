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
