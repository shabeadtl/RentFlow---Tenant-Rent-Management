import { NavLink } from 'react-router-dom';
import logo from '../assets/logo.png';
import { useAuth } from './AuthProvider';

const baseLinks = [
    { to: '/', label: 'Dashboard', icon: '📊' },
    { to: '/properties', label: 'Properties', icon: '🏢' },
    { to: '/tenants', label: 'Tenants', icon: '👥' },
    { to: '/payments', label: 'Payments', icon: '💳' },
    { to: '/reports', label: 'Reports', icon: '📋' },
];

export default function Sidebar({ open, onClose }) {
    const { canManageUsers } = useAuth();
    const links = canManageUsers
        ? [...baseLinks, { to: '/users', label: 'Users', icon: '🛡' }]
        : baseLinks;

    return (
        <>
            {/* Mobile overlay */}
            {open && (
                <div
                    className="fixed inset-0 bg-black/50 z-30 md:hidden"
                    onClick={onClose}
                />
            )}

            <aside
                className={`
          fixed top-0 left-0 z-40 h-screen
          w-[var(--sidebar-width)] bg-[var(--color-surface)]
          border-r border-[var(--color-border)]
          flex flex-col transition-transform duration-300
          ${open ? 'translate-x-0' : '-translate-x-full'}
          md:translate-x-0 md:static md:z-auto md:h-screen md:sticky md:top-0
        `}
            >
                {/* Logo */}
                <div className="flex items-center gap-3 px-6 py-5 border-b border-[var(--color-border)]">
                    <img src={logo} alt="RentFlow Logo" className="w-9 h-9 rounded-lg object-cover" />
                    <span className="text-lg font-semibold tracking-tight">RentFlow</span>
                </div>

                {/* Nav links */}
                <nav className="flex-1 py-4 px-3 space-y-1">
                    {links.map(({ to, label, icon }) => (
                        <NavLink
                            key={to}
                            to={to}
                            end={to === '/'}
                            onClick={onClose}
                            className={({ isActive }) =>
                                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-[var(--transition-base)]
                ${isActive
                                    ? 'bg-[var(--color-primary)]/15 text-[var(--color-primary-light)] shadow-sm'
                                    : 'text-[var(--color-text-muted)] hover:bg-[var(--color-surface-light)] hover:text-[var(--color-text)]'
                                }`
                            }
                        >
                            <span className="text-lg">{icon}</span>
                            {label}
                        </NavLink>
                    ))}
                </nav>

                {/* Footer */}
                <div className="px-6 py-4 text-xs text-[var(--color-text-muted)] border-t border-[var(--color-border)]">
                    © 2026 RentFlow--v1
                </div>
            </aside>
        </>
    );
}
