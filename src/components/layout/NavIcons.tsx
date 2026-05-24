import type { SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement>

function BaseIcon({ children, ...props }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {children}
    </svg>
  )
}

export function NavDashboardIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 12.5 12 5l7.5 7.5" />
      <path d="M6.5 10.8V19h11v-8.2" />
      <path d="M10.2 19v-4.3h3.6V19" />
    </BaseIcon>
  )
}

export function NavStrategyIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M4.5 6.5h8.2l1.9 2.2h5.4" />
      <path d="M4.5 17.5h8.2l1.9-2.2h5.4" />
      <circle cx="6.9" cy="6.5" r="1.2" />
      <circle cx="6.9" cy="17.5" r="1.2" />
      <path d="M14.8 12h4.8" />
    </BaseIcon>
  )
}

export function NavJournalIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <path d="M6 4.8h10.8A2.2 2.2 0 0 1 19 7v11.4H8.4A2.4 2.4 0 0 0 6 20.8V4.8Z" />
      <path d="M6 20.8V7a2.2 2.2 0 0 1 2.2-2.2" />
      <path d="M10 9.2h5.8" />
      <path d="M10 12.6h5.8" />
    </BaseIcon>
  )
}

export function NavProfileIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="8.4" r="3" />
      <path d="M5.2 18.9c1.3-2.5 3.7-3.8 6.8-3.8s5.5 1.3 6.8 3.8" />
      <path d="M12 3.8v1.3" />
    </BaseIcon>
  )
}

export function NavSettingsIcon(props: IconProps) {
  return (
    <BaseIcon {...props}>
      <circle cx="12" cy="12" r="2.6" />
      <path d="m12 4.7.7 1.5 1.7.3.9-1.4 1.6.9-.3 1.6 1.3 1.1 1.5-.6.6 1.7-1.4.9.1 1.8 1.5.7-.6 1.7-1.5-.5-1.2 1.2.4 1.6-1.6.9-.9-1.3-1.8.3-.7 1.5-1.8-.1-.5-1.6-1.8-.4-1 1.3-1.6-.9.5-1.6-1.2-1.2-1.6.5-.6-1.7 1.4-.7-.1-1.8-1.4-.9.6-1.7 1.6.6L8 7.3l-.4-1.6 1.6-.9 1 1.3 1.7-.3z" />
    </BaseIcon>
  )
}
