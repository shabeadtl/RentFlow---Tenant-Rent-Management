import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthProvider';
import { useToast } from '../components/Toast';

const emptyLoginForm = {
    email: '',
    password: '',
};

const emptyBootstrapForm = {
    full_name: '',
    email: '',
    password: '',
};

export default function LoginPage() {
    const navigate = useNavigate();
    const toast = useToast();
    const { bootstrapAdmin, isAuthenticated, loading, login, setup } = useAuth();
    const [loginForm, setLoginForm] = useState(emptyLoginForm);
    const [bootstrapForm, setBootstrapForm] = useState(emptyBootstrapForm);
    const [showPassword, setShowPassword] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    if (!loading && isAuthenticated) {
        return <Navigate to="/" replace />;
    }

    const handleLogin = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            await login(loginForm);
            toast.success('Signed in successfully.');
            // State-driven <Navigate /> at the top of the component will handle the redirect
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to sign in.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBootstrap = async (event) => {
        event.preventDefault();
        setSubmitting(true);
        try {
            await bootstrapAdmin(bootstrapForm);
            toast.success('Admin account created.');
            // State-driven <Navigate /> at the top of the component will handle the redirect
        } catch (error) {
            console.error(error);
            toast.error(error?.response?.data?.detail || 'Failed to create admin account.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="relative min-h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_36%),radial-gradient(circle_at_bottom_right,rgba(129,140,248,0.18),transparent_34%)]" />
            <div className="relative mx-auto flex min-h-screen max-w-6xl items-center px-4 py-10 md:px-8">
                <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_.95fr]">
                    <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(135deg,rgba(15,23,42,.96),rgba(30,41,59,.92))] p-8 shadow-[0_24px_80px_rgba(2,6,23,.38)]">
                        <p className="mb-3 text-sm uppercase tracking-[0.28em] text-[var(--color-primary-light)]">RentFlow</p>
                        <h1 className="max-w-xl text-4xl font-bold tracking-tight sm:text-5xl">
                            Secure rent operations for admins and managers.
                        </h1>
                        <p className="mt-4 max-w-xl text-sm leading-7 text-[var(--color-text-muted)]">
                            Admins manage user access. Managers handle property, tenant, and payment operations.
                            Everything else stays viewable inside one protected workspace.
                        </p>

                        <div className="mt-8 grid gap-4 sm:grid-cols-3">
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Admin</p>
                                <p className="text-sm font-medium">Creates user accounts and assigns manager access</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Manager</p>
                                <p className="text-sm font-medium">Can add and manage properties and tenants</p>
                            </div>
                            <div className="rounded-2xl border border-white/8 bg-white/[0.03] p-4">
                                <p className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-text-muted)]">Access</p>
                                <p className="text-sm font-medium">No self-registration. Users can only sign in with admin-created accounts</p>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[32px] border border-white/8 bg-[linear-gradient(180deg,rgba(30,41,59,.96),rgba(15,23,42,.98))] p-8 shadow-[0_24px_80px_rgba(2,6,23,.32)]">
                        {loading ? (
                            <div className="flex min-h-[420px] items-center justify-center">
                                <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
                            </div>
                        ) : setup.needs_bootstrap ? (
                            <div>
                                <p className="mb-2 text-sm uppercase tracking-[0.24em] text-[var(--color-warning)]">Initial Setup</p>
                                <h2 className="text-3xl font-semibold tracking-tight">Create the first admin</h2>
                                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                                    This workspace does not have an admin yet. Create the first admin account to unlock user management. After setup, all other users must be created by an admin.
                                </p>

                                {!setup.has_service_role && (
                                    <div className="mt-5 rounded-2xl border border-[var(--color-warning)]/25 bg-[var(--color-warning)]/10 p-4 text-sm text-[var(--color-text)]">
                                        Add `SUPABASE_SERVICE_ROLE_KEY` in the backend environment before bootstrapping the first admin.
                                    </div>
                                )}

                                <form onSubmit={handleBootstrap} className="mt-6 space-y-4">
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Full Name</label>
                                        <input
                                            required
                                            value={bootstrapForm.full_name}
                                            onChange={(event) => setBootstrapForm((current) => ({ ...current, full_name: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Email</label>
                                        <input
                                            type="email"
                                            required
                                            value={bootstrapForm.email}
                                            onChange={(event) => setBootstrapForm((current) => ({ ...current, email: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                required
                                                minLength={6}
                                                value={bootstrapForm.password}
                                                onChange={(event) => setBootstrapForm((current) => ({ ...current, password: event.target.value }))}
                                                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3 pr-10 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)] hover:text-white"
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submitting || !setup.has_service_role}
                                        className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submitting ? 'Creating admin...' : 'Create Admin Account'}
                                    </button>
                                </form>
                            </div>
                        ) : (
                            <div>
                                <p className="mb-2 text-sm uppercase tracking-[0.24em] text-[var(--color-primary-light)]">Welcome Back</p>
                                <h2 className="text-3xl font-semibold tracking-tight">Sign in to RentFlow</h2>
                                <p className="mt-3 text-sm leading-6 text-[var(--color-text-muted)]">
                                    Use your admin-created account to access the rent management workspace. If you do not have an account yet, contact the admin.
                                </p>

                                <form onSubmit={handleLogin} className="mt-6 space-y-4">
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Email</label>
                                        <input
                                            type="email"
                                            required
                                            value={loginForm.email}
                                            onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
                                            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-1 block text-xs text-[var(--color-text-muted)]">Password</label>
                                        <div className="relative">
                                            <input
                                                type={showPassword ? "text" : "password"}
                                                required
                                                minLength={6}
                                                value={loginForm.password}
                                                onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
                                                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface-dark)] px-4 py-3 pr-10 text-sm focus:border-[var(--color-primary)] focus:outline-none"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPassword(!showPassword)}
                                                className="absolute inset-y-0 right-0 flex items-center pr-3 text-[var(--color-text-muted)] hover:text-white"
                                            >
                                                {showPassword ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" x2="22" y1="2" y2="22"/></svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                    <button
                                        type="submit"
                                        disabled={submitting}
                                        className="w-full rounded-xl bg-[var(--color-primary)] px-4 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[var(--color-primary-dark)] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                        {submitting ? 'Signing in...' : 'Sign In'}
                                    </button>
                                </form>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
