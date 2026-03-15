import { BrowserRouter, Navigate, Outlet, Route, Routes } from 'react-router-dom';
import DashboardLayout from './components/DashboardLayout';
import { useAuth } from './components/AuthProvider';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import PaymentDetailPage from './pages/PaymentDetailPage';
import PaymentsPage from './pages/PaymentsPage';
import PendingRentPage from './pages/PendingRentPage';
import PropertiesPage from './pages/PropertiesPage';
import PropertyDetailPage from './pages/PropertyDetailPage';
import ReportsPage from './pages/ReportsPage';
import TenantDetailPage from './pages/TenantDetailPage';
import TenantsPage from './pages/TenantsPage';
import UsersPage from './pages/UsersPage';

function FullscreenSpinner() {
    return (
        <div className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
            <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--color-primary)] border-t-transparent" />
        </div>
    );
}

function ProtectedAppLayout() {
    const { isAuthenticated, loading } = useAuth();

    if (loading) {
        return <FullscreenSpinner />;
    }

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    return <DashboardLayout />;
}

function RequireAdmin({ children }) {
    const { canManageUsers, loading } = useAuth();

    if (loading) {
        return <FullscreenSpinner />;
    }

    if (!canManageUsers) {
        return <Navigate to="/" replace />;
    }

    return children;
}

export default function App() {
    return (
        <BrowserRouter>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route element={<ProtectedAppLayout />}>
                    <Route path="/" element={<DashboardPage />} />
                    <Route path="/properties" element={<PropertiesPage />} />
                    <Route path="/properties/:propertyId" element={<PropertyDetailPage />} />
                    <Route path="/tenants" element={<TenantsPage />} />
                    <Route path="/tenants/:tenantId" element={<TenantDetailPage />} />
                    <Route path="/payments" element={<PaymentsPage />} />
                    <Route path="/payments/:paymentId" element={<PaymentDetailPage />} />
                    <Route path="/pending-rent" element={<PendingRentPage />} />
                    <Route path="/reports" element={<ReportsPage />} />
                    <Route
                        path="/users"
                        element={(
                            <RequireAdmin>
                                <UsersPage />
                            </RequireAdmin>
                        )}
                    />
                </Route>
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
        </BrowserRouter>
    );
}
