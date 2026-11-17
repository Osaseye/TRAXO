import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { PiArrowLeft, PiHouse } from 'react-icons/pi'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6 relative overflow-hidden bg-[#09090B] text-[#FAFAFA] font-sans">
      <div className="max-w-lg text-center relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="inline-flex items-center gap-2.5 justify-center mb-8 bg-[#111113] border border-white/[0.07] px-4 py-2 rounded-full"
        >
          <img
            src="/brand/traxo-mark.png"
            onError={(e) => {
              e.currentTarget.src = '/TRAXO.png'
            }}
            alt="TRAXO"
            className="w-5 h-5 rounded object-contain"
          />
          <span className="text-[13px] font-semibold tracking-[-0.01em] text-[#FAFAFA]">Traxo</span>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
        >
          <p className="text-[13px] font-mono tabular-nums text-[#71717A] mb-3">404</p>
          <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] text-[#FAFAFA] mb-3">
            Page not found
          </h1>
          <p className="text-[14px] text-[#A1A1AA] mb-8 max-w-md mx-auto leading-relaxed">
            The route you requested does not exist or has been moved. Return to the workspace or go back.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              to="/"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#FAFAFA] hover:bg-[#E4E4E7] text-[#09090B] text-[13.5px] font-medium transition-colors"
            >
              <PiHouse size={16} />
              <span>Back to home</span>
            </Link>
            <button
              type="button"
              onClick={() => window.history.back()}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[#18181B] hover:bg-[#27272A] text-[#FAFAFA] text-[13.5px] font-medium transition-colors border border-white/[0.07]"
            >
              <PiArrowLeft size={16} />
              <span>Go back</span>
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
