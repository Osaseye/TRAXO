import ScrollReveal from '@/components/ui/ScrollReveal'

const METRICS = [
  { value: '7,200+',  label: 'Signals generated' },
  { value: '71%',     label: 'Average win rate'   },
  { value: '5',       label: 'Proven strategies'  },
  { value: '<100ms',  label: 'Signal delivery'    },
]

export function StatsBar() {
  return (
    <ScrollReveal>
    <div className="border-y border-white/[0.05] bg-[#09090d]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-10 grid grid-cols-2 sm:grid-cols-4 gap-6 sm:gap-8">
        {METRICS.map((m) => (
          <div key={m.label} className="flex flex-col">
            <span className="text-3xl font-extrabold text-white tabular-nums tracking-tight leading-none mb-1">
              {m.value}
            </span>
            <span className="text-[12px] text-[#4b5563] font-medium">{m.label}</span>
          </div>
        ))}
      </div>
    </div>
    </ScrollReveal>
  )
}
