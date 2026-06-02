import { Link } from 'react-router'
import { motion } from 'framer-motion'
import { Logo } from '@/components/shared/Logo'
import { ArrowLeft, Home } from 'lucide-react'

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden bg-[#0A0D14]">
      {/* Background glowing orbs */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-blue-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-indigo-500/10 rounded-full blur-[80px] pointer-events-none" />

      <div className="max-w-2xl text-center relative z-10 w-full">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="inline-flex items-center gap-3 justify-center mb-8 bg-white/5 border border-white/10 px-6 py-3 rounded-full backdrop-blur-md shadow-xl"
        >
          <Logo variant="icon" size="sm" className="h-6 w-6 text-blue-500" />
          <span className="text-sm font-bold tracking-[0.2em] uppercase text-white/90">TRAXO</span>
        </motion.div>

        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.7, type: "spring", bounce: 0.4 }}
          className="relative"
        >
          <h1 className="text-[10rem] md:text-[16rem] font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-white/5 leading-none select-none tracking-tighter">
            404
          </h1>
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0D14] via-transparent to-transparent pointer-events-none" />
        </motion.div>
        
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="-mt-8 md:-mt-12"
        >
          <h2 className="text-2xl md:text-4xl font-bold text-white mb-4">Page not found</h2>
          <p className="text-base md:text-lg text-white/50 mb-10 max-w-md mx-auto">
            The page you are looking for doesn't exist or has been moved. Let's get you back on track.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link 
              to="/" 
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-all duration-300 hover:shadow-[0_0_20px_rgba(59,130,246,0.4)] hover:-translate-y-0.5"
            >
              <Home className="w-5 h-5" />
              <span>Back to home</span>
            </Link>
            <button
               onClick={() => window.history.back()}
               className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-full bg-white/5 hover:bg-white/10 text-white font-semibold transition-all duration-300 border border-white/10"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Go back</span>
            </button>
          </div>
        </motion.div>
      </div>
    </main>
  )
}
