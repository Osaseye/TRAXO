import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Logo } from '@/components/shared/Logo'

export function Loading({ fullScreen = true }: { fullScreen?: boolean; size?: number }) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setMounted(true), 0)
    return () => clearTimeout(t)
  }, [])

  if (!mounted) return null

  const content = (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className={`flex flex-col items-center justify-center relative ${fullScreen ? 'fixed inset-0 z-50 bg-[#0A0D14]' : 'min-h-[40vh] w-full'}`}
    >
      {fullScreen && (
        <>
          {/* Subtle animated background effect */}
          <motion.div 
            animate={{ 
              scale: [1, 1.2, 1],
              opacity: [0.05, 0.15, 0.05]
            }}
            transition={{ 
              duration: 4, 
              repeat: Infinity,
              ease: "easeInOut" 
            }}
            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] bg-blue-500 rounded-full blur-[120px] pointer-events-none"
          />
        </>
      )}

      <div className="relative z-10 flex flex-col items-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="relative"
        >
          {/* Outer rotating ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-4 border-2 border-transparent border-t-blue-500/50 border-r-blue-500/50 rounded-full"
          />
          {/* Inner rotating ring */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
            className="absolute -inset-2 border-2 border-transparent border-b-blue-400/50 border-l-blue-400/50 rounded-full"
          />
          
          <div className="bg-[#0A0D14] p-3 rounded-full relative z-10 shadow-[0_0_30px_rgba(59,130,246,0.3)]">
            <Logo variant="icon" size="sm" className="h-10 w-10 text-blue-500" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="mt-10 flex flex-col items-center gap-3"
        >
          <span className="text-sm font-bold tracking-[0.25em] uppercase text-white/90">
            TRAXO
          </span>
          <div className="flex gap-1.5" aria-hidden="true">
            <motion.span 
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }} 
              transition={{ duration: 1.2, repeat: Infinity, delay: 0 }}
              className="w-1.5 h-1.5 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"
            />
            <motion.span 
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }} 
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.2 }}
              className="w-1.5 h-1.5 bg-blue-500 text-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"
            />
            <motion.span 
              animate={{ opacity: [0.2, 1, 0.2], scale: [0.8, 1, 0.8] }} 
              transition={{ duration: 1.2, repeat: Infinity, delay: 0.4 }}
              className="w-1.5 h-1.5 bg-blue-500 text-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]"
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )

  return (
    <AnimatePresence>
      {content}
    </AnimatePresence>
  )
}

export default Loading
