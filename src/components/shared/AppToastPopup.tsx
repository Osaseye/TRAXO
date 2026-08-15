import { useEffect } from 'react';
import { useToastStore, type AppNotificationToast } from '@/stores/useToastStore';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
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
        "w-80 max-w-[calc(100vw-2rem)] p-3.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 flex items-start gap-3 relative overflow-hidden animate-in slide-in-from-right-5",
        isSuccess
          ? "bg-[#091510]/95 border-emerald-500/30 text-emerald-300"
          : isError
          ? "bg-[#180a0d]/95 border-rose-500/30 text-rose-300"
          : "bg-[#090d14]/95 border-blue-500/30 text-blue-300"
      )}
    >
      <div className="mt-0.5 shrink-0">
        {isSuccess ? (
          <CheckCircle2 size={18} className="text-emerald-400" />
        ) : isError ? (
          <AlertTriangle size={18} className="text-rose-400" />
        ) : (
          <Info size={18} className="text-blue-400" />
        )}
      </div>

      <div className="flex-1 min-w-0 pr-4">
        <h4 className="text-xs font-bold text-white tracking-wide">{toast.title}</h4>
        <p className="text-[11px] text-slate-300 mt-0.5 whitespace-pre-line leading-relaxed">{toast.message}</p>
      </div>

      <button
        onClick={() => removeAppToast(toast.id)}
        className="absolute top-2.5 right-2.5 p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
      >
        <X size={12} />
      </button>
    </div>
  );
}
