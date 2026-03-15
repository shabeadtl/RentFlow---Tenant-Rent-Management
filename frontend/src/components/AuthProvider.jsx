/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
    bootstrapAdmin as bootstrapAdminRequest,
    fetchAuthSetup,
    fetchMe,
    getStoredAuthSession,
    login as loginRequest,
    refreshAuthSession,
    setStoredAuthSession,
} from '../api';

const AuthContext = createContext(null);

export function useAuth() {
    return useContext(AuthContext);
}

export function AuthProvider({ children }) {
    const [session, setSession] = useState(() => getStoredAuthSession());
    const [loading, setLoading] = useState(true);
    const [setup, setSetup] = useState({
        needs_bootstrap: false,
        has_service_role: false,
    });

    const persistSession = useCallback((nextSession) => {
        setSession(nextSession);
        setStoredAuthSession(nextSession);
    }, []);

    const clearSession = useCallback(() => {
        setSession(null);
        setStoredAuthSession(null);
    }, []);

    const refresh = useCallback(async (refreshTokenOverride) => {
        const refreshToken = refreshTokenOverride || session?.refresh_token;
        if (!refreshToken) {
            clearSession();
            return null;
        }
        const refreshed = await refreshAuthSession(refreshToken);
        persistSession(refreshed);
        return refreshed;
    }, [clearSession, persistSession, session?.refresh_token]);

    const hydrateSession = useCallback(async () => {
        const stored = getStoredAuthSession();
        if (!stored?.access_token) {
            clearSession();
            return;
        }

        try {
            const user = await fetchMe();
            persistSession({ ...stored, user });
        } catch {
            if (!stored.refresh_token) {
                clearSession();
                return;
            }
            try {
                await refresh(stored.refresh_token);
            } catch {
                clearSession();
            }
        }
    }, [clearSession, persistSession, refresh]);

    useEffect(() => {
        let cancelled = false;

        async function initialize() {
            setLoading(true);
            try {
                const setupData = await fetchAuthSetup();
                if (!cancelled) {
                    setSetup(setupData);
                }
                await hydrateSession();
            } catch {
                if (!cancelled) {
                    clearSession();
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        }

        initialize();
        return () => {
            cancelled = true;
        };
    }, [clearSession, hydrateSession]);

    const login = useCallback(async (credentials) => {
        const nextSession = await loginRequest(credentials);
        persistSession(nextSession);
        return nextSession;
    }, [persistSession]);

    const bootstrapAdmin = useCallback(async (payload) => {
        const nextSession = await bootstrapAdminRequest(payload);
        persistSession(nextSession);
        setSetup((current) => ({ ...current, needs_bootstrap: false }));
        return nextSession;
    }, [persistSession]);

    const value = useMemo(() => ({
        session,
        user: session?.user || null,
        loading,
        setup,
        isAuthenticated: Boolean(session?.access_token),
        canManageUsers: session?.user?.role === 'admin',
        canManageProperties: ['admin', 'manager'].includes(session?.user?.role || ''),
        canManagePayments: ['admin', 'manager'].includes(session?.user?.role || ''),
        login,
        bootstrapAdmin,
        refresh,
        logout: clearSession,
    }), [bootstrapAdmin, clearSession, loading, login, refresh, session, setup]);

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
