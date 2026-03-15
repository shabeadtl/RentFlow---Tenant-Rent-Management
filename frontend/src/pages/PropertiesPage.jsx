import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchProperties, createProperty } from '../api';
import { useAuth } from '../components/AuthProvider';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const emptyForm = { address: '', total_units: 1, rent_amount: '', note: '' };

export default function PropertiesPage() {
    const [properties, setProperties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const { canManageProperties } = useAuth();
    const toast = useToast();
    const navigate = useNavigate();

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setProperties(await fetchProperties());
        } catch (e) {
            console.error(e);
            toast.error('Failed to load properties.');
        }
        finally { setLoading(false); }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const openNew = () => { setForm(emptyForm); setModalOpen(true); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        try {
            await createProperty(form);
            toast.success('Property added.');
            setModalOpen(false);
            setForm(emptyForm);
            load();
        } catch (err) {
            console.error(err);
            toast.error(err?.response?.data?.detail || 'Failed to save property.');
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
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Properties</h1>
                    <p className="text-[var(--color-text-muted)] text-sm mt-1">{properties.length} total</p>
                </div>
                {canManageProperties && (
                    <button
                        onClick={openNew}
                        className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors"
                    >
                        + Add Property
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)] text-xs uppercase tracking-wider">
                                <th className="px-5 py-3">Property name</th>
                                <th className="px-5 py-3">Units</th>
                                <th className="px-5 py-3">Rent (₹)</th>
                                <th className="px-5 py-3">Note</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                            {properties.map(p => (
                                <tr
                                    key={p.id}
                                    tabIndex={0}
                                    role="button"
                                    onClick={() => navigate(`/properties/${p.id}`)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter' || e.key === ' ') {
                                            e.preventDefault();
                                            navigate(`/properties/${p.id}`);
                                        }
                                    }}
                                    className="cursor-pointer transition-colors hover:bg-[var(--color-surface-light)]/40 focus:bg-[var(--color-surface-light)]/40 focus:outline-none"
                                >
                                    <td className="px-5 py-3 font-medium">{p.address}</td>
                                    <td className="px-5 py-3">{p.total_units}</td>
                                    <td className="px-5 py-3">₹{Number(p.rent_amount).toLocaleString()}</td>
                                    <td className="px-5 py-3 text-[var(--color-text-muted)] text-xs max-w-[200px] truncate">{p.note || '—'}</td>
                                </tr>
                            ))}
                            {properties.length === 0 && (
                                <tr><td colSpan={4} className="px-5 py-8 text-center text-[var(--color-text-muted)]">No properties yet. Add one above!</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {canManageProperties && (
                <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add Property">
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Property name</label>
                            <input
                                required value={form.address} onChange={e => set('address', e.target.value)}
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Total Units</label>
                                <input
                                    type="number" min="1" required value={form.total_units} onChange={e => set('total_units', +e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-[var(--color-text-muted)] mb-1">Rent Amount (₹)</label>
                                <input
                                    type="number" min="0" step="0.01" required value={form.rent_amount} onChange={e => set('rent_amount', +e.target.value)}
                                    className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs text-[var(--color-text-muted)] mb-1">Note</label>
                            <textarea
                                rows="3" value={form.note} onChange={e => set('note', e.target.value)}
                                placeholder="Add any additional details about this property..."
                                className="w-full px-3 py-2 bg-[var(--color-surface-dark)] border border-[var(--color-border)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-primary)] transition-colors resize-none"
                            />
                        </div>
                        <div className="flex justify-end gap-3 pt-2">
                            <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">Cancel</button>
                            <button type="submit" className="px-4 py-2 bg-[var(--color-primary)] hover:bg-[var(--color-primary-dark)] text-white text-sm font-medium rounded-lg transition-colors">Add Property</button>
                        </div>
                    </form>
                </Modal>
            )}
        </div>
    );
}
