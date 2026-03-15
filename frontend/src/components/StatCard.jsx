/**
 * Reusable stat card for the dashboard overview.
 * Supports optional onClick to make the card navigable.
 */
export default function StatCard({ icon, label, value, accent = 'var(--color-primary)', onClick }) {
    const Tag = onClick ? 'button' : 'div';
    return (
        <Tag
            onClick={onClick}
            className={`group relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-primary)]/40 transition-all duration-300 hover:shadow-lg hover:shadow-[var(--color-primary)]/5 text-left w-full ${onClick ? 'cursor-pointer' : ''}`}
        >
            {/* Glow accent */}
            <div
                className="absolute top-0 left-0 w-1 h-full rounded-l-xl"
                style={{ background: accent }}
            />
            <div className="flex items-center gap-4">
                <div
                    className="w-11 h-11 rounded-lg flex items-center justify-center text-xl"
                    style={{ background: `${accent}22` }}
                >
                    {icon}
                </div>
                <div>
                    <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wider mb-1">{label}</p>
                    <p className="text-2xl font-bold tracking-tight">{value}</p>
                </div>
            </div>
            {onClick && (
                <div className="absolute bottom-2 right-3 text-xs text-[var(--color-text-muted)] opacity-0 group-hover:opacity-100 transition-opacity">
                    Click to view →
                </div>
            )}
        </Tag>
    );
}
