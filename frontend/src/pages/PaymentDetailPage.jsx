import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deletePayment, fetchPayment, fetchProperties, fetchTenants, updatePayment } from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportDetailsToPdf } from '../utils/exportPdf';

function paymentToForm(payment) {
    return {
        tenant_id: payment.tenant_id,
        amount_paid: payment.amount_paid,
        payment_date: payment.payment_date,
        month_covered: payment.month_covered,
        payment_type: payment.payment_type || 'rent',
        note: payment.note || '',
    };
}

function formatMonth(value) {
    const [year, month] = value.split('-');
    return new Date(+year, +month - 1).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
    });
}

function formatPaymentType(value) {
    return value === 'advance' ? 'Advance' : 'Rent';
}

function DetailStat({ label, value, tone = 'default' }) {
    const toneClass = tone === 'success'
        ? 'from-[var(--color-success)]/18 to-transparent border-[var(--color-success)]/25'
        : tone === 'accent'
            ? 'from-[var(--color-accent)]/18 to-transparent border-[var(--color-accent)]/25'
            : 'from-white/6 to-transparent border-white/8';

    return (
        <div className={`rounded-2xl border bg-gradient-to-br ${toneClass} px-4 py-4 backdrop-blur-sm`}>
            <p className="mb-2 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">{label}</p>
            <p className="text-lg font-semibold tracking-tight">{value}</p>
        </div>
    );
}

function DetailBlock({ eyebrow, title, children, accent = 'var(--color-primary)' }) {
    return (
        <section className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.98))] p-6 shadow-[0_24px_80px_rgba(2,6,23,.28)]">
            <div className="absolute inset-x-0 top-0 h-px" style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }} />
            <p className="mb-2 text-[11px] uppercase tracking-[0.28em] text-[var(--color-text-muted)]">{eyebrow}</p>
            <h2 className="mb-5 text-2xl font-semibold tracking-tight">{title}</h2>
            {children}
        </section>
    );
}

