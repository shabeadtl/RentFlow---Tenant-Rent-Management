import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { deleteTenant, deleteTenantDocument, fetchProperties, fetchTenant, updateTenant, uploadTenantDocuments } from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';
import { exportDetailsToPdf } from '../utils/exportPdf';

const emptyDocumentFiles = { agreement: null, proof: null };
const acceptedDocumentTypes = '.pdf,.png,.jpg,.jpeg,.webp';

function tenantToForm(tenant) {
    return {
        name: tenant.name,
        email: tenant.email || '',
        phone: tenant.phone || '',
        property_id: tenant.property_id,
        unit_number: tenant.unit_number || '',
        lease_start: tenant.lease_start || '',
        lease_end: tenant.lease_end || '',
        status: tenant.status,
        electric_meter_reading: tenant.electric_meter_reading || '',
        final_meter_reading: tenant.final_meter_reading || '',
        vacating_date: tenant.vacating_date || '',
        outstanding_dues: tenant.outstanding_dues != null ? String(tenant.outstanding_dues) : '',
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

function DocumentCard({ label, fileName, fileUrl, canManage, onRemove }) {
    return (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">{label}</p>
            {fileUrl ? (
                <div className="space-y-3">
                    <p className="text-sm font-medium text-[var(--color-text)]">{fileName || 'Attached document'}</p>
                    <div className="flex flex-wrap items-center gap-3">
                        <a
                            href={fileUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--color-primary-light)] hover:underline"
                        >
                            Open document
                        </a>
                        {canManage && (
                            <button
                                type="button"
                                onClick={onRemove}
                                className="rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/16"
                            >
                                Remove
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <p className="text-sm text-[var(--color-text-muted)]">No document attached yet.</p>
            )}
        </div>
    );
}

export default function TenantDetailPage() {
    const { tenantId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();
    const { canManageProperties } = useAuth();
    const [tenant, setTenant] = useState(null);
    const [properties, setProperties] = useState([]);
    const [form, setForm] = useState(null);
    const [documentFiles, setDocumentFiles] = useState(emptyDocumentFiles);
    const [modalOpen, setModalOpen] = useState(false);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [tenantData, propertiesData] = await Promise.all([
                fetchTenant(tenantId),
                fetchProperties(),
            ]);
            setTenant(tenantData);
            setProperties(propertiesData);
            setForm(tenantToForm(tenantData));
            setDocumentFiles(emptyDocumentFiles);
        } catch (err) {
            console.error(err);
            setTenant(null);
            toast.error('Failed to load tenant details.');
        } finally {
            setLoading(false);
        }
    }, [tenantId, toast]);

    useEffect(() => { load(); }, [load]);

    const propertyMap = useMemo(
        () => Object.fromEntries(properties.map((property) => [property.id, property])),
        [properties]
    );
    const property = tenant ? propertyMap[tenant.property_id] : null;

    const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));
    const handleExport = async () => {
        try {
            await exportDetailsToPdf({
                title: `Tenant Profile - ${tenant.name}`,
                subtitle: property?.address || 'Linked property unavailable',
                sections: [
                    {
                        title: 'Contact',
                        fields: [
                            { label: 'Email', value: tenant.email || 'Not provided' },
                            { label: 'Phone', value: tenant.phone || 'Not provided' },
                            { label: 'Status', value: tenant.status },
                        ],
                    },
                    {
                        title: 'Lease',
                        fields: [
                            { label: 'Unit', value: tenant.unit_number || 'Not assigned' },
                            { label: 'Lease Start', value: tenant.lease_start || 'Not set' },
                            { label: 'Lease End', value: tenant.lease_end || 'Ongoing' },
                        ],
                    },
                    {
                        title: 'Property',
                        fields: [
                            { label: 'Property Name', value: property?.address || 'Unknown property' },
                            { label: 'Monthly Rent', value: `Rs ${Number(property?.rent_amount || 0).toLocaleString()}` },
                            { label: 'Property Note', value: property?.note || 'No property note added' },
                        ],
                    },
                    {
                        title: 'Documents',
                        fields: [
                            { label: 'Agreement', value: tenant.agreement_file_name || 'Not attached' },
                            { label: 'Proof', value: tenant.proof_file_name || 'Not attached' },
                        ],
                    },
                ],
            });
            toast.success('Tenant PDF exported.');
        } catch (err) {
            console.error(err);
            toast.error('Failed to export tenant PDF.');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = { ...form };
        if (!data.email) data.email = null;
        if (!data.phone) data.phone = null;
        if (!data.unit_number) data.unit_number = null;
        if (!data.lease_start) data.lease_start = null;
        if (!data.lease_end) data.lease_end = null;
        if (!data.electric_meter_reading) data.electric_meter_reading = null;
        if (!data.final_meter_reading) data.final_meter_reading = null;
        if (!data.vacating_date) data.vacating_date = null;
        data.outstanding_dues = data.outstanding_dues ? Number(data.outstanding_dues) : null;
        try {
            let updated = await updateTenant(tenantId, data);
            let documentUploadFailed = false;
            if (documentFiles.agreement || documentFiles.proof) {
                const uploadFormData = new FormData();
                if (documentFiles.agreement) uploadFormData.append('agreement', documentFiles.agreement);
                if (documentFiles.proof) uploadFormData.append('proof', documentFiles.proof);
                try {
                    updated = await uploadTenantDocuments(tenantId, uploadFormData);
                } catch (uploadError) {
                    console.error(uploadError);
                    documentUploadFailed = true;
                }
            }
            setTenant(updated);
            setForm(tenantToForm(updated));
            setDocumentFiles(emptyDocumentFiles);
            setModalOpen(false);
            if (documentUploadFailed) {
                toast.info('Tenant updated, but document upload failed.');
            } else {
                toast.success(documentFiles.agreement || documentFiles.proof ? 'Tenant and documents updated.' : 'Tenant updated.');
            }
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to update tenant.');
        }
    };

    const handleDelete = async () => {
        const confirmed = await toast.confirm('Delete this tenant?', {
            title: 'Confirm deletion',
            confirmLabel: 'Delete',
        });
        if (!confirmed) return;
        try {
            await deleteTenant(tenantId);
            toast.success('Tenant deleted.');
            navigate('/tenants');
        } catch (err) {
            console.error(err);
            toast.error('Failed to delete tenant.');
        }
    };

    const setDocumentFile = (key, file) => setDocumentFiles((current) => ({ ...current, [key]: file || null }));

    const handleDocumentDelete = async (documentKind) => {
        const confirmed = await toast.confirm(`Remove the ${documentKind} document from this tenant?`, {
            title: 'Remove document',
            confirmLabel: 'Remove',
        });
        if (!confirmed) return;

        try {
            const updated = await deleteTenantDocument(tenantId, documentKind);
            setTenant(updated);
            setForm(tenantToForm(updated));
            toast.success('Document removed.');
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to remove document.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
            </div>
        );
    }

    if (!tenant || !form) {
        return (
            <div className="space-y-6 animate-fade-in-up">
                <Link to="/tenants" className="inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                    ← Back to tenants
                </Link>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6">
                    <h1 className="text-xl font-semibold">Tenant not found</h1>
                    <p className="mt-2 text-sm text-[var(--color-text-muted)]">The tenant details could not be loaded.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="relative isolate space-y-6 animate-fade-in-up">
            <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 bg-[radial-gradient(circle_at_top_left,rgba(129,140,248,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(34,211,238,0.12),transparent_36%)]" />

            <div className="overflow-hidden rounded-[32px] border border-white/8 bg-[linear-gradient(135deg,rgba(30,41,59,.92),rgba(15,23,42,.98))] shadow-[0_24px_80px_rgba(2,6,23,.34)]">
                <div className="flex flex-col gap-6 px-6 py-6 lg:px-8 lg:py-8">
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                            <Link to="/tenants" className="mb-4 inline-flex text-sm text-[var(--color-primary-light)] hover:underline">
                                ← Back to tenants
                            </Link>
                            <div className="flex items-start gap-4">
                                <div className="relative flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--color-primary-light)] via-[var(--color-primary)] to-[var(--color-accent)] text-2xl font-bold shadow-[0_14px_35px_rgba(99,102,241,.35)]">
                                    {tenant.name.charAt(0).toUpperCase()}
                                    <div className="absolute inset-0 rounded-2xl ring-1 ring-white/15" />
                                </div>
                                <div className="min-w-0">
                                    <div className="mb-2 flex flex-wrap items-center gap-2">
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${tenant.status === 'active'
                                            ? 'bg-[var(--color-success)]/14 text-[var(--color-success)]'
                                            : 'bg-white/8 text-[var(--color-text-muted)]'
                                            }`}>
                                            {tenant.status}
                                        </span>
                                        <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                            {property?.address || 'Unknown property'}
                                        </span>
                                    </div>
                                    <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{tenant.name}</h1>
                                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-text-muted)]">
                                        A focused view of this tenant, lease terms, and linked property details so updates and decisions can happen from one place.
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
                                    onClick={() => { setDocumentFiles(emptyDocumentFiles); setModalOpen(true); }}
                                    className="rounded-xl bg-[var(--color-primary)] px-5 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_rgba(99,102,241,.28)] transition-all hover:-translate-y-0.5 hover:bg-[var(--color-primary-dark)]"
                                >
                                    Edit Tenant
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
                        <DetailStat label="Monthly Rent" value={`₹${Number(property?.rent_amount || 0).toLocaleString()}`} tone="accent" />
                        <DetailStat label="Unit" value={tenant.unit_number || 'Not assigned'} />
                        <DetailStat label="Lease End" value={tenant.lease_end || 'Ongoing'} />
                        <DetailStat label="Contact" value={tenant.phone || tenant.email || 'Not provided'} tone="success" />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.25fr_.95fr]">
                <DetailBlock eyebrow="Tenant Profile" title="Contact and Lease" accent="rgba(129,140,248,.75)">
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Email</p>
                            <p className="text-lg font-medium">{tenant.email || 'Not provided'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Phone</p>
                            <p className="text-lg font-medium">{tenant.phone || 'Not provided'}</p>
                        </div>
                    </div>

                    <div className="mt-5 rounded-[26px] border border-white/8 bg-[linear-gradient(180deg,rgba(15,23,42,.86),rgba(15,23,42,.56))] p-5">
                        <div className="mb-4 flex items-center justify-between gap-3">
                            <div>
                                <p className="mb-1 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Lease Timeline</p>
                                <h3 className="text-xl font-semibold tracking-tight">Current term</h3>
                            </div>
                            <span className="rounded-full border border-white/8 bg-white/4 px-3 py-1 text-xs text-[var(--color-text-muted)]">
                                {tenant.lease_start && tenant.lease_end ? 'Fixed lease' : 'Flexible'}
                            </span>
                        </div>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Unit</p>
                                <p className="text-lg font-medium">{tenant.unit_number || 'Not assigned'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Lease Start</p>
                                <p className="text-lg font-medium">{tenant.lease_start || 'Not set'}</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-text-muted)]">Lease End</p>
                                <p className="text-lg font-medium">{tenant.lease_end || 'Ongoing'}</p>
                            </div>
                        </div>
                    </div>
                </DetailBlock>

                <DetailBlock eyebrow="Linked Asset" title="Property Snapshot" accent="rgba(34,211,238,.75)">
                    <div className="space-y-4">
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Property Name</p>
                            <p className="text-2xl font-semibold tracking-tight">{property?.address || 'Unknown property'}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-[linear-gradient(135deg,rgba(16,185,129,.18),rgba(15,23,42,.15))] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Monthly Rent</p>
                            <p className="text-3xl font-semibold tracking-tight">₹{Number(property?.rent_amount || 0).toLocaleString()}</p>
                        </div>
                        <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Property Note</p>
                            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
                                {property?.note || 'No property note has been added for this property yet.'}
                            </p>
                        </div>
                    </div>
                </DetailBlock>
            </div>

            {/* Vacating / Meter Info Section */}
            <DetailBlock eyebrow="Utility & Vacating" title="Meter Readings & Vacating Info" accent="rgba(245,158,11,.75)">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                        <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Initial Meter Reading</p>
                        <p className="text-lg font-medium">{tenant.electric_meter_reading || 'Not recorded'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                        <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Final Meter Reading</p>
                        <p className="text-lg font-medium">{tenant.final_meter_reading || 'Not recorded'}</p>
                    </div>
                    {tenant.electric_meter_reading && tenant.final_meter_reading && (
                        <div className="rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-5">
                            <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Electricity Consumption</p>
                            <p className="text-2xl font-bold text-[var(--color-warning)]">
                                {(Number(tenant.final_meter_reading) - Number(tenant.electric_meter_reading)).toLocaleString()} units
                            </p>
                        </div>
                    )}
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                        <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Vacating Date</p>
                        <p className="text-lg font-medium">{tenant.vacating_date || 'Not set'}</p>
                    </div>
                    <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                        <p className="mb-3 text-[11px] uppercase tracking-[0.24em] text-[var(--color-text-muted)]">Outstanding Dues</p>
                        <p className={`text-lg font-medium ${tenant.outstanding_dues > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]'}`}>
                            {tenant.outstanding_dues != null ? `₹${Number(tenant.outstanding_dues).toLocaleString()}` : 'None recorded'}
                        </p>
                    </div>
                </div>
            </DetailBlock>

            <DetailBlock eyebrow="Tenant Documents" title="Agreement & Proof" accent="rgba(34,197,94,.75)">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    <DocumentCard
                        label="Agreement"
                        fileName={tenant.agreement_file_name}
                        fileUrl={tenant.agreement_file_url}
                        canManage={canManageProperties}
                        onRemove={() => handleDocumentDelete('agreement')}
                    />
                    <DocumentCard
                        label="Proof Document"
                        fileName={tenant.proof_file_name}
                        fileUrl={tenant.proof_file_url}
                        canManage={canManageProperties}
                        onRemove={() => handleDocumentDelete('proof')}
                    />
                </div>
            </DetailBlock>

            {canManageProperties && (
                <Modal open={modalOpen} onClose={() => { setModalOpen(false); setDocumentFiles(emptyDocumentFiles); }} title="Edit Tenant" maxWidth="max-w-3xl">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Full Name *</label>
                        <input required value={form.name} onChange={(e) => set('name', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Email</label>
                            <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Phone</label>
                            <input value={form.phone} onChange={(e) => set('phone', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Property *</label>
                            <select required value={form.property_id} onChange={(e) => set('property_id', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none">
                                <option value="">Select…</option>
                                {properties.map((p) => <option key={p.id} value={p.id}>{p.address}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Unit #</label>
                            <input value={form.unit_number} onChange={(e) => set('unit_number', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Lease Start</label>
                            <input type="date" value={form.lease_start} onChange={(e) => set('lease_start', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                        <div>
                            <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Lease End</label>
                            <input type="date" value={form.lease_end} onChange={(e) => set('lease_end', e.target.value)}
                                className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                        </div>
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Status</label>
                        <select value={form.status} onChange={(e) => set('status', e.target.value)}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none">
                            <option value="active">Active</option>
                            <option value="past">Past</option>
                        </select>
                    </div>

                    {/* Vacating Section - shown with a divider */}
                    <div className="border-t border-[var(--color-border)] pt-4 mt-2">
                        <p className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-3">⚡ Meter & Vacating</p>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Initial Meter Reading</label>
                                <input value={form.electric_meter_reading} onChange={(e) => set('electric_meter_reading', e.target.value)}
                                    placeholder="e.g. 12345"
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Final Meter Reading</label>
                                <input value={form.final_meter_reading} onChange={(e) => set('final_meter_reading', e.target.value)}
                                    placeholder="e.g. 12890"
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                            </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Vacating Date</label>
                                <input type="date" value={form.vacating_date} onChange={(e) => set('vacating_date', e.target.value)}
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Outstanding Dues (₹)</label>
                                <input type="number" min="0" step="0.01" value={form.outstanding_dues} onChange={(e) => set('outstanding_dues', e.target.value)}
                                    placeholder="0.00"
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm transition-colors focus:border-[var(--color-primary)] focus:outline-none" />
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-[var(--color-border)] pt-4 mt-2">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-light)]">Documents</p>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Agreement</label>
                                {tenant.agreement_file_url && (
                                    <a
                                        href={tenant.agreement_file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mb-2 inline-flex text-xs font-semibold text-[var(--color-primary-light)] hover:underline"
                                    >
                                        Current: {tenant.agreement_file_name || 'Open agreement'}
                                    </a>
                                )}
                                <input
                                    type="file"
                                    accept={acceptedDocumentTypes}
                                    onChange={(e) => setDocumentFile('agreement', e.target.files?.[0] || null)}
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)]/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-primary-light)]"
                                />
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {documentFiles.agreement ? documentFiles.agreement.name : 'Attach or replace agreement'}
                                </p>
                            </div>
                            <div>
                                <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Proof Document</label>
                                {tenant.proof_file_url && (
                                    <a
                                        href={tenant.proof_file_url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="mb-2 inline-flex text-xs font-semibold text-[var(--color-primary-light)] hover:underline"
                                    >
                                        Current: {tenant.proof_file_name || 'Open proof'}
                                    </a>
                                )}
                                <input
                                    type="file"
                                    accept={acceptedDocumentTypes}
                                    onChange={(e) => setDocumentFile('proof', e.target.files?.[0] || null)}
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)]/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-primary-light)]"
                                />
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {documentFiles.proof ? documentFiles.proof.name : 'Attach or replace proof document'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => { setModalOpen(false); setDocumentFiles(emptyDocumentFiles); }} className="px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]">Cancel</button>
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
