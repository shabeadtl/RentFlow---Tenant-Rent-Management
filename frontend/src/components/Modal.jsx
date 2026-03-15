import { createPortal } from 'react-dom';

/**
 * Reusable modal dialog with glass-morphism backdrop.
 */
export default function Modal({ open, onClose, title, children, maxWidth = 'max-w-lg' }) {
    if (!open) return null;

    return createPortal(
        <div className="fixed inset-0 z-50 overflow-y-auto">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative flex min-h-full items-center justify-center p-6">
                {/* Panel */}
                <div className={`relative flex max-h-[calc(100vh-3rem)] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl animate-fade-in-up`}>
                    {/* Header */}
                    <div className="flex items-center justify-between border-b border-[var(--color-border)] px-6 py-4 shrink-0">
                        <h2 className="text-lg font-semibold">{title}</h2>
                        <button
                            onClick={onClose}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-xl leading-none"
                        >
                            ✕
                        </button>
                    </div>

                    {/* Body */}
                    <div className="overflow-y-auto px-6 py-5">{children}</div>
                </div>
            </div>
        </div>,
        document.body
    );
}
