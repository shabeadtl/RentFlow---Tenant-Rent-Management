import { useCallback, useEffect, useState } from 'react';
import { createUser, deleteUser, fetchUsers, updateUser } from '../api';
import Modal from '../components/Modal';
import { useToast } from '../components/Toast';

const emptyForm = {
    email: '',
    password: '',
    full_name: '',
    role: 'viewer',
};

export default function UsersPage() {
    const toast = useToast();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [modalOpen, setModalOpen] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [savingUserId, setSavingUserId] = useState('');
    const [creating, setCreating] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            setUsers(await fetchUsers());
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to load users.');
        } finally {
            setLoading(false);
        }
    }, [toast]);

    useEffect(() => { load(); }, [load]);

    const setRowValue = (userId, key, value) => {
        setUsers((current) => current.map((user) => (
            user.id === userId ? { ...user, [key]: value } : user
        )));
    };

    const handleCreate = async (event) => {
        event.preventDefault();
        setCreating(true);
        try {
            const created = await createUser(form);
            setUsers((current) => [...current, created].sort((a, b) => (a.email || '').localeCompare(b.email || '')));
            setModalOpen(false);
            setForm(emptyForm);
            toast.success('User created.');
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to create user.');
        } finally {
            setCreating(false);
        }
    };

    const handleSave = async (user) => {
        setSavingUserId(user.id);
        try {
            const updated = await updateUser(user.id, {
                full_name: user.full_name || null,
                role: user.role,
                is_active: user.is_active,
            });
            setUsers((current) => current.map((item) => (item.id === updated.id ? updated : item)));
            toast.success('User updated.');
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to update user.');
            load();
        } finally {
            setSavingUserId('');
        }
    };

    const handleDelete = async (user) => {
        const confirmed = await toast.confirm(`Delete ${user.email || 'this user'}?`, {
            title: 'Confirm deletion',
            confirmLabel: 'Delete',
        });
        if (!confirmed) return;

        setSavingUserId(user.id);
        try {
            await deleteUser(user.id);
            setUsers((current) => current.filter((item) => item.id !== user.id));
            toast.success('User deleted.');
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to delete user.');
        } finally {
            setSavingUserId('');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-[var(--color-primary)] border-t-transparent rounded-full animate-spin" />
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight">Users</h1>
                    <p className="mt-1 text-sm text-[var(--color-text-muted)]">Manage viewer and manager access for the workspace.</p>
                </div>
                <button
                    onClick={() => setModalOpen(true)}
                    className="rounded-xl bg-[var(--color-primary)] px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)]"
                >
                    + Add User
                </button>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]">
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">
                                <th className="px-5 py-3">Email</th>
                                <th className="px-5 py-3">Name</th>
                                <th className="px-5 py-3">Role</th>
                                <th className="px-5 py-3">Status</th>
                                <th className="px-5 py-3">Last Sign In</th>
                                <th className="px-5 py-3 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--color-border)]">
                            {users.map((user) => (
                                <tr key={user.id} className="align-top">
                                    <td className="px-5 py-4 font-medium">{user.email || 'No email'}</td>
                                    <td className="px-5 py-4">
                                        <input
                                            value={user.full_name || ''}
                                            onChange={(event) => setRowValue(user.id, 'full_name', event.target.value)}
                                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                    </td>
                                    <td className="px-5 py-4">
                                        <select
                                            value={user.role}
                                            onChange={(event) => setRowValue(user.id, 'role', event.target.value)}
                                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        >
                                            <option value="viewer">Viewer</option>
                                            <option value="manager">Manager</option>
                                            <option value="admin">Admin</option>
                                        </select>
                                    </td>
                                    <td className="px-5 py-4">
                                        <select
                                            value={user.is_active ? 'active' : 'inactive'}
                                            onChange={(event) => setRowValue(user.id, 'is_active', event.target.value === 'active')}
                                            className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        >
                                            <option value="active">Active</option>
                                            <option value="inactive">Inactive</option>
                                        </select>
                                    </td>
                                    <td className="px-5 py-4 text-[var(--color-text-muted)]">
                                        {user.last_sign_in_at || 'Never'}
                                    </td>
                                    <td className="px-5 py-4">
                                        <div className="flex justify-end gap-2">
                                            <button
                                                onClick={() => handleSave(user)}
                                                disabled={savingUserId === user.id}
                                                className="rounded-lg bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60"
                                            >
                                                Save
                                            </button>
                                            <button
                                                onClick={() => handleDelete(user)}
                                                disabled={savingUserId === user.id}
                                                className="rounded-lg border border-[var(--color-danger)]/25 bg-[var(--color-danger)]/10 px-3 py-2 text-xs font-semibold text-[var(--color-danger)] transition-colors hover:bg-[var(--color-danger)]/18 disabled:opacity-60"
                                            >
                                                Delete
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="px-5 py-10 text-center text-[var(--color-text-muted)]">
                                        No users found yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Add User">
                <form onSubmit={handleCreate} className="space-y-4">
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Full Name</label>
                        <input
                            value={form.full_name}
                            onChange={(event) => setForm((current) => ({ ...current, full_name: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Email</label>
                        <input
                            type="email"
                            required
                            value={form.email}
                            onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Password</label>
                        <input
                            type="password"
                            required
                            minLength={6}
                            value={form.password}
                            onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        />
                    </div>
                    <div>
                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Role</label>
                        <select
                            value={form.role}
                            onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}
                            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-3 py-2 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                        >
                            <option value="viewer">Viewer</option>
                            <option value="manager">Manager</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={() => setModalOpen(false)} className="px-4 py-2 text-sm text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]">Cancel</button>
                        <button type="submit" disabled={creating} className="rounded-lg bg-[var(--color-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-primary-dark)] disabled:opacity-60">
                            {creating ? 'Creating...' : 'Create User'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
}
