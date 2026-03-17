
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext(null);

export function useToast() {
    return useContext(ToastContext);
}

export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const timeoutMap = useRef(new Map());

    const removeToast = useCallback((id) => {
        const timeoutId = timeoutMap.current.get(id);
        if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutMap.current.delete(id);
        }
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const addToast = useCallback((message, type = 'error', options = {}) => {
        const {
            duration = type === 'confirm' ? 0 : 4000,
            title = '',
            confirmLabel = 'Confirm',
            cancelLabel = 'Cancel',
            onConfirm,
            onCancel,
        } = options;

        const id = Date.now() + Math.random();
        setToasts((prev) => [
            ...prev,
            {
                id,
                message,
                title,
                type,
                confirmLabel,
                cancelLabel,
                onConfirm,
                onCancel,
            },
        ]);

        if (duration > 0) {
            const timeoutId = setTimeout(() => {
                removeToast(id);
            }, duration);
            timeoutMap.current.set(id, timeoutId);
        }

        return id;
    }, [removeToast]);

    const confirm = useCallback((message, options = {}) => new Promise((resolve) => {
        addToast(message, 'confirm', {
            ...options,
            duration: 0,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false),
        });
    }), [addToast]);

    const value = useMemo(() => ({
        error: (msg, options) => addToast(msg, 'error', options),
        success: (msg, options) => addToast(msg, 'success', options),
        info: (msg, options) => addToast(msg, 'info', options),
        confirm,
    }), [addToast, confirm]);

    return (
        <ToastContext.Provider value={value}>
            {children}

            <div className="fixed bottom-6 right-6 z-[100] flex max-w-m flex-col gap-3 pointer-events-none">
                {toasts.map((toast) => {
                    const styleClass = toast.type === 'error'
                        ? 'bg-[var(--color-danger)]/15 border-[var(--color-danger)]/30 text-[var(--color-danger)]'
                        : toast.type === 'success'
                            ? 'bg-[var(--color-success)]/15 border-[var(--color-success)]/30 text-[var(--color-success)]'
                            : toast.type === 'confirm'
                                ? 'bg-[var(--color-warning)]/12 border-[var(--color-warning)]/30 text-[var(--color-text)]'
                                : 'bg-[var(--color-primary)]/15 border-[var(--color-primary)]/30 text-[var(--color-primary-light)]';

                    const icon = toast.type === 'error'
                        ? '⚠'
                        : toast.type === 'success'
                            ? '✓'
                            : toast.type === 'confirm'
                                ? '?'
                                : 'ℹ';

                    return (
                        <div
                            key={toast.id}
                            className={`pointer-events-auto max-w-sm rounded-2xl border px-4 py-3 shadow-xl backdrop-blur-md animate-fade-in-up ${styleClass}`}
                        >
                            <div className="flex items-start gap-3">
                                <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/15 text-sm font-semibold">
                                    {icon}
                                </div>
                                <div className="min-w-0 flex-1">
                                    {toast.title && (
                                        <p className="mb-1 text-sm font-semibold text-[var(--color-text)]">{toast.title}</p>
                                    )}
                                    <p className={`text-sm leading-6 ${toast.type === 'confirm' ? 'text-[var(--color-text)]' : ''}`}>
                                        {toast.message}
                                    </p>

                                    {toast.type === 'confirm' ? (
                                        <div className="mt-3 flex items-center justify-end gap-2">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    toast.onCancel?.();
                                                    removeToast(toast.id);
                                                }}
                                                className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                                            >
                                                {toast.cancelLabel}
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    toast.onConfirm?.();
                                                    removeToast(toast.id);
                                                }}
                                                className="rounded-lg bg-[var(--color-warning)] px-3 py-1.5 text-xs font-semibold text-[#1f2937] transition-transform hover:-translate-y-0.5"
                                            >
                                                {toast.confirmLabel}
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => removeToast(toast.id)}
                                            className="mt-2 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                                        >
                                            Dismiss
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </ToastContext.Provider>
    );
}
