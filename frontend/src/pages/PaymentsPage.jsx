import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchPayments, fetchTenants, fetchProperties, createPayment } from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportDetailsToPdf } from '../utils/exportPdf';

const currentMonth = () => new Date().toISOString().slice(0, 7);
const formatPaymentType = (value) => value === 'advance' ? 'Advance' : 'Rent';

export default function PaymentsPage() {
    const [payments, setPayments] = useState([]);
    const [tenants, setTenants] = useState([]);
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState({ tenant_id: '', amount_paid: '', payment_date: new Date().toISOString().slice(0, 10), month_covered: currentMonth(), payment_type: 'rent', note: '' });
    const [filterMonth, setFilterMonth] = useState('');
    const { canManagePayments } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const emptyForm = { tenant_id: '', amount_paid: '', payment_date: new Date().toISOString().slice(0, 10), month_covered: currentMonth(), payment_type: 'rent', note: '' };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [pay, ten, prop] = await Promise.all([
                fetchPayments(),
                fetchTenants(),
                fetchProperties(),
            ]);
            setPayments(pay);
            setTenants(ten);
            setProperties(prop);
        } catch (e) {
            console.error(e);
            toast.error('Failed to load payments.');
        }
        finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const tenantMap = useMemo(() => Object.fromEntries(tenants.map(t => [t.id, t])), [tenants]);
    const propertyMap = useMemo(() => Object.fromEntries(properties.map(p => [p.id, p])), [properties]);
    const filteredPayments = useMemo(
        () => filterMonth ? payments.filter((payment) => payment.month_covered === filterMonth) : payments,
        [filterMonth, payments]
    );

    const months = useMemo(() => {
        const now = new Date();
        const result = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            result.push(d.toISOString().slice(0, 7)); // '2026-03'
        }
        return result;
    }, []);

    const activeTenants = tenants.filter(t => t.status === 'active');

    const paymentTotals = useMemo(() => {
        const totals = {};
        payments.forEach((payment) => {
            const key = `${payment.tenant_id}__${payment.month_covered}`;
            totals[key] = (totals[key] || 0) + Number(payment.amount_paid || 0);
        });
        return totals;
    }, [payments]);

    const formatMonth = (m) => {
        const [y, mo] = m.split('-');
        const date = new Date(+y, +mo - 1);
        return date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
    };

    const statementTotals = useMemo(() => {
        const totalCollected = filteredPayments.reduce(
            (sum, payment) => sum + Number(payment.amount_paid || 0),
            0
        );
        const uniqueTenantIds = new Set(filteredPayments.map((payment) => payment.tenant_id));
        return {
            totalCollected,
            paymentCount: filteredPayments.length,
            tenantCount: uniqueTenantIds.size,
        };
    }, [filteredPayments]);

    const handleExportStatement = async () => {
        const statementLabel = filterMonth ? formatMonth(filterMonth) : 'All Months';
        try {
            await exportDetailsToPdf({
                title: `Payment Statement - ${statementLabel}`,
                subtitle: `${statementTotals.paymentCount} payment record${statementTotals.paymentCount === 1 ? '' : 's'} across ${statementTotals.tenantCount} tenant${statementTotals.tenantCount === 1 ? '' : 's'}`,
                sections: [
                    {
                        title: 'Statement Summary',
                        fields: [
                            { label: 'Period', value: statementLabel },
                            { label: 'Total Collected', value: `Rs ${statementTotals.totalCollected.toLocaleString()}` },
                            { label: 'Payments Included', value: statementTotals.paymentCount },
                            { label: 'Tenants Covered', value: statementTotals.tenantCount },
                        ],
                    },
                    {
                        title: 'Payment Entries',
                        fields: filteredPayments.map((payment) => {
                            const tenant = tenantMap[payment.tenant_id];
                            const property = propertyMap[tenant?.property_id];
                            const parts = [
                                `Amount: Rs ${Number(payment.amount_paid).toLocaleString()}`,
                                `Type: ${formatPaymentType(payment.payment_type)}`,
                                `Date: ${payment.payment_date}`,
                                `Month: ${formatMonth(payment.month_covered)}`,
                                `Property: ${property?.address || 'Unknown property'}`,
                            ];
                            if (payment.note) {
                                parts.push(`Note: ${payment.note}`);
                            }
                            return {
                                label: tenant?.name || payment.tenant_id,
                                value: parts.join('\n'),
                            };
                        }),
                    },
                ],
            });
            toast.success('Payment statement PDF exported.');
        } catch (error) {
            console.error(error);
            toast.error('Failed to export payment statement PDF.');
        }
    };

    const openNew = () => {
        setForm(emptyForm);
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = {
            ...form,
            amount_paid: Number(form.amount_paid),
            payment_type: form.payment_type,
            note: form.note?.trim() || null,
        };
        if (!Number.isFinite(data.amount_paid) || data.amount_paid <= 0) {
            toast.error('Amount must be greater than 0.');
            return;
        }
        const hasDuplicateMonth = payments.some(
            (payment) => payment.tenant_id === data.tenant_id && payment.month_covered === data.month_covered
        );
        if (hasDuplicateMonth) {
            toast.error('A payment for this tenant and month already exists. Open the existing record to update it.');
            return;
        }
        try {
            await createPayment(data);
            toast.success('Payment recorded.');
            setModalOpen(false);
            setForm(emptyForm);
            load();
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to save payment.');
        }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Rent Tracking</h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">Payment status across the last 6 months</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        onClick={handleExportStatement}
                        className="px-4 py-2 border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[var(--color-text)] text-sm font-medium rounded-lg transition-colors"
                    >
                        Export Statement PDF
                    </button>
                    {canManagePayments && (
                        <button
                            onClick={openNew}
                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            + Record Payment
                        </button>
                    )}
                </div>
            </div>

            {/* Rent Status Grid */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                                <th className="px-5 py-3 sticky left-0 bg-[var(--color-surface)] z-10">Tenant</th>
                                <th className="px-5 py-3">Property</th>
                                {months.map(m => <th key={m} className="px-4 py-3 text-center">{formatMonth(m)}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                            {activeTenants.map(t => (
                                <tr key={t.id} className="hover:bg-[var(--color-surface-light)]/40 transition-colors">
                                    <td className="px-5 py-3 font-medium whitespace-nowrap sticky left-0 bg-[var(--color-surface)]">{t.name}</td>
                                    <td className="px-5 py-3 text-[var(--color-text-muted)] whitespace-nowrap">{propertyMap[t.property_id]?.address || '—'}</td>
                                    {months.map(m => {
                                        const totalPaid = paymentTotals[`${t.id}__${m}`] || 0;
                                        const rentDue = Number(propertyMap[t.property_id]?.rent_amount || 0);
                                        const status = totalPaid <= 0
                                            ? 'pending'
                                            : totalPaid >= rentDue
                                                ? 'paid'
                                                : 'partial';
                                        return (
                                            <td key={m} className="px-4 py-3 text-center">
                                                <span className={`inline-flex items-center justify-center min-w-20 px-3 py-1 rounded-full text-xs font-medium ${status === 'paid'
                                                        ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                                                        : status === 'partial'
                                                            ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                                                            : 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                                                    }`}>
                                                    {status === 'paid' ? '✓ Paid' : status === 'partial' ? 'Partial' : 'Pending'}
                                                </span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {activeTenants.length === 0 && (
                                <tr><td colSpan={2 + months.length} className="px-5 py-8 text-center text-[var(--color-text-muted)]">No active tenants to track.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Recent Payments List */}
            <div>
                <h2 className="text-lg font-semibold mb-3">Recent Payments</h2>
                <div className="flex items-center gap-3 mb-4">
                    <select value={filterMonth} onChange={e => setFilterMonth(e.target.value)}
                        className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                        <option value="">All Months</option>
                        {months.map(m => <option key={m} value={m}>{formatMonth(m)}</option>)}
                    </select>
                </div>
                <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                                    <th className="px-5 py-3">Tenant</th>
                                    <th className="px-5 py-3">Amount (₹)</th>
                                    <th className="px-5 py-3">Type</th>
                                    <th className="px-5 py-3">Date</th>
                                    <th className="px-5 py-3">Month</th>
                                    <th className="px-5 py-3">Note</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-[var(--color-border)]">
                                {filteredPayments.map(p => (
                                    <tr
                                        key={p.id}
                                        tabIndex={0}
                                        role="button"
                                        onClick={() => navigate(`/payments/${p.id}`)}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                navigate(`/payments/${p.id}`);
                                            }
                                        }}
                                        className="hover:bg-[var(--color-surface-light)]/40 transition-colors cursor-pointer focus:outline-none focus:bg-[var(--color-surface-light)]/40"
                                    >
                                        <td className="px-5 py-3 font-medium">{tenantMap[p.tenant_id]?.name || p.tenant_id}</td>
                                        <td className="px-5 py-3">₹{Number(p.amount_paid).toLocaleString()}</td>
                                        <td className="px-5 py-3">
                                            <span className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${p.payment_type === 'advance'
                                                    ? 'bg-[var(--color-accent)]/15 text-[var(--color-accent)]'
                                                    : 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                                                }`}>
                                                {formatPaymentType(p.payment_type)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-3 text-[var(--color-text-muted)]">{p.payment_date}</td>
                                        <td className="px-5 py-3">{formatMonth(p.month_covered)}</td>
                                        <td className="px-5 py-3 text-[var(--color-text-muted)] max-w-[240px] truncate">{p.note || '—'}</td>
                                    </tr>
                                ))}
                                {filteredPayments.length === 0 && (
                                    <tr><td colSpan={6} className="px-5 py-8 text-center text-[var(--color-text-muted)]">No payments recorded.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Record / Edit Payment Modal */}
            {canManagePayments && (
                <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Record Payment">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Tenant *</label>
                        <select required value={form.tenant_id} onChange={e => set('tenant_id', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                            <option value="">Select…</option>
                            {activeTenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Amount (₹) *</label>
                            <input type="number" min="0.01" step="0.01" required value={form.amount_paid} onChange={e => set('amount_paid', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Month Covered *</label>
                            <input type="month" required value={form.month_covered} onChange={e => set('month_covered', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Payment Type *</label>
                            <select value={form.payment_type} onChange={e => set('payment_type', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                                <option value="rent">Rent</option>
                                <option value="advance">Advance</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Payment Date</label>
                            <input type="date" value={form.payment_date} onChange={e => set('payment_date', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Note</label>
                        <textarea
                            rows="3"
                            value={form.note}
                            onChange={e => set('note', e.target.value)}
                            placeholder="Add a payment note or reference..."
                            className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors">Record Payment</button>
                    </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
