import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export function Loading({
  fullScreen = true,
  message = 'Synchronizing terminal state...',
}: {
  fullScreen?: boolean
  size?: number
  message?: string
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(t)
  }, [])

  if (!mounted) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        className={`flex flex-col items-center justify-center relative font-sans ${
          fullScreen ? 'fixed inset-0 z-50 bg-[#09090B]' : 'min-h-[40vh] w-full'
        }`}
      >
        {/* ── Top-Center Sleek Status Pill & Progress Line (Full Screen) ───── */}
        {fullScreen && (
          <>
            {/* 1px Slender Kinetic Progress Line at Viewport Top */}
            <div className="fixed top-0 inset-x-0 h-[2px] bg-white/[0.04] overflow-hidden z-50">
              <motion.div
                initial={{ x: '-100%' }}
                animate={{ x: '100%' }}
                transition={{
                  repeat: Infinity,
                  duration: 1.6,
                  ease: 'easeInOut',
                }}
                className="h-full w-1/3 bg-gradient-to-r from-transparent via-[#34D399] to-transparent"
              />
            </div>

            {/* Top-Center Floating Glassmorphic Pill */}
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.3 }}
              className="fixed top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111113]/90 backdrop-blur-md border border-white/[0.08] shadow-[0_8px_24px_rgba(0,0,0,0.6)]"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-[#34D399]" />
              <span className="text-[11px] font-medium tracking-wider uppercase text-[#FAFAFA]">
                TRAXO TERMINAL
              </span>
              <span className="text-white/20">·</span>
              <span className="text-[11px] text-[#A1A1AA]">INITIALIZING</span>
            </motion.div>

            {/* Subtle Coordinate Grid in Background */}
            <div
              className="absolute inset-0 opacity-[0.10] pointer-events-none"
              style={{
                backgroundImage:
                  'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
                backgroundSize: '32px 32px',
              }}
            />
          </>
        )}

        {/* ── Center Focus: Bespoke Brandmark & Calm Sweep ────────────────── */}
        <div className="relative z-10 flex flex-col items-center">
          <div className="relative flex items-center justify-center">
            {/* Subtle monochrome orbital ring */}
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-4 border border-white/[0.08] rounded-full"
            />
            {/* Subtle emerald sweep arc */}
            <motion.div
              animate={{ rotate: -360 }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
              className="absolute -inset-4 border border-transparent border-t-[#34D399]/30 rounded-full"
            />

            {/* Clean Brandmark without generic boxed container */}
            <div className="relative z-10 w-12 h-12 flex items-center justify-center">
              <img
                src="/brand/traxo-mark.png"
                onError={(e) => {
                  e.currentTarget.src = '/TRAXO.png'
                }}
                alt="TRAXO"
                className="w-8 h-8 object-contain"
              />
            </div>
          </div>

          {/* Typography: Strict Plus Jakarta Sans */}
          <div className="mt-8 flex flex-col items-center gap-2 text-center">
            <span className="text-[12px] font-bold tracking-[0.24em] uppercase text-[#FAFAFA]">
              TRAXO
            </span>
            <p className="text-[12.5px] text-[#71717A] max-w-xs">
              {message}
            </p>

            {/* Micro kinetic tick bar */}
            <div className="flex gap-1.5 mt-2" aria-hidden="true">
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
                className="w-1 h-1 bg-[#34D399] rounded-full"
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
                className="w-1 h-1 bg-white/60 rounded-full"
              />
              <motion.span
                animate={{ opacity: [0.3, 1, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
                className="w-1 h-1 bg-white/30 rounded-full"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

export default Loading
