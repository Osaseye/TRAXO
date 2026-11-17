import { useEffect } from 'react';
import { useToastStore, type AppNotificationToast } from '@/stores/useToastStore';
import {
  PiCheckCircle,
  PiWarning,
  PiInfo,
  PiX,
} from 'react-icons/pi';
import { cn } from '@/lib/utils';

export function AppToastPopup({ toast }: { toast: AppNotificationToast }) {
  const removeAppToast = useToastStore((s) => s.removeAppToast);

  useEffect(() => {
    const timer = setTimeout(() => removeAppToast(toast.id), 5000);
    return () => clearTimeout(timer);
  }, [toast.id, removeAppToast]);

  const isSuccess = toast.type === 'success';
  const isError = toast.type === 'error';

  return (
    <div
      className={cn(
        'obsidian-toast w-80 max-w-[calc(100vw-2rem)] p-3.5 rounded-xl border border-white/[0.08] bg-[#111113] transition-colors duration-100 flex items-start gap-3 relative overflow-hidden',
        isSuccess
          ? 'text-[#34D399]'
          : isError
          ? 'text-[#F87171]'
          : 'text-[#FAFAFA]',
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isSuccess ? (
          <PiCheckCircle size={17} className="text-[#34D399]" />
        ) : isError ? (
          <PiWarning size={17} className="text-[#F87171]" />
        ) : (
          <PiInfo size={17} className="text-[#A1A1AA]" />
        )}
      </div>

      <div className="flex-1 min-w-0 pr-5">
        <h4 className="text-[13px] font-semibold text-[#FAFAFA] tracking-[-0.01em]">{toast.title}</h4>
        <p className="text-[12px] text-[#A1A1AA] mt-0.5 whitespace-pre-line leading-relaxed">{toast.message}</p>
      </div>

      <button
        type="button"
        onClick={() => removeAppToast(toast.id)}
        className="absolute top-2.5 right-2.5 p-1 rounded-lg text-[#71717A] hover:text-[#FAFAFA] hover:bg-white/[0.06] transition-colors"
        aria-label="Dismiss notification"
      >
        <PiX size={14} />
      </button>
    </div>
  );
}
