import { motion, AnimatePresence } from 'motion/react'
import { ArrowRight, Sparkles, X } from 'lucide-react'
import { DoctorWalk, type DoctorAvatar } from './DoctorWalk'

export default function AvatarPicker({ open, selected, onChoose, onClose }: {
  open: boolean
  selected: DoctorAvatar | null
  onChoose: (avatar: DoctorAvatar) => void
  onClose: () => void
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#15112c]/65 px-4 py-6 backdrop-blur-md" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <motion.div role="dialog" aria-modal="true" aria-label="Choose your doctor avatar" initial={{ opacity: 0, y: 22, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: .97 }} transition={{ type: 'spring', stiffness: 420, damping: 32, mass: .8 }} className="relative max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-[32px] border border-white/80 bg-[#fffaf7] p-5 text-[#252153] shadow-[0_32px_110px_-24px_#130c3e88] sm:p-8">
            {selected && <button onClick={onClose} aria-label="Close avatar selection" className="absolute right-5 top-5 z-10 rounded-full bg-white p-2 text-[#767196] shadow-sm"><X size={17} /></button>}
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f1e8ff] px-3 py-1.5 text-[10px] font-bold uppercase tracking-[.14em] text-[#7545d2]"><Sparkles size={13}/> Your journey, your doctor</span>
            <h2 className="mt-4 font-display text-[35px] leading-none tracking-[-.045em] sm:text-[43px]">Choose your companion.</h2>
            <p className="mt-3 max-w-md text-[13px] leading-relaxed text-[#736c8c]">A little encouragement as you master medicine. Pick the doctor you’d like to see on your study journey.</p>
            <div className="mt-6 grid grid-cols-2 gap-3">
              {(['male', 'female'] as const).map((gender) => (
                <button key={gender} onClick={() => onChoose(gender)} className={`group overflow-hidden rounded-[24px] border-2 text-left transition-all hover:-translate-y-1 hover:shadow-xl ${selected === gender ? 'border-[#8447e8] bg-[#f5edff]' : 'border-[#e9e0ef] bg-white hover:border-[#c4a3fa]'}`}>
                  <div className="relative h-[210px] overflow-hidden bg-[linear-gradient(145deg,#fcf6f5,#f3e8ff)] sm:h-[238px]">
                    <span aria-hidden="true" className="absolute bottom-2 left-1/2 h-3 w-28 -translate-x-1/2 rounded-[50%] bg-[#9780b2]/20 blur-[6px]" />
                    <DoctorWalk avatar={gender} small className="absolute inset-x-2 bottom-3 h-[84%]" />
                  </div>
                  <div className="flex items-center justify-between p-3.5 sm:p-4"><span className="text-[13px] font-bold sm:text-[15px]">{gender === 'male' ? 'Male doctor' : 'Female doctor'}</span><ArrowRight size={15} className="text-[#8750df] transition-transform group-hover:translate-x-1" /></div>
                </button>
              ))}
            </div>
            <p className="mt-5 text-center text-[11px] text-[#827b96]">You can change this anytime. Your question progress is independent of your avatar.</p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
