import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import malePoster from '../assets/doctor-male-a.png'
import femalePoster from '../assets/doctor-female-a.png'
import maleGLB from '../assets/doctor-male-fluid.glb?url'
import femaleGLB from '../assets/doctor-female-fluid.glb?url'

export type DoctorAvatar = 'male' | 'female'

// Preserve this preference and all existing Q-Bank progress keys.
export const AVATAR_KEY = 'ui_doctor_avatar'

export function readAvatar(): DoctorAvatar | null {
  try {
    const value = localStorage.getItem(AVATAR_KEY)
    return value === 'male' || value === 'female' ? value : null
  } catch { return null }
}

/** A real skinned 3D walk, continuously interpolated on requestAnimationFrame. */
export function DoctorWalk({ avatar, className = '', small = false }: {
  avatar: DoctorAvatar
  className?: string
  small?: boolean
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const reducedMotion = useReducedMotion()
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setReady(false)
    setFailed(false)
    if (reducedMotion) return
    const canvas = canvasRef.current
    if (!canvas) return

    let cancelled = false
    let cleanup: (() => void) | undefined

    async function mount() {
      const THREE = await import('three')
      const { GLTFLoader } = await import('three/examples/jsm/loaders/GLTFLoader.js')
      if (cancelled || !canvas) return

      const scene = new THREE.Scene()
      const renderer = new THREE.WebGLRenderer({
        canvas, alpha: true, antialias: true,
        powerPreference: small ? 'low-power' : 'high-performance',
      })
      renderer.setClearColor(0x000000, 0)
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, small ? 1.3 : 1.6))
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.25

      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, .01, 40)
      camera.position.set(3.8, 2.65, 5)
      camera.lookAt(0, .85, 0)
      scene.add(new THREE.HemisphereLight(0xffffff, 0xd5c5e9, 2.0))
      const key = new THREE.DirectionalLight(0xffffff, 2.3)
      key.position.set(-3, 6, 5)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0xc2eff2, 1.1)
      rim.position.set(3, 4, -4)
      scene.add(rim)

      const gltf = await new GLTFLoader().loadAsync(avatar === 'male' ? maleGLB : femaleGLB)
      if (cancelled) { renderer.dispose(); return }
      const model = gltf.scene
      scene.add(model)
      model.traverse((child) => {
        if (child instanceof THREE.Mesh) child.frustumCulled = false
      })

      const clip = gltf.animations.find((animation) => /walk/i.test(animation.name))
      const mixer = clip ? new THREE.AnimationMixer(model) : null
      if (clip && mixer) mixer.clipAction(clip).setLoop(THREE.LoopRepeat, Infinity).play()

      let visible = document.visibilityState === 'visible'
      let onScreen = true
      let last = performance.now()
      let raf = 0
      const resize = () => {
        if (!canvas) return
        const width = Math.max(1, canvas.clientWidth)
        const height = Math.max(1, canvas.clientHeight)
        renderer.setSize(width, height, false)
        const halfHeight = (small ? 2.22 : 2.1) / 2
        const halfWidth = halfHeight * width / height
        camera.left = -halfWidth
        camera.right = halfWidth
        camera.top = halfHeight
        camera.bottom = -halfHeight
        camera.updateProjectionMatrix()
      }
      const tick = (now: number) => {
        raf = requestAnimationFrame(tick)
        // The small avatar cards share the GPU with the dashboard doctor.
        // A 30 FPS preview preserves interpolated motion without rendering
        // multiple 3D canvases at full refresh rate on mobile devices.
        if (small && now - last < 32) return
        const delta = Math.min((now - last) / 1000, .04)
        last = now
        if (!visible || !onScreen) return
        mixer?.update(delta)
        renderer.render(scene, camera)
      }
      const onVisibility = () => {
        visible = document.visibilityState === 'visible'
        last = performance.now()
      }
      document.addEventListener('visibilitychange', onVisibility)
      const intersection = new IntersectionObserver(([entry]) => {
        onScreen = entry?.isIntersecting ?? true
        last = performance.now()
      }, { threshold: .01 })
      intersection.observe(canvas)
      const observer = new ResizeObserver(resize)
      observer.observe(canvas)
      resize()
      renderer.render(scene, camera)
      setReady(true)
      raf = requestAnimationFrame(tick)

      cleanup = () => {
        cancelAnimationFrame(raf)
        observer.disconnect()
        intersection.disconnect()
        document.removeEventListener('visibilitychange', onVisibility)
        mixer?.stopAllAction()
        model.traverse((child) => {
          if (!(child instanceof THREE.Mesh)) return
          child.geometry.dispose()
          for (const material of Array.isArray(child.material) ? child.material : [child.material]) {
            if ('map' in material && material.map instanceof THREE.Texture) material.map.dispose()
            material.dispose()
          }
        })
        renderer.dispose()
      }
    }

    mount().catch((error: unknown) => {
      if (!cancelled) {
        console.warn('Using the original doctor illustration; 3D unavailable.', error)
        setFailed(true)
      }
    })
    return () => { cancelled = true; cleanup?.() }
  }, [avatar, reducedMotion, small])

  return (
    <div
      className={`doctor-walker isolate pointer-events-none select-none ${small ? 'doctor-walker-small' : ''} ${className}`}
      role="img"
      aria-label={`${avatar === 'male' ? 'Male' : 'Female'} doctor walking in a white coat`}
    >
      <img
        src={avatar === 'male' ? malePoster : femalePoster}
        draggable={false}
        alt=""
        decoding="async"
        className={`absolute inset-0 h-full w-full object-contain object-bottom transition-opacity duration-300 ${ready && !reducedMotion && !failed ? 'opacity-0' : 'opacity-100'}`}
      />
      {!reducedMotion && !failed && (
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={`absolute inset-0 h-full w-full transition-opacity duration-300 ${ready ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}
