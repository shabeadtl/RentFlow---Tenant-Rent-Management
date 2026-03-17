import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';
import Sidebar from './Sidebar';

export default function DashboardLayout() {
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const { logout, user } = useAuth();
    const initials = (user?.full_name || user?.email || 'U').trim().charAt(0).toUpperCase();

    return (
        <div className="flex min-h-screen">
            <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

            <div className="flex-1 flex flex-col min-w-0">
                {/* Top bar */}
                <header className="sticky top-0 z-20 bg-[var(--color-surface-dark)]/80 backdrop-blur-md border-b border-[var(--color-border)] px-4 md:px-8 py-3 flex items-center justify-between">
                    <button
                        className="md:hidden text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors p-1"
                        onClick={() => setSidebarOpen(true)}
                        aria-label="Open menu"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                    </button>
                    <h1 className="text-sm font-medium text-[var(--color-text-muted)] hidden md:block">
                        Tenant Rent Management
                    </h1>
                    <div className="flex items-center gap-3">
                        <div className="hidden text-right md:block">
                            <p className="text-sm font-medium">{user?.full_name || user?.email || 'Signed in user'}</p>
                            <p className="text-xs uppercase tracking-[0.18em] text-[var(--color-text-muted)]">{user?.role || 'viewer'}</p>
                        </div>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[var(--color-primary)] to-[var(--color-accent)] flex items-center justify-center text-xs font-bold">
                            {initials}
                        </div>
                        <button
                            onClick={logout}
                            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-text-muted)] transition-colors hover:text-[var(--color-text)]"
                        >
                            Logout
                        </button>
                    </div>
                </header>

                <main className="flex-1 p-4 md:p-8 overflow-y-auto">
                    <Outlet />
                </main>
            </div>
        </div>
    );
}
