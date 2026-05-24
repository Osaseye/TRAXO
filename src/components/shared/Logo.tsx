import { cn } from '@/lib/utils'

interface LogoProps {
  variant?: 'full' | 'icon'
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

const sizeMap = {
  full: { sm: 'h-6', md: 'h-8', lg: 'h-12' },
  icon: { sm: 'h-7 w-7', md: 'h-9 w-9', lg: 'h-12 w-12' },
}

export function Logo({ variant = 'full', size = 'md', className }: LogoProps) {
  const sizeClass = sizeMap[variant][size]

  if (variant === 'icon') {
    return (
      <img
        src="/TRAXO-icon.png"
        alt="Traxo"
        className={cn('object-contain', sizeClass, className)}
      />
    )
  }

  return (
    <img
      src="/TRAXO.png"
      alt="Traxo — Trade Smart. Execute Precisely."
      className={cn('object-contain', sizeClass, className)}
    />
  )
}
