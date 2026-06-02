import React, { useEffect, useRef } from 'react'

export default function ScrollReveal({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('opacity-100', 'translate-y-0')
            observer.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )

    el.querySelectorAll(':scope > *').forEach((child) => {
      child.classList.add('opacity-0', 'translate-y-4', 'transition-all', 'duration-700')
      observer.observe(child)
    })

    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  )
}
