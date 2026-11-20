import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { PiBroadcast, PiNotebook, PiTerminalWindow } from 'react-icons/pi'
import { cn } from '@/lib/utils'

interface PreviewTab {
  id: 'terminal' | 'signals' | 'journal'
  label: string
  shortLabel: string
  caption: string
  image: string
  alt: string
}

const PREVIEW_TABS: PreviewTab[] = [
  {
    id: 'terminal',
    label: 'Execution Desk',
    shortLabel: 'Desk',
    caption: 'Live multi-timeframe order flow, interactive order builder, and sub-40ms Exness MT5 bridge.',
    image: '/brand/landing-terminal.png',
    alt: 'TRAXO Execution Desk Terminal',
  },
  {
    id: 'signals',
    label: 'Signal Radar',
    shortLabel: 'Radar',
    caption: 'High-density institutional signal feed showing active setups, confidence metrics, and R:R ratios.',
    image: '/brand/signal-radar-feed.png',
    alt: 'TRAXO Institutional Signal Stream',
  },
  {
    id: 'journal',
    label: 'Execution Ledger',
    shortLabel: 'Ledger',
    caption: 'Automated quantitative trade journal with R-multiple equity curves, win rate meters, and session analytics.',
    image: '/brand/execution-ledger-journal.png',
    alt: 'TRAXO Automated Trading Journal',
  },
]

const TAB_ICONS = {
  terminal: PiTerminalWindow,
  signals: PiBroadcast,
  journal: PiNotebook,
}

export function ProductPreview() {
  const [activeTab, setActiveTab] = useState<PreviewTab['id']>('terminal')
  const current = PREVIEW_TABS.find((t) => t.id === activeTab) ?? PREVIEW_TABS[0]

  return (
    <section id="terminal" className="relative py-16 sm:py-24 lg:py-32 px-4 sm:px-6 bg-[#09090B] overflow-hidden select-none font-sans">
      {/* ── Background Coordinate Grid ──────────────────────────────────────── */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div
          className="absolute inset-0 opacity-[0.14]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.2) 1px, transparent 1px)',
            backgroundSize: '36px 36px',
          }}
        />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-tr from-[#34D399]/10 to-transparent blur-3xl rounded-full" />
      </div>

      <div className="relative max-w-7xl mx-auto space-y-8 sm:space-y-12">
        {/* Header directly on canvas */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-5 sm:gap-6 pb-4 border-b border-white/[0.06]">
          <div className="max-w-xl space-y-2">
            <p className="text-[12px] font-semibold tracking-wider text-[#A1A1AA] uppercase">
              Terminal Architecture
            </p>
            <h2 className="text-[28px] sm:text-4xl font-bold tracking-tight text-[#FAFAFA] leading-[1.12]">
              Obsidian surfaces built for long focus.
            </h2>
            <p className="text-[14px] text-[#71717A] font-normal leading-relaxed">
              {current.caption}
            </p>
          </div>

          {/* Tab Selector: full-width 3-up pill segmented control on mobile, inline pill on md+ */}
          <div
            role="tablist"
            aria-label="Workspace preview tabs"
            className="w-full md:w-auto grid grid-cols-3 md:inline-flex items-center p-1 rounded-full bg-white/[0.03] border border-white/[0.08] shrink-0"
          >
            {PREVIEW_TABS.map((tab) => {
              const Icon = TAB_ICONS[tab.id]
              const isSelected = tab.id === activeTab
              return (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    'relative inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-0 px-2.5 sm:px-4 py-2 rounded-full text-[12px] sm:text-[13px] font-medium transition-colors cursor-pointer',
                    isSelected ? 'text-[#09090B]' : 'text-[#A1A1AA] hover:text-[#FAFAFA]'
                  )}
                >
                  {isSelected && (
                    <motion.span
                      layoutId="product-preview-active-tab"
                      transition={{ type: 'spring', stiffness: 450, damping: 35 }}
                      className="absolute inset-0 bg-[#FAFAFA] rounded-full"
                    />
                  )}
                  <Icon size={14} className="relative z-10 shrink-0" />
                  <span className="relative z-10 font-semibold sm:hidden truncate">{tab.shortLabel}</span>
                  <span className="relative z-10 font-semibold hidden sm:inline whitespace-nowrap">{tab.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* Visual Preview sitting directly on canvas (No boxed outer card) */}
        <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] shadow-[0_32px_100px_rgba(0,0,0,0.85)]">
          <div className="relative aspect-[16/10] sm:aspect-[16/9] bg-[#09090B]">
            <AnimatePresence mode="wait">
              <motion.img
                key={current.id}
                src={current.image}
                alt={current.alt}
                initial={{ opacity: 0, scale: 1.01 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.99 }}
                transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                className="w-full h-full object-cover object-top opacity-90"
              />
            </AnimatePresence>
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09090B] via-transparent to-transparent opacity-60" />
          </div>

          {/* Clean status indicator */}
          <div className="absolute bottom-3 left-3 sm:bottom-4 sm:left-4 inline-flex items-center gap-2 sm:gap-2.5 max-w-[calc(100%-24px)] px-3 sm:px-3.5 py-1.5 rounded-full bg-[#09090B]/85 backdrop-blur-md border border-white/[0.1] text-[11px] sm:text-[12px] text-[#A1A1AA] truncate">
            <span className="text-[#FAFAFA] font-medium truncate">{current.label}</span>
            <span>·</span>
            <span className="shrink-0">Exness Direct DMA</span>
          </div>
        </div>
      </div>
    </section>
  )
}