export default function PaymentDetailPage() {
    const { paymentId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { canManagePayments } = useAuth();
    const [payment, setPayment] = useState(null);
    const [tenants, setTenants] = useState([]);
    const [properties, setProperties] = useState([]);
    const [form, setForm] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [paymentData, tenantsData, propertiesData] = await Promise.all([
                fetchPayment(paymentId),
                fetchTenants(),
                fetchProperties(),
            ]);
            setPayment(paymentData);
            setTenants(tenantsData);
            setProperties(propertiesData);
            setForm(paymentToForm(paymentData));
        } catch (err) {
            console.error(err);
            setPayment(null);
            toast.error('Failed to load payment details.');
        } finally {
            setLoading(false);
        }
    }, [paymentId, toast]);

    useEffect(() => { load(); }, [load]);

    const tenantMap = useMemo(
        () => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant])),
        [tenants]
    );
    const propertyMap = useMemo(
        () => Object.fromEntries(properties.map((property) => [property.id, property])),
        [properties]
    );
    const tenant = payment ? tenantMap[payment.tenant_id] : null;
    const property = tenant ? propertyMap[tenant.property_id] : null;
    const paymentType = payment?.payment_type || 'rent';
    const selectableTenants = useMemo(
        () => tenants.filter((tenantItem) => tenantItem.status === 'active' || tenantItem.id === payment?.tenant_id),
        [payment?.tenant_id, tenants]
    );

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const handleExport = async () => {
        try {
            await exportDetailsToPdf({
                title: `Payment Record - ${tenant?.name || payment.tenant_id}`,
                subtitle: `Covered month: ${formatMonth(payment.month_covered)}`,
                sections: [
                    {
                        title: 'Payment Details',
                        fields: [
                            { label: 'Amount', value: `Rs ${Number(payment.amount_paid).toLocaleString()}` },
                            { label: 'Payment Type', value: formatPaymentType(payment.payment_type) },
                            { label: 'Payment Date', value: payment.payment_date },
                            { label: 'Month Covered', value: formatMonth(payment.month_covered) },
                            { label: 'Payment Note', value: payment.note || 'No payment note saved' },
                        ],
                    },
                    {
                        title: 'Linked Tenant',
                        fields: [
                            { label: 'Tenant', value: tenant?.name || payment.tenant_id },
                            { label: 'Property', value: property?.address || 'Unknown property' },
                            { label: 'Tenant Status', value: tenant?.status || 'Unknown' },
                        ],
                    },
                ],
            });
            toast.success('Payment PDF exported.');
        } catch (err) {
            console.error(err);
            toast.error('Failed to export payment PDF.');
        }
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
        try {
            const updated = await updatePayment(paymentId, data);
            setPayment(updated);
            setForm(paymentToForm(updated));
            setModalOpen(false);
            toast.success('Payment updated.');
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to update payment.');
        }
    };

    const handleDelete = async () => {
        const confirmed = await toast.confirm('Delete this payment record?', {
            title: 'Confirm deletion',
            confirmLabel: 'Delete',
        });
        if (!confirmed) return;
        try {
            await deletePayment(paymentId);
            toast.success('Payment deleted.');
            navigate('/payments');
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete payment.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
        );
    }

    if (!payment || !form) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <Link to="/payments" className="inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                    ← Back to payments
                </Link>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                    <h1 className="text-xl font-semibold">Payment not found</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">The payment details could not be loaded.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative isolate space-y-6 animate-fade-in-up">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_40%),radial-gradient(circle_at_top_right,rgba(129,140,248,0.14),transparent_38%)]" />

            <div className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(135deg,rgba(30,41,59,.92),rgba(15,23,42,.98))] shadow-[0_24px_80px_rgba(2,6,23,.34)]">
                <div className="flex flex-col gap-6 px-6 py-6 lg:px-8 lg:py-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <Link to="/payments" className="mb-4 inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                                ← Back to payments
                            </Link>
                            <div className="flex items-start gap-4">
                                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-success)] via-[var(--color-accent)] to-[var(--color-primary)] text-2xl font-bold shadow-[0_14px_35px_rgba(16,185,129,.28)]">
                                    ₹
                                    <div className="absolute inset-0 rounded-2xl ring-1 ring-white/15" />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-[var(--color-success)]/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-success)]">
                                            {formatPaymentType(paymentType)} payment
                                        </span>
                                        <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                            {formatMonth(payment.month_covered)}
                                        </span>
                                        <span className={`rounded-full border px-3 py-1 text-xs ${paymentType === 'advance'
                                                ? 'border-[var(--color-accent)]/20 bg-[var(--color-accent)]/10 text-[var(--color-accent)]'
                                                : 'border-[var(--color-success)]/20 bg-[var(--color-success)]/10 text-[var(--color-success)]'
                                            }`}>
                                            {formatPaymentType(paymentType)}
                                        </span>
                                    </div>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">₹{Number(payment.amount_paid).toLocaleString()}</h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                                        Payment timeline, tenant context, and note history in one view so adjustments and verification are faster.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                            <button
                                onClick={handleExport}
                                className="rounded-xl border border-white/10 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-[var(--color-text)] transition-all hover:-translate-y-0.5 hover:bg-white/[0.08]"
                            >
                                Export PDF
                            </button>
                            {canManagePayments && (
                                <>
                                <button
                                    onClick={() => setModalOpen(true)}
                                    className="rounded-xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(99,102,241,.28)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-primary-dark)]"
                                >
                                    Edit Payment
                                </button>
                                <button
                                    onClick={handleDelete}
                                    className="rounded-xl border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-5 py-3 text-sm font-semibold text-[var(--color-danger)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-danger)]/16"
                                >
                                    Delete
                                </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                        <DetailStat label="Amount" value={`₹${Number(payment.amount_paid).toLocaleString()}`} tone="success" />
                        <DetailStat label="Type" value={formatPaymentType(paymentType)} tone="accent" />
                        <DetailStat label="Payment Date" value={payment.payment_date} />
                        <DetailStat label="Covered Month" value={formatMonth(payment.month_covered)} tone="accent" />
                        <DetailStat label="Tenant" value={tenant?.name || 'Unknown'} />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
                <DetailBlock eyebrow="Payment Record" title="Receipt Details" accent="rgba(16,185,129,.75)">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Amount</p>
                            <p className="text-2xl font-semibold tracking-tight">₹{Number(payment.amount_paid).toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Payment Type</p>
                            <p className="text-lg font-medium">{formatPaymentType(paymentType)}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Payment Date</p>
                            <p className="text-lg font-medium">{payment.payment_date}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Month Covered</p>
                            <p className="text-lg font-medium">{formatMonth(payment.month_covered)}</p>
                        </div>
                    </div>

                    <div className="mt-5 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,.86),rgba(15,23,42,.56))] p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Payment Note</p>
                                <h3 className="text-xl font-semibold tracking-tight">Reference and context</h3>
                            </div>
                            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                {payment.note ? 'Attached note' : 'No note'}
                            </span>
                        </div>
                        <p className="text-sm leading-7 text-[var(--color-text-muted)]">
                            {payment.note || 'No payment note has been saved for this record yet.'}
                        </p>
                    </div>
                </DetailBlock>

                <DetailBlock eyebrow="Linked Tenant" title="Tenant Snapshot" accent="rgba(129,140,248,.75)">
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Tenant</p>
                            <p className="text-2xl font-semibold tracking-tight">{tenant?.name || payment.tenant_id}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Property</p>
                            <p className="text-lg font-medium">{property?.address || 'Unknown property'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Tenant Status</p>
                            <p className="text-lg font-medium">{tenant?.status || 'Unknown'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(99,102,241,.12),rgba(15,23,42,.12))] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Quick Route</p>
                            <Link
                                to={tenant ? `/tenants/${tenant.id}` : '/tenants'}
                                className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-light)] hover:underline"
                            >
                                Open tenant profile →
                            </Link>
                        </div>
                    </div>
                </DetailBlock>
            </div>

            {canManagePayments && (
                <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Payment">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Tenant *</label>
                        <select required value={form.tenant_id} onChange={(e) => set('tenant_id', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none">
                            <option value="">Select…</option>
                            {selectableTenants.map((tenantItem) => <option key={tenantItem.id} value={tenantItem.id}>{tenantItem.name}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Amount (₹) *</label>
                            <input type="number" min="0.01" step="0.01" required value={form.amount_paid} onChange={(e) => set('amount_paid', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Month Covered *</label>
                            <input type="month" required value={form.month_covered} onChange={(e) => set('month_covered', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Payment Type *</label>
                            <select value={form.payment_type} onChange={(e) => set('payment_type', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none">
                                <option value="rent">Rent</option>
                                <option value="advance">Advance</option>
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Payment Date</label>
                            <input type="date" value={form.payment_date} onChange={(e) => set('payment_date', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Note</label>
                        <textarea
                            rows="3"
                            value={form.note}
                            onChange={(e) => set('note', e.target.value)}
                            placeholder="Add a payment note or reference..."
                            className="w-full resize-none rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]">Cancel</button>
                        <button type="submit" className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)]">
                            Save Changes
                        </button>
                    </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
