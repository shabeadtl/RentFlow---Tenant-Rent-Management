import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import StatCard from '../components/StatCard';
import { fetchPayments, fetchProperties, fetchTenants, fetchRevenue } from '../api';
import { useToast } from '../components/Toast';

export default function DashboardPage() {
    const [stats, setStats] = useState({
        properties: 0,
        tenants: 0,
        revenue: 0,
        occupancy: 0,
        pendingAmount: 0,
        pendingCount: 0,
        pendingItems: [],
        currentMonthLabel: '',
    });
    const [loading, setLoading] = useState(true);
    const toast = useToast();
    const navigate = useNavigate();

    useEffect(() => {
        async function load() {
            try {
                const currentMonth = new Date().toISOString().slice(0, 7);
                const currentMonthLabel = new Date(`${currentMonth}-01`).toLocaleDateString('en-US', {
                    month: 'long',
                    year: 'numeric',
                });

                const [properties, tenants, revenue, payments] = await Promise.all([
                    fetchProperties(),
                    fetchTenants(),
                    fetchRevenue(),
                    fetchPayments({ month_covered: currentMonth }),
                ]);

                const totalUnits = properties.reduce((s, p) => s + (p.total_units || 0), 0);
                const activeTenants = tenants.filter(t => t.status === 'active');
                const occupancyPercent = totalUnits > 0 ? Math.round((activeTenants.length / totalUnits) * 100) : 0;
                const propertyMap = Object.fromEntries(properties.map(p => [p.id, p]));
                const paidByTenant = payments.reduce((acc, payment) => {
                    acc[payment.tenant_id] = (acc[payment.tenant_id] || 0) + Number(payment.amount_paid || 0);
                    return acc;
                }, {});
                const pendingItems = activeTenants
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
                        };
                    })
                    .filter(Boolean)
                    .sort((a, b) => b.pendingAmount - a.pendingAmount);
                const totalPendingAmount = pendingItems.reduce((sum, item) => sum + item.pendingAmount, 0);

                setStats({
                    properties: properties.length,
                    tenants: activeTenants.length,
                    revenue: revenue.total_revenue,
                    occupancy: occupancyPercent,
                    pendingAmount: totalPendingAmount,
                    pendingCount: pendingItems.length,
                    pendingItems,
                    currentMonthLabel,
                });
            } catch (err) {
                console.error('Dashboard load error:', err);
                toast.error('Failed to load dashboard data. Is the backend running?');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [toast]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
                <p className="text-[var(--color-text-muted)] text-sm mt-1">Overview of your properties, revenue, and pending rent</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 stagger">
                <StatCard icon="🏢" label="Properties" value={stats.properties} accent="var(--color-primary)" onClick={() => navigate('/properties')} />
                <StatCard icon="👥" label="Active Tenants" value={stats.tenants} accent="var(--color-accent)" onClick={() => navigate('/tenants')} />
                <StatCard icon="💰" label="Total Revenue" value={`₹${stats.revenue.toLocaleString()}`} accent="var(--color-success)" onClick={() => navigate('/payments')} />
                <StatCard icon="⏳" label="Pending Rent" value={`₹${stats.pendingAmount.toLocaleString()}`} accent="var(--color-danger)" onClick={() => navigate('/pending-rent')} />
                <StatCard icon="📈" label="Occupancy" value={`${stats.occupancy}%`} accent="var(--color-warning)" />
            </div>

            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
                    <div>
                        <h2 className="text-lg font-semibold">Pending Rent for {stats.currentMonthLabel}</h2>
                        <p className="text-sm text-[var(--color-text-muted)]">
                            {stats.pendingCount} active tenant{stats.pendingCount === 1 ? '' : 's'} still pending this month
                        </p>
                    </div>
                    <div className="text-sm text-[var(--color-text-muted)]">
                        Total due: <span className="text-[var(--color-danger)] font-semibold">₹{stats.pendingAmount.toLocaleString()}</span>
                    </div>
                </div>

                {stats.pendingItems.length > 0 ? (
                    <div className="space-y-3">
                        {stats.pendingItems.map((item) => (
                            <div
                                key={item.id}
                                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3"
                            >
                                <div>
                                    <p className="font-medium">{item.tenantName}</p>
                                    <p className="text-sm text-[var(--color-text-muted)]">
                                        {item.propertyName}{item.unitNumber ? ` • Unit ${item.unitNumber}` : ''}
                                    </p>
                                </div>
                                <div className="flex gap-6 text-sm">
                                    <div>
                                        <p className="text-[var(--color-text-muted)]">Paid</p>
                                        <p className="font-medium text-[var(--color-success)]">₹{item.paidAmount.toLocaleString()}</p>
                                    </div>
                                    <div>
                                        <p className="text-[var(--color-text-muted)]">Pending</p>
                                        <p className="font-medium text-[var(--color-danger)]">₹{item.pendingAmount.toLocaleString()}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-6 text-sm text-[var(--color-text-muted)]">
                        No pending rent for {stats.currentMonthLabel}. All active tenants are marked paid.
                    </div>
                )}
            </div>

            {/* Quick-info panel */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                <h2 className="text-lg font-semibold mb-3">Getting Started</h2>
                <ul className="space-y-2 text-sm text-[var(--color-text-muted)]">
                    <li className="flex items-start gap-2"><span className="text-[var(--color-primary)]">→</span> Add your properties with unit count &amp; rent amount</li>
                    <li className="flex items-start gap-2"><span className="text-[var(--color-primary)]">→</span> Register tenants and link them to a property</li>
                    <li className="flex items-start gap-2"><span className="text-[var(--color-primary)]">→</span> Record monthly payments to track rent collection</li>
                </ul>
            </div>
        </div>
    );
}
