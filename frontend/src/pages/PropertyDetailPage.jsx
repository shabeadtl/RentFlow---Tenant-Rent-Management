import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    deleteProperty,
    fetchPayments,
    fetchProperty,
    fetchTenants,
    updateProperty,
} from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportDetailsToPdf } from '../utils/exportPdf';

function propertyToForm(property) {
    return {
        address: property.address,
        total_units: property.total_units,
        rent_amount: property.rent_amount,
        note: property.note || '',
    };
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

export default function PropertyDetailPage() {
    const { propertyId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { canManageProperties } = useAuth();
    const [property, setProperty] = useState(null);
    const [tenants, setTenants] = useState([]);
    const [payments, setPayments] = useState([]);
    const [form, setForm] = useState(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [propertyData, allTenants, allPayments] = await Promise.all([
                fetchProperty(propertyId),
                fetchTenants({ property_id: propertyId }),
                fetchPayments(),
            ]);
            setProperty(propertyData);
            setTenants(allTenants);
            setPayments(allPayments);
            setForm(propertyToForm(propertyData));
        } catch (err) {
            console.error(err);
            setProperty(null);
            toast.error('Failed to load property details.');
        } finally {
            setLoading(false);
        }
    }, [propertyId, toast]);

    useEffect(() => { load(); }, [load]);

    const activeTenants = useMemo(
        () => tenants.filter((tenant) => tenant.status === 'active'),
        [tenants]
    );
    const occupiedUnits = activeTenants.length;
    const availableUnits = Math.max(Number(property?.total_units || 0) - occupiedUnits, 0);
    const occupancy = property?.total_units ? Math.round((occupiedUnits / property.total_units) * 100) : 0;
    const propertyTenantIds = useMemo(() => new Set(tenants.map((tenant) => tenant.id)), [tenants]);
    const propertyPayments = useMemo(
        () => payments.filter((payment) => propertyTenantIds.has(payment.tenant_id)),
        [payments, propertyTenantIds]
    );
    const recentPayments = useMemo(
        () => [...propertyPayments].sort((a, b) => b.payment_date.localeCompare(a.payment_date)).slice(0, 4),
        [propertyPayments]
    );
    const monthlyRunRate = Number(property?.rent_amount || 0) * occupiedUnits;

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const handleExport = async () => {
        try {
            await exportDetailsToPdf({
                title: `Property Summary - ${property.address}`,
                subtitle: `${occupiedUnits} occupied of ${property.total_units} total units`,
                sections: [
                    {
                        title: 'Overview',
                        fields: [
                            { label: 'Property Name', value: property.address },
                            { label: 'Rent / Unit', value: `Rs ${Number(property.rent_amount).toLocaleString()}` },
                            { label: 'Total Units', value: property.total_units },
                            { label: 'Occupied Units', value: occupiedUnits },
                            { label: 'Available Units', value: availableUnits },
                            { label: 'Monthly Run Rate', value: `Rs ${monthlyRunRate.toLocaleString()}` },
                        ],
                    },
                    {
                        title: 'Property Note',
                        fields: [
                            { label: 'Manager Context', value: property.note || 'No property note added yet.' },
                        ],
                    },
                    {
                        title: 'Tenant Snapshot',
                        fields: activeTenants.slice(0, 6).map((tenant) => ({
                            label: tenant.name,
                            value: tenant.unit_number ? `Unit ${tenant.unit_number}` : 'Unit not assigned',
                        })),
                    },
                ],
            });
            toast.success('Property PDF exported.');
        } catch (err) {
            console.error(err);
            toast.error('Failed to export property PDF.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            const updated = await updateProperty(propertyId, form);
            setProperty(updated);
            setForm(propertyToForm(updated));
            setModalOpen(false);
            toast.success('Property updated.');
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to update property.');
        }
    };

    const handleDelete = async () => {
        const confirmed = await toast.confirm('Delete this property and all its tenants?', {
            title: 'Confirm deletion',
            confirmLabel: 'Delete',
        });
        if (!confirmed) return;
        try {
            await deleteProperty(propertyId);
            toast.success('Property deleted.');
            navigate('/properties');
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete property.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
        );
    }

    if (!property || !form) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <Link to="/properties" className="inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                    ← Back to properties
                </Link>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                    <h1 className="text-xl font-semibold">Property not found</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">The property details could not be loaded.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative isolate space-y-6 animate-fade-in-up">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.14),transparent_38%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_36%)]" />

            <div className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(135deg,rgba(30,41,59,.92),rgba(15,23,42,.98))] shadow-[0_24px_80px_rgba(2,6,23,.34)]">
                <div className="flex flex-col gap-6 px-6 py-6 lg:px-8 lg:py-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <Link to="/properties" className="mb-4 inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                                ← Back to properties
                            </Link>
                            <div className="flex items-start gap-4">
                                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-warning)] via-[var(--color-primary)] to-[var(--color-accent)] text-2xl font-bold shadow-[0_14px_35px_rgba(245,158,11,.24)]">
                                    P
                                    <div className="absolute inset-0 rounded-2xl ring-1 ring-white/15" />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className="rounded-full bg-[var(--color-accent)]/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-accent-light)]">
                                            {property.total_units} total units
                                        </span>
                                        <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                            {occupiedUnits} occupied
                                        </span>
                                    </div>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{property.address}</h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                                        Property performance, occupancy, and resident activity gathered into one place so management decisions feel faster and clearer.
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
                            {canManageProperties && (
                                <>
                                <button
                                    onClick={() => setModalOpen(true)}
                                    className="rounded-xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(99,102,241,.28)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-primary-dark)]"
                                >
                                    Edit Property
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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        <DetailStat label="Rent / Unit" value={`₹${Number(property.rent_amount).toLocaleString()}`} tone="accent" />
                        <DetailStat label="Occupancy" value={`${occupancy}%`} tone="success" />
                        <DetailStat label="Available Units" value={availableUnits} />
                        <DetailStat label="Run Rate" value={`₹${monthlyRunRate.toLocaleString()}`} tone="accent" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_1fr]">
                <DetailBlock eyebrow="Property Overview" title="Capacity and Notes" accent="rgba(245,158,11,.75)">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Total Units</p>
                            <p className="text-2xl font-semibold tracking-tight">{property.total_units}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Active Tenants</p>
                            <p className="text-2xl font-semibold tracking-tight">{occupiedUnits}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Available Units</p>
                            <p className="text-2xl font-semibold tracking-tight">{availableUnits}</p>
                        </div>
                    </div>

                    <div className="mt-5 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,.86),rgba(15,23,42,.56))] p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Property Note</p>
                                <h3 className="text-xl font-semibold tracking-tight">Manager context</h3>
                            </div>
                            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                {property.note ? 'Has note' : 'No note'}
                            </span>
                        </div>
                        <p className="text-sm leading-7 text-[var(--color-text-muted)]">
                            {property.note || 'No additional property note has been added yet.'}
                        </p>
                    </div>
                </DetailBlock>

                <DetailBlock eyebrow="Residents" title="Tenant Snapshot" accent="rgba(34,211,238,.75)">
                    <div className="space-y-4">
                        {activeTenants.length > 0 ? (
                            activeTenants.slice(0, 4).map((tenant) => (
                                <Link
                                    key={tenant.id}
                                    to={`/tenants/${tenant.id}`}
                                    className="block rounded-2xl border border-white/8 bg-white/[0.03] p-5 transition-all hover:border-[var(--color-primary)]/30 hover:bg-white/[0.05]"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <p className="text-lg font-semibold tracking-tight">{tenant.name}</p>
                                            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                                                {tenant.unit_number ? `Unit ${tenant.unit_number}` : 'Unit not assigned'}
                                            </p>
                                        </div>
                                        <span className="rounded-full bg-[var(--color-success)]/14 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--color-success)]">
                                            {tenant.status}
                                        </span>
                                    </div>
                                </Link>
                            ))
                        ) : (
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                                <p className="text-sm text-[var(--color-text-muted)]">No active tenants are linked to this property yet.</p>
                            </div>
                        )}

                        <div className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(99,102,241,.12),rgba(15,23,42,.12))] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Recent Payment Activity</p>
                            {recentPayments.length > 0 ? (
                                <div className="space-y-3">
                                    {recentPayments.map((payment) => {
                                        const tenant = tenants.find((item) => item.id === payment.tenant_id);
                                        return (
                                            <Link
                                                key={payment.id}
                                                to={`/payments/${payment.id}`}
                                                className="flex items-center justify-between gap-3 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                                            >
                                                <span>{tenant?.name || 'Unknown tenant'}</span>
                                                <span className="font-semibold text-[var(--color-text)]">₹{Number(payment.amount_paid).toLocaleString()}</span>
                                            </Link>
                                        );
                                    })}
                                </div>
                            ) : (
                                <p className="text-sm text-[var(--color-text-muted)]">No payments recorded for this property yet.</p>
                            )}
                        </div>
                    </div>
                </DetailBlock>
            </div>

            {canManageProperties && (
                <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Edit Property">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Property name</label>
                        <input
                            required
                            value={form.address}
                            onChange={(e) => set('address', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Total Units</label>
                            <input
                                type="number"
                                min="1"
                                required
                                value={form.total_units}
                                onChange={(e) => set('total_units', +e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none"
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Rent Amount (₹)</label>
                            <input
                                type="number"
                                min="0"
                                step="0.01"
                                required
                                value={form.rent_amount}
                                onChange={(e) => set('rent_amount', +e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Note</label>
                        <textarea
                            rows="3"
                            value={form.note}
                            onChange={(e) => set('note', e.target.value)}
                            placeholder="Add any additional details about this property..."
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
