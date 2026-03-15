import { useEffect, useState, useMemo } from 'react';
import { fetchPayments, fetchProperties, fetchTenants, fetchRevenue } from '../api';
import { useToast } from '../components/Toast';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
} from 'recharts';

const PIE_COLORS = ['#10b981', '#f59e0b', '#ef4444'];

export default function ReportsPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const toast = useToast();

    useEffect(() => {
        async function load() {
            try {
                const [properties, tenants, payments, revenue] = await Promise.all([
                    fetchProperties(),
                    fetchTenants(),
                    fetchPayments(),
                    fetchRevenue(),
                ]);
                setData({ properties, tenants, payments, revenue });
            } catch (err) {
                console.error('Reports load error:', err);
                toast.error('Failed to load reports data.');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, [toast]);

    // Computed stats
    const stats = useMemo(() => {
        if (!data) return null;
        const { properties, tenants, payments, revenue } = data;
        const activeTenants = tenants.filter(t => t.status === 'active');
        const totalUnits = properties.reduce((s, p) => s + (p.total_units || 0), 0);

        // Expected revenue = sum of rent_amount for all properties with active tenants
        const currentMonth = new Date().toISOString().slice(0, 7);
        const propertyMap = Object.fromEntries(properties.map(p => [p.id, p]));
        const expectedRevenue = activeTenants.reduce((sum, t) => {
            const prop = propertyMap[t.property_id];
            return sum + Number(prop?.rent_amount || 0);
        }, 0);

        const collectionRate = expectedRevenue > 0
            ? ((revenue.total_revenue / expectedRevenue) * 100).toFixed(1)
            : 0;

        // Revenue by property
        const revenueByProperty = {};
        payments.forEach(p => {
            const tenant = tenants.find(t => t.id === p.tenant_id);
            const prop = tenant ? propertyMap[tenant.property_id] : null;
            const propName = prop?.address || 'Unknown';
            revenueByProperty[propName] = (revenueByProperty[propName] || 0) + Number(p.amount_paid || 0);
        });
        const barData = Object.entries(revenueByProperty).map(([name, revenue]) => ({
            name: name.length > 20 ? name.substring(0, 20) + '…' : name,
            revenue,
        }));

        // Payment status for current month
        const currentMonthPayments = payments.filter(p => p.month_covered === currentMonth);
        const paidByTenant = currentMonthPayments.reduce((acc, p) => {
            acc[p.tenant_id] = (acc[p.tenant_id] || 0) + Number(p.amount_paid || 0);
            return acc;
        }, {});

        let paidCount = 0, pendingCount = 0, overdueCount = 0;
        activeTenants.forEach(t => {
            const prop = propertyMap[t.property_id];
            const rentDue = Number(prop?.rent_amount || 0);
            const paid = paidByTenant[t.id] || 0;
            if (paid >= rentDue) paidCount++;
            else if (paid > 0) pendingCount++;
            else overdueCount++;
        });

        const total = paidCount + pendingCount + overdueCount;
        const pieData = [
            { name: 'Paid', value: paidCount, percentage: total > 0 ? Math.round((paidCount / total) * 100) : 0 },
            { name: 'Pending', value: pendingCount, percentage: total > 0 ? Math.round((pendingCount / total) * 100) : 0 },
            { name: 'Overdue', value: overdueCount, percentage: total > 0 ? Math.round((overdueCount / total) * 100) : 0 },
        ].filter(d => d.value > 0);

        return {
            totalRevenue: revenue.total_revenue,
            collectionRate,
            propertyCount: properties.length,
            totalUnits,
            activeTenantCount: activeTenants.length,
            barData,
            pieData,
        };
    }, [data]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    if (!stats) return null;

    const CustomTooltip = ({ active, payload }) => {
        if (active && payload && payload.length) {
            return (
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-3 py-2 shadow-xl">
                    <p className="text-sm font-medium">{payload[0].payload.name}</p>
                    <p className="text-sm text-[var(--color-primary-light)]">₹{Number(payload[0].value).toLocaleString()}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="space-y-8 animate-fade-in-up">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold tracking-tight">Reports & Analytics</h1>
                <p className="text-[var(--color-text-muted)] text-sm mt-1">Insights into your rental business</p>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 stagger">
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-success)]" />
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-[var(--color-text-muted)] font-medium">Total Revenue</p>
                        <span className="text-lg">💰</span>
                    </div>
                    <p className="text-2xl font-bold">₹{stats.totalRevenue.toLocaleString()}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Collected this year</p>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-accent)]" />
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-[var(--color-text-muted)] font-medium">Collection Rate</p>
                        <span className="text-lg">📈</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.collectionRate}%</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Of expected revenue</p>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-primary)]" />
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-[var(--color-text-muted)] font-medium">Properties</p>
                        <span className="text-lg">🏢</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.propertyCount}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">{stats.totalUnits} total units</p>
                </div>

                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-[var(--color-warning)]" />
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-sm text-[var(--color-text-muted)] font-medium">Active Tenants</p>
                        <span className="text-lg">👥</span>
                    </div>
                    <p className="text-2xl font-bold">{stats.activeTenantCount}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-1">Currently leasing</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Revenue by Property - Bar Chart */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold">Revenue by Property</h2>
                        <p className="text-sm text-[var(--color-text-muted)]">Total collected rent per property</p>
                    </div>
                    {stats.barData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={stats.barData} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                                <XAxis
                                    dataKey="name"
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--color-border)' }}
                                />
                                <YAxis
                                    tick={{ fill: 'var(--color-text-muted)', fontSize: 12 }}
                                    axisLine={{ stroke: 'var(--color-border)' }}
                                    tickFormatter={(v) => `₹${v >= 1000 ? (v / 1000).toFixed(0) + 'k' : v}`}
                                />
                                <Tooltip content={<CustomTooltip />} />
                                <Bar dataKey="revenue" fill="var(--color-primary)" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                            No payment data yet
                        </div>
                    )}
                </div>

                {/* Payment Status - Pie Chart */}
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6">
                    <div className="mb-4">
                        <h2 className="text-lg font-semibold">Payment Status</h2>
                        <p className="text-sm text-[var(--color-text-muted)]">Distribution of payment statuses</p>
                    </div>
                    {stats.pieData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <PieChart>
                                <Pie
                                    data={stats.pieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={4}
                                    dataKey="value"
                                    label={({ name, percentage }) => `${name} ${percentage}%`}
                                >
                                    {stats.pieData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={PIE_COLORS[['Paid', 'Pending', 'Overdue'].indexOf(entry.name)] || PIE_COLORS[0]}
                                        />
                                    ))}
                                </Pie>
                                <Legend
                                    wrapperStyle={{ fontSize: '13px', color: 'var(--color-text-muted)' }}
                                />
                                <Tooltip
                                    contentStyle={{
                                        background: 'var(--color-surface)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: '8px',
                                        color: 'var(--color-text)',
                                    }}
                                    formatter={(value, name) => [`${value} tenant${value !== 1 ? 's' : ''}`, name]}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[300px] flex items-center justify-center text-[var(--color-text-muted)] text-sm">
                            No tenants to display
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
