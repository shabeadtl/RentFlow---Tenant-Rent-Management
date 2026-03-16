/**
 * API client for the Rent Management backend.
 */

import axios from 'axios';

export const AUTH_STORAGE_KEY = 'RentFlow_auth';

const api = axios.create({ baseURL: import.meta.env.VITE_API_BASE_URL || '/api' });

export function getStoredAuthSession() {
    if (typeof window === 'undefined') return null;
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

export function setStoredAuthSession(session) {
    if (typeof window === 'undefined') return;
    if (!session) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
    }
    window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
}

api.interceptors.request.use((config) => {
    const session = getStoredAuthSession();
    if (session?.access_token) {
        config.headers = config.headers || {};
        if (!config.headers.Authorization) {
            config.headers.Authorization = `Bearer ${session.access_token}`;
        }
    }
    return config;
});

// ── Auth ──────────────────────────────────────────────────────────
export const fetchAuthSetup = () => api.get('/auth/setup').then((response) => response.data);
export const bootstrapAdmin = (data) => api.post('/auth/bootstrap-admin', data).then((response) => response.data);
export const login = (data) => api.post('/auth/login', data).then((response) => response.data);
export const refreshAuthSession = (refresh_token) => api.post('/auth/refresh', { refresh_token }).then((response) => response.data);
export const fetchMe = () => api.get('/auth/me').then((response) => response.data);

// ── User Management ───────────────────────────────────────────────
export const fetchUsers = () => api.get('/users/').then((response) => response.data);
export const createUser = (data) => api.post('/users/', data).then((response) => response.data);
export const updateUser = (id, data) => api.put(`/users/${id}`, data).then((response) => response.data);
export const deleteUser = (id) => api.delete(`/users/${id}`);

// ── Properties ────────────────────────────────────────────────────
export const fetchProperties = () => api.get('/properties/').then((response) => response.data);
export const fetchProperty = (id) => api.get(`/properties/${id}`).then((response) => response.data);
export const createProperty = (data) => api.post('/properties/', data).then((response) => response.data);
export const updateProperty = (id, data) => api.put(`/properties/${id}`, data).then((response) => response.data);
export const deleteProperty = (id) => api.delete(`/properties/${id}`);

// ── Tenants ───────────────────────────────────────────────────────
export const fetchTenants = (params) => api.get('/tenants/', { params }).then((response) => response.data);
export const fetchTenant = (id) => api.get(`/tenants/${id}`).then((response) => response.data);
export const createTenant = (data) => api.post('/tenants/', data).then((response) => response.data);
export const updateTenant = (id, data) => api.put(`/tenants/${id}`, data).then((response) => response.data);
export const deleteTenant = (id) => api.delete(`/tenants/${id}`);
export const uploadTenantDocuments = (id, formData) => api.post(`/tenants/${id}/documents`, formData).then((response) => response.data);
export const deleteTenantDocument = (id, documentKind) => api.delete(`/tenants/${id}/documents/${documentKind}`).then((response) => response.data);

// ── Payments ──────────────────────────────────────────────────────
export const fetchPayments = (params) => api.get('/payments/', { params }).then((response) => response.data);
export const fetchPayment = (id) => api.get(`/payments/${id}`).then((response) => response.data);
export const createPayment = (data) => api.post('/payments/', data).then((response) => response.data);
export const updatePayment = (id, data) => api.put(`/payments/${id}`, data).then((response) => response.data);
export const deletePayment = (id) => api.delete(`/payments/${id}`);

// ── Revenue ───────────────────────────────────────────────────────
export const fetchRevenue = (params) => api.get('/revenue', { params }).then((response) => response.data);

export default api;
