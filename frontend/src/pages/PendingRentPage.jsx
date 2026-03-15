import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPayments, fetchProperties, fetchTenants } from '../api';
import { useToast } from '../components/Toast';

const SORT_OPTIONS = [
    { value: 'highest', label: 'Highest Amount' },
    { value: 'oldest', label: 'Oldest (Lease Start)' },
    { value: 'newest', label: 'Newest (Lease Start)' },
];

export default function PendingRentPage() {
    const [pendingItems, setPendingItems] = useState([]);
    const [totalPending, setTotalPending] = useState(0);
    const [currentMonthLabel, setCurrentMonthLabel] = useState('');
    const [sortBy, setSortBy] = useState('highest');
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            try {
                const currentMonth = new Date().toISOString().slice(0, 7);
                const label = new Date(`${currentMonth}-01`).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                });
                setCurrentMonthLabel(label);

                const [properties, tenants, payments] = await Promise.all([
                    fetchProperties(),
                    fetchTenants(),
                    fetchPayments({ month_covered: currentMonth }),
                ]);

                const propertyMap = Object.fromEntries(properties.map(p => [p.id, p]));
                const activeTenants = tenants.filter(t => t.status === 'active');
                const paidByTenant = payments.reduce((acc, payment) => {
                    acc[payment.tenant_id] = (acc[payment.tenant_id] || 0) + Number(payment.amount_paid || 0);
                    return acc;
                }, {});

                const items = activeTenants
                    .map((tenant) => {
                        const property = propertyMap[tenant.property_id];
                        const rentAmount = Number(property?.rent_amount || 0);
                        const paidAmount = Number(paidByTenant[tenant.id] || 0);
                        const pendingAmount = Math.max(rentAmount - paidAmount, 0);
                        if (pendingAmount <= 0) return null;
                        return {
                            id: tenant.id,
                            tenantName: tenant.name,
                            propertyName: property?.address || 'Unknown Property',
                            unitNumber: tenant.unit_number,
                            paidAmount,
                            pendingAmount,
                            rentAmount,
                            leaseStart: tenant.lease_start,
                        };
                    })
                    .filter(Boolean);

                setTotalPending(items.reduce((sum, item) => sum + item.pendingAmount, 0));
                setPendingItems(items);
            } catch (err) {
                console.error('Pending rent load error:', err);
                toast.error('Failed to load pending rent data.');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [toast]);

    const sortedItems = useMemo(() => {
        const copy = [...pendingItems];
        switch (sortBy) {
            case 'highest':
                return copy.sort((a, b) => b.pendingAmount - a.pendingAmount);
            case 'oldest':
                return copy.sort((a, b) => {
                    if (!a.leaseStart) return 1;
                    if (!b.leaseStart) return -1;
                    return new Date(a.leaseStart) - new Date(b.leaseStart);
                });
            case 'newest':
                return copy.sort((a, b) => {
                    if (!b.leaseStart) return 1;
                    if (!a.leaseStart) return -1;
                    return new Date(b.leaseStart) - new Date(a.leaseStart);
                });
            default:
                return copy;
        }
    }, [pendingItems, sortBy]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <button
                            onClick={() => navigate('/')}
                            className="text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors text-sm"
                        >
                            ← Dashboard
                        </button>
                    </div>
                    <h1 className="text-2xl font-bold tracking-tight">Pending Rent</h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">
                        {sortedItems.length} tenant{sortedItems.length === 1 ? '' : 's'} with pending rent for {currentMonthLabel}
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="bg-[var(--color-danger)]/10 text-[var(--color-danger)] px-4 py-2 rounded-lg text-sm font-semibold">
                        Total: ₹{totalPending.toLocaleString()}
                    </div>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    >
                        {SORT_OPTIONS.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Pending tenants list */}
            {sortedItems.length > 0 ? (
                <div className="space-y-3">
                    {sortedItems.map((item, index) => (
                        <div
                            key={item.id}
                            className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-primary)]/30 transition-all duration-300"
                            style={{ animationDelay: `${index * 0.05}s` }}
                        >
                            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                                <div className="flex items-center gap-4">
                                    <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[var(--color-danger)] to-[var(--color-warning)] flex items-center justify-center text-sm font-bold shrink-0">
                                        {item.tenantName.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-base">{item.tenantName}</p>
                                        <p className="text-sm text-[var(--color-text-muted)]">
                                            {item.propertyName}{item.unitNumber ? ` • Unit ${item.unitNumber}` : ''}
                                        </p>
                                        {item.leaseStart && (
                                            <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                                                Lease from: {new Date(item.leaseStart).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-6 text-sm">
                                    <div className="text-center">
                                        <p className="text-[var(--color-text-muted)] text-xs mb-0.5">Rent</p>
                                        <p className="font-medium">₹{item.rentAmount.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[var(--color-text-muted)] text-xs mb-0.5">Paid</p>
                                        <p className="font-medium text-[var(--color-success)]">₹{item.paidAmount.toLocaleString()}</p>
                                    </div>
                                    <div className="text-center">
                                        <p className="text-[var(--color-text-muted)] text-xs mb-0.5">Pending</p>
                                        <p className="font-bold text-[var(--color-danger)] text-lg">₹{item.pendingAmount.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                            {/* Progress bar */}
                            <div className="mt-3">
                                <div className="w-full bg-[var(--color-surface-dark)] rounded-full h-2">
                                    <div
                                        className="h-2 rounded-full transition-all duration-500"
                                        style={{
                                            width: `${Math.min((item.paidAmount / item.rentAmount) * 100, 100)}%`,
                                            background: item.paidAmount > 0 ? 'var(--color-success)' : 'var(--color-danger)',
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                                    {item.rentAmount > 0 ? Math.round((item.paidAmount / item.rentAmount) * 100) : 0}% paid
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-8 text-center">
                    <p className="text-[var(--color-success)] text-4xl mb-3">🎉</p>
                    <p className="text-lg font-semibold">All Clear!</p>
                    <p className="text-sm text-[var(--color-text-muted)] mt-1">No pending rent for {currentMonthLabel}. All active tenants have paid.</p>
                </div>
            )}
        </div>
    );
}
