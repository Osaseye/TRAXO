import { useState } from 'react';
import {
  PiCaretLeft,
  PiCaretRight,
  PiStack,
} from 'react-icons/pi';

export interface DiagramItem {
  id: string;
  label: string;
  src: string;
  caption: string;
}

export interface DiagramCarouselProps {
  items: DiagramItem[];
}

export function DiagramCarousel({ items }: DiagramCarouselProps) {
  const [activeIndex, setActiveIndex] = useState<number>(0);

  if (!items || items.length === 0) return null;

  const safeIndex = activeIndex < items.length ? activeIndex : 0;
  const currentItem = items[safeIndex];

  const handlePrev = () => {
    setActiveIndex((prev) => (prev === 0 ? items.length - 1 : prev - 1));
  };

  const handleNext = () => {
    setActiveIndex((prev) => (prev === items.length - 1 ? 0 : prev + 1));
  };

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-[#111113] overflow-hidden">
      {/* Diagram Selector Strip */}
      <div className="flex items-center gap-1.5 px-5 py-3.5 overflow-x-auto border-b border-white/[0.06]">
        {items.map((item, idx) => {
          const isActive = safeIndex === idx;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveIndex(idx)}
              className={`px-3 py-1.5 rounded-full text-[12.5px] font-medium whitespace-nowrap transition-colors ${
                isActive
                  ? 'bg-[#FAFAFA] text-[#09090B] font-semibold'
                  : 'bg-[#18181B] text-[#A1A1AA] hover:text-[#FAFAFA] hover:bg-white/[0.08]'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Main Viewport */}
      <div className="relative group bg-[#09090B] min-h-[280px] sm:min-h-[420px] flex items-center justify-center p-4 sm:p-6">
        <img
          src={currentItem.src}
          alt={currentItem.label}
          className="w-full h-auto max-h-[480px] object-contain rounded-xl"
        />

        {items.length > 1 && (
          <>
            <button
              type="button"
              onClick={handlePrev}
              className="absolute left-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/[0.1] bg-[#111113]/90 text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-white/[0.22] flex items-center justify-center transition-colors"
              aria-label="Previous diagram"
            >
              <PiCaretLeft size={18} />
            </button>

            <button
              type="button"
              onClick={handleNext}
              className="absolute right-4 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full border border-white/[0.1] bg-[#111113]/90 text-[#A1A1AA] hover:text-[#FAFAFA] hover:border-white/[0.22] flex items-center justify-center transition-colors"
              aria-label="Next diagram"
            >
              <PiCaretRight size={18} />
            </button>
          </>
        )}

        <div className="absolute bottom-4 right-4 px-2.5 py-1 rounded-full bg-[#111113]/90 border border-white/[0.08] text-[12px] font-mono tabular-nums text-[#A1A1AA]">
          {String(safeIndex + 1).padStart(2, '0')} / {String(items.length).padStart(2, '0')}
        </div>
      </div>

      {/* Caption Footer */}
      <div className="px-5 py-4 bg-[#111113] border-t border-white/[0.06] flex items-start gap-2.5">
        <PiStack size={16} className="text-[#71717A] shrink-0 mt-0.5" />
        <p className="text-[13.5px] text-[#A1A1AA] leading-relaxed max-w-[75ch]">
          <span className="font-medium text-[#FAFAFA] mr-1.5">{currentItem.label}:</span>
          {currentItem.caption}
        </p>
      </div>
    </div>
  );
}
