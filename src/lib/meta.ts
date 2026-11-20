import {
  Activity,
  Apple,
  Baby,
  Brain,
  Bug,
  Droplet,
  Droplets,
  FlaskConical,
  Heart,
  Microscope,
  Pill,
  ShieldCheck,
  Stethoscope,
  Wind,
  type LucideIcon,
} from 'lucide-react'

const ICONS: Record<string, LucideIcon> = {
  cardiovascular: Heart,
  neurology: Brain,
  renal: Droplets,
  pharmacology: Pill,
  microbiology: Bug,
  pathology: Microscope,
  biochemistry: FlaskConical,
  immunology: ShieldCheck,
  respiratory: Wind,
  gi: Apple,
  endocrine: Activity,
  reproductive: Baby,
  'hematology/oncology': Droplet,
}

export function getIcon(name: string): LucideIcon {
  return ICONS[name.toLowerCase()] ?? Stethoscope
}
