'use client';

import { useEffect } from 'react';
import { useToastStore, Toast as ToastType } from '@/lib/hooks/useToast';
import { CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';

const Toast = ({ toast }: { toast: ToastType }) => {
  const { removeToast } = useToastStore();

  const icons = {
    success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
    error: <AlertCircle className="w-5 h-5 text-red-400" />,
    info: <Info className="w-5 h-5 text-sky-400" />,
    warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  };

  const styles = {
    success: 'bg-emerald-500/10 border-emerald-500/20',
    error: 'bg-red-500/10 border-red-500/20',
    info: 'bg-sky-500/10 border-sky-500/20',
    warning: 'bg-amber-500/10 border-amber-500/20',
  };

  return (
    <div
      className={`
        ${styles[toast.type]}
        border rounded-lg px-4 py-3 shadow-lg
        flex items-start space-x-3
        animate-in slide-in-from-right-full duration-300
      `}
    >
      <div className="flex-shrink-0 mt-0.5">{icons[toast.type]}</div>
      <p className="text-sm text-slate-50 flex-1">{toast.message}</p>
      <button
        onClick={() => removeToast(toast.id)}
        className="flex-shrink-0 text-slate-400 hover:text-slate-50 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

export const ToastContainer = () => {
  const { toasts } = useToastStore();

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 w-80">
      {toasts.map((toast) => (
        <Toast key={toast.id} toast={toast} />
      ))}
    </div>
  );
};

export default Toast;
