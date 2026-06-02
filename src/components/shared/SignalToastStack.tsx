import { useToastStore } from '@/stores/useToastStore'
import { SignalToast } from './SignalToast'

export function SignalToastStack() {
  const toasts = useToastStore((s) => s.toasts)

  if (toasts.length === 0) return null

  return (
    <div className="fixed bottom-6 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="pointer-events-auto">
          <SignalToast toast={toast} />
        </div>
      ))}
    </div>
  )
}
