import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchTenants, fetchProperties, createTenant, uploadTenantDocuments } from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const emptyForm = { name: '', email: '', phone: '', property_id: '', unit_number: '', lease_start: '', lease_end: '', status: 'active', electric_meter_reading: '', rent_due_day: '1' };
const emptyDocumentFiles = { agreement: null, proof: null };
const acceptedDocumentTypes = '.pdf,.png,.jpg,.jpeg,.webp';

export default function TenantsPage() {
    const [tenants, setTenants] = useState([]);
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [documentFiles, setDocumentFiles] = useState(emptyDocumentFiles);
    const [filterProp, setFilterProp] = useState('');
    const { canManageProperties } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [t, p] = await Promise.all([fetchTenants(filterProp ? { property_id: filterProp } : {}), fetchProperties()]);
            setTenants(t);
            setProperties(p);
        } catch (e) {
            console.error(e);
            toast.error('Failed to load tenants.');
        }
        finally { setLoading(false); }
    }, [filterProp, toast]);

    useEffect(() => { load(); }, [load]);

    const propMap = Object.fromEntries(properties.map(p => [p.id, p.address]));

    const openNew = () => {
        setForm(emptyForm);
        setDocumentFiles(emptyDocumentFiles);
        setModalOpen(true);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const data = { ...form };
        if (!data.email) data.email = null;
        if (!data.phone) data.phone = null;
        if (!data.lease_start) data.lease_start = null;
        if (!data.lease_end) data.lease_end = null;
        if (!data.unit_number) data.unit_number = null;
        if (!data.electric_meter_reading) data.electric_meter_reading = null;
        data.rent_due_day = data.rent_due_day ? Number(data.rent_due_day) : 1;
        try {
            const createdTenant = await createTenant(data);
            if (documentFiles.agreement || documentFiles.proof) {
                const uploadFormData = new FormData();
                if (documentFiles.agreement) uploadFormData.append('agreement', documentFiles.agreement);
                if (documentFiles.proof) uploadFormData.append('proof', documentFiles.proof);
                try {
                    await uploadTenantDocuments(createdTenant.id, uploadFormData);
                    toast.success('Tenant added with documents.');
                } catch (uploadError) {
                    console.error(uploadError);
                    toast.info('Tenant added, but document upload failed. You can attach them from the tenant detail page.');
                }
            } else {
                toast.success('Tenant added.');
            }
            setModalOpen(false);
            setForm(emptyForm);
            setDocumentFiles(emptyDocumentFiles);
            load();
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to save tenant.');
        }
    };

    const set = (key, val) => setForm(f => ({ ...f, [key]: val }));
    const setDocumentFile = (key, file) => setDocumentFiles((current) => ({ ...current, [key]: file || null }));

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Tenants</h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">{tenants.length} total</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={filterProp} onChange={e => setFilterProp(e.target.value)}
                        className="px-3 py-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                    >
                        <option value="">All Properties</option>
                        {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                    </select>
                    {canManageProperties && (
                        <button
                            onClick={openNew}
                            className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors"
                        >
                            + Add Tenant
                        </button>
                    )}
                </div>
            </div>

            {/* Cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 stagger">
                {tenants.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => navigate(`/tenants/${t.id}`)}
                        className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5 hover:border-[var(--color-primary)]/30 transition-all duration-300 group text-left cursor-pointer"
                    >
                        <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-sm font-bold">
                                    {t.name.charAt(0).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-semibold">{t.name}</p>
                                    <p className="text-xs text-[var(--color-text-muted)]">{propMap[t.property_id] || 'Unknown'}</p>
                                </div>
                            </div>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${t.status === 'active'
                                    ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                                    : 'bg-[var(--color-text-muted)]/15 text-[var(--color-text-muted)]'
                                }`}>
                                {t.status}
                            </span>
                        </div>
                        <div className="space-y-1 text-xs text-[var(--color-text-muted)] mb-4">
                            {t.email && <p>📧 {t.email}</p>}
                            {t.phone && <p>📞 {t.phone}</p>}
                            {t.lease_start && <p>📅 {t.lease_start} → {t.lease_end || 'ongoing'}</p>}
                        </div>
                        <div className="flex justify-end">
                            <span className="text-xs text-[var(--color-primary-light)] group-hover:underline">View details</span>
                        </div>
                    </button>
                ))}
                {tenants.length === 0 && (
                    <div className="col-span-full text-center py-12 text-[var(--color-text-muted)]">
                        No tenants found. Add one above!
                    </div>
                )}
            </div>

            {/* Modal */}
            {canManageProperties && (
                <Modal open={modalOpen} onClose={() => { setModalOpen(false); setDocumentFiles(emptyDocumentFiles); }} title="Add Tenant" maxWidth="max-w-3xl">
                    <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Full Name *</label>
                        <input required value={form.name} onChange={e => set('name', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Email</label>
                            <input type="email" value={form.email} onChange={e => set('email', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Phone</label>
                            <input value={form.phone} onChange={e => set('phone', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Property *</label>
                            <select required value={form.property_id} onChange={e => set('property_id', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                                <option value="">Select…</option>
                                {properties.map(p => <option key={p.id} value={p.id}>{p.address}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Unit #</label>
                            <input value={form.unit_number} onChange={e => set('unit_number', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Lease Start</label>
                            <input type="date" value={form.lease_start} onChange={e => set('lease_start', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Lease End</label>
                            <input type="date" value={form.lease_end} onChange={e => set('lease_end', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs text-[var(--color-text-muted)] mb-1">Status</label>
                        <select value={form.status} onChange={e => set('status', e.target.value)}
                            className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                            <option value="active">Active</option>
                            <option value="past">Past</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Electric Meter Reading</label>
                            <input value={form.electric_meter_reading} onChange={e => set('electric_meter_reading', e.target.value)}
                                placeholder="e.g. 12345"
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors" />
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Rent Due Day</label>
                            <select value={form.rent_due_day} onChange={e => set('rent_due_day', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors">
                                {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                                    <option key={d} value={d}>{d}{d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th'} of every month</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    <div className="border-t border-[var(--color-border)] pt-4">
                        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-[var(--color-primary-light)]">Documents</p>
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div>
                                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Agreement</label>
                                <input
                                    type="file"
                                    accept={acceptedDocumentTypes}
                                    onChange={e => setDocumentFile('agreement', e.target.files?.[0] || null)}
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)]/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-primary-light)]"
                                />
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {documentFiles.agreement ? documentFiles.agreement.name : 'PDF or image up to 10 MB'}
                                </p>
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Proof Document</label>
                                <input
                                    type="file"
                                    accept={acceptedDocumentTypes}
                                    onChange={e => setDocumentFile('proof', e.target.files?.[0] || null)}
                                    className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm file:mr-3 file:rounded-md file:border-0 file:bg-[var(--color-primary)]/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[var(--color-primary-light)]"
                                />
                                <p className="mt-1 text-xs text-[var(--color-text-muted)]">
                                    {documentFiles.proof ? documentFiles.proof.name : 'ID proof or supporting document'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => { setModalOpen(false); setDocumentFiles(emptyDocumentFiles); }} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Cancel</button>
                        <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors">Add Tenant</button>
                    </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
