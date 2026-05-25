import { useState } from 'react'
import { ChevronLeft, ChevronRight, Image as ImageIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'

interface DiagramItem {
  id: string
  label: string
  src: string
  caption: string
}

interface DiagramCarouselProps {
  items: DiagramItem[]
}

export function DiagramCarousel({ items }: DiagramCarouselProps) {
  const [activeIndex, setActiveIndex] = useState<number>(0)

  if (!items || items.length === 0) return null

  const currentItem = items[activeIndex]

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1))
  }

  const handleNext = () => {
    setActiveIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1))
  }

  return (
    <Card className="border border-white/[0.08] bg-[#0d1117]/80 overflow-hidden shadow-xl">
      {/* Pills Navigation */}
      <div className="flex items-center gap-1.5 p-3 overflow-x-auto border-b border-white/[0.05] scrollbar-thin scrollbar-thumb-white/[0.1]">
        {items.map((item, idx) => (
          <button
            key={item.id}
            onClick={() => setActiveIndex(idx)}
            className={`px-3 py-1.5 rounded-full text-[11px] font-semibold tracking-wide whitespace-nowrap transition-all ${
              activeIndex === idx
                ? 'bg-primary/20 text-primary border border-primary/30'
                : 'text-text-muted hover:text-white border border-transparent bg-black/10'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* Main Image View */}
      <div className="relative group bg-black/40 min-h-[220px] sm:min-h-[380px] flex items-center justify-center">
        {/* The Image */}
        <img
          src={currentItem.src}
          alt={currentItem.label}
          className="w-full h-auto max-h-[460px] object-contain transition-all duration-300"
        />

        {/* Left Arrow */}
        <button
          onClick={handlePrev}
          className="absolute left-3 w-8 h-8 rounded-full border border-white/[0.1] bg-black/40 text-[#cbd5e1] hover:text-white flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Previous diagram"
        >
          <ChevronLeft size={16} />
        </button>

        {/* Right Arrow */}
        <button
          onClick={handleNext}
          className="absolute right-3 w-8 h-8 rounded-full border border-white/[0.1] bg-black/40 text-[#cbd5e1] hover:text-white flex items-center justify-center backdrop-blur-sm opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
          aria-label="Next diagram"
        >
          <ChevronRight size={16} />
        </button>

        {/* Floating Indicator */}
        <div className="absolute bottom-3 right-3 px-2 py-1 rounded bg-black/50 text-[10px] font-mono font-bold text-text-muted backdrop-blur-sm border border-white/[0.05]">
          {activeIndex + 1} / {items.length}
        </div>
      </div>

      {/* Caption footer */}
      <div className="p-3 bg-black/10 border-t border-white/[0.04] flex items-start gap-2">
        <ImageIcon size={14} className="text-primary shrink-0 mt-0.5" />
        <p className="text-xs text-text-muted leading-relaxed">
          <span className="font-semibold text-white mr-1.5">{currentItem.label}:</span>
          {currentItem.caption}
        </p>
      </div>
    </Card>
  )
}
