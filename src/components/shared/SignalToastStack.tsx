import { useToastStore } from '@/stores/useToastStore'
import { SignalToast } from './SignalToast'
import { AppToastPopup } from './AppToastPopup'

export function SignalToastStack() {
  const toasts = useToastStore((s) => s.toasts)
  const appToasts = useToastStore((s) => s.appToasts)

  if (toasts.length === 0 && appToasts.length === 0) return null

  return (
    <div className="fixed bottom-16 md:bottom-4 right-4 z-50 flex flex-col gap-2.5 pointer-events-none">
      {appToasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <AppToastPopup toast={toast} />
        </div>
      ))}

      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <SignalToast toast={toast} />
        </div>
      ))}
    </div>
  )
}
