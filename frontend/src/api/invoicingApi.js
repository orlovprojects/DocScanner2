/**
 * DokSkenas — Sąskaitų išrašymas
 * API helper functions for invoicing.
 */

import { api } from './endpoints';

const BASE = '/invoicing';

export const invoicingApi = {

  // ── Settings ─────────────────────────────────────────
  getSettings: () =>
    api.get(`${BASE}/settings/`, { withCredentials: true }),

  updateSettings: (data) =>
    api.put(`${BASE}/settings/`, data, { withCredentials: true }),

  uploadLogo: (file) => {
    const fd = new FormData();
    fd.append('logo', file);
    return api.put(`${BASE}/settings/`, fd, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // ── Counterparties ───────────────────────────────────
  getCounterparties: (params = {}) =>
    api.get(`${BASE}/counterparties/`, { params, withCredentials: true }),

  createCounterparty: (data) =>
    api.post(`${BASE}/counterparties/`, data, { withCredentials: true }),

  updateCounterparty: (id, data) =>
    api.put(`${BASE}/counterparties/${id}/`, data, { withCredentials: true }),

  deleteCounterparty: (id) =>
    api.delete(`${BASE}/counterparties/${id}/`, { withCredentials: true }),

  // ── Invoices ─────────────────────────────────────────
  getInvoice: (id) =>
    api.get(`${BASE}/invoices/${id}/`, { withCredentials: true }),

  getInvoices: (params = {}, config = {}) =>
    api.get(`${BASE}/invoices/`, { params, withCredentials: true, ...config }),

  createInvoice: (data) =>
    api.post(`${BASE}/invoices/create/`, data, { withCredentials: true }),

  updateInvoice: (id, data) =>
    api.put(`${BASE}/invoices/${id}/update/`, data, { withCredentials: true }),

  deleteInvoice: (id) =>
    api.delete(`${BASE}/invoices/${id}/delete/`, { withCredentials: true }),

  getLineItems: (id) =>
    api.get(`${BASE}/invoices/${id}/line-items/`, { withCredentials: true }),

  getSummary: (params) =>
    api.get('/invoicing/invoices/summary/', { params, withCredentials: true }),

  // ── Actions ──────────────────────────────────────────
  issueInvoice: (id) =>
    api.post(`${BASE}/invoices/${id}/issue/`, {}, { withCredentials: true }),

  sendInvoice: (id, email) =>
    api.post(`${BASE}/invoices/${id}/send/`, { email }, { withCredentials: true }),

  markPaid: (id, data) =>
    api.post(`${BASE}/invoices/${id}/mark-paid/`, data, { withCredentials: true }),

  cancelInvoice: (id) =>
    api.post(`${BASE}/invoices/${id}/cancel/`, {}, { withCredentials: true }),

  duplicateInvoice: (id) =>
    api.post(`${BASE}/invoices/${id}/duplicate/`, {}, { withCredentials: true }),

  createPvmSf: (id) =>
    api.post(`${BASE}/invoices/${id}/create-pvm-sf/`, {}, { withCredentials: true }),

  // ── Measurement Units ────────────────────────────────
  getUnits: () =>
    api.get(`${BASE}/units/`, { withCredentials: true }),

  createUnit: (data) =>
    api.post(`${BASE}/units/`, data, { withCredentials: true }),

  updateUnit: (id, data) =>
    api.put(`${BASE}/units/${id}/`, data, { withCredentials: true }),

  deleteUnit: (id) =>
    api.delete(`${BASE}/units/${id}/`, { withCredentials: true }),

  // ── Invoice Series ───────────────────────────────────
  getSeries: (params = {}) =>
    api.get(`${BASE}/series/`, { params, withCredentials: true }),

  createSeries: (data) =>
    api.post(`${BASE}/series/`, data, { withCredentials: true }),

  updateSeries: (id, data) =>
    api.put(`${BASE}/series/${id}/`, data, { withCredentials: true }),

  deleteSeries: (id) =>
    api.delete(`${BASE}/series/${id}/`, { withCredentials: true }),

  // ── Number check ──────────────────────────────────────
  checkNumber: (prefix, number) =>
    api.get(`${BASE}/series/check-number/`, {
      params: { prefix, number },
      withCredentials: true,
    }),

  // ── Hybrid search ────────────────────────────────────
  searchCompanies: (q, limit = 20) =>
    api.get(`${BASE}/search-companies/`, {
      params: { q, limit },
      withCredentials: true,
    }),

   // ── Products ───────────────────────────────────────────
   getProducts: (params = {}) =>
    api.get(`${BASE}/products/`, { params, withCredentials: true }),

   createProduct: (data) =>
     api.post(`${BASE}/products/`, data, { withCredentials: true }),

   updateProduct: (id, data) =>
     api.put(`${BASE}/products/${id}/`, data, { withCredentials: true }),

   deleteProduct: (id) =>
     api.delete(`${BASE}/products/${id}/`, { withCredentials: true }),

   // ── PDF generator ───────────────────────────────────────────
   getInvoicePdf: (id) =>
    api.get(`${BASE}/invoices/${id}/pdf/`, { responseType: 'blob', withCredentials: true }),


  // ── Recurring Invoices ──
  createRecurringInvoice: (data) => api.post('/invoicing/recurring-invoices/', data, { withCredentials: true }),
  updateRecurringInvoice: (id, data) => api.put(`/invoicing/recurring-invoices/${id}/`, data, { withCredentials: true }),
  getRecurringInvoice: (id) => api.get(`/invoicing/recurring-invoices/${id}/`, { withCredentials: true }),
  getRecurringInvoices: (params = {}, config = {}) =>
    api.get(`${BASE}/recurring-invoices/`, { params, withCredentials: true, ...config }),
  pauseRecurring: (id) => api.post(`/invoicing/recurring-invoices/${id}/pause/`, {}, { withCredentials: true }),
  resumeRecurring: (id) => api.post(`/invoicing/recurring-invoices/${id}/resume/`, {}, { withCredentials: true }),
  cancelRecurring: (id) => api.post(`/invoicing/recurring-invoices/${id}/cancel/`, {}, { withCredentials: true }),
  previewRecurring: (id, count = 5) => api.get(`/invoicing/recurring-invoices/${id}/preview_next/`, { params: { count }, withCredentials: true }),
  getRecurringPlanHistory: (id, count = 12) => api.get(`/invoicing/recurring-invoices/${id}/plan_history/`, { params: { count }, withCredentials: true }),

  downloadCounterpartyTemplate: () => api.get('/invoicing/counterparties/import-template/', {
    withCredentials: true, responseType: 'blob',
  }),
  importCounterparties: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/invoicing/counterparties/import/', formData, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  downloadProductTemplate: () => api.get('/invoicing/products/import-template/', {
    withCredentials: true, responseType: 'blob',
  }),
  importProducts: (file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/invoicing/products/import/', formData, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },



  // ── Payments & Bank Import ───────────────────────────
  getInvoicePayments: (id) =>
    api.get(`${BASE}/invoices/${id}/payments/`, { withCredentials: true }),

  removeManualPayment: (invoiceId, allocId) =>
    api.post(`${BASE}/invoices/${invoiceId}/remove-payment/${allocId}/`, {}, { withCredentials: true }),

  confirmAllocation: (allocationId) =>
    api.post(`${BASE}/payments/confirm/`, { allocation_id: allocationId }, { withCredentials: true }),

  bulkConfirmAllocations: (allocationIds) =>
    api.post(`${BASE}/payments/bulk-confirm/`, { allocation_ids: allocationIds }, { withCredentials: true }),

  rejectAllocation: (allocationId) =>
    api.post(`${BASE}/payments/reject/`, { allocation_id: allocationId }, { withCredentials: true }),

  getPaymentStats: () =>
    api.get(`${BASE}/payments/stats/`, { withCredentials: true }),

  // ── Bank Statements ──────────────────────────────────
  uploadBankStatement: (file, bankName = '', fileFormat = '') => {
    const fd = new FormData();
    fd.append('file', file);
    if (bankName) fd.append('bank_name', bankName);
    if (fileFormat) fd.append('file_format', fileFormat);
    return api.post(`${BASE}/bank-statements/upload/`, fd, {
      withCredentials: true,
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  getBankStatements: (params = {}) =>
    api.get(`${BASE}/bank-statements/`, { params, withCredentials: true }),

  getBankStatement: (id) =>
    api.get(`${BASE}/bank-statements/${id}/`, { withCredentials: true }),

  deleteBankStatement: (id) =>
    api.delete(`${BASE}/bank-statements/${id}/`, { withCredentials: true }),

  reMatchBankStatement: (id) =>
    api.post(`${BASE}/bank-statements/${id}/re-match/`, {}, { withCredentials: true }),


  getPaymentProviders: () =>
    api.get(`${BASE}/payment-providers/`, { withCredentials: true }),

  connectPaymentProvider: (data) =>
    api.post('/invoicing/payment-providers/connect/', data),
  
  // Disconnect (disable) a provider
  disconnectPaymentProvider: (data) =>
    api.post('/invoicing/payment-providers/disconnect/', data),

  generatePaymentLink: (invoiceId, payload) =>
    api.post(`${BASE}/invoices/${invoiceId}/generate-payment-link/`, payload, { withCredentials: true }),




  // ── Invoice Emails ───────────────────────────────────
  sendInvoiceEmail: (id, email, force = false) =>
    api.post(`${BASE}/invoices/${id}/send-email/`, { email, force }, { withCredentials: true }),

  sendInvoiceReminder: (id, email) =>
    api.post(`${BASE}/invoices/${id}/send-reminder/`, { email }, { withCredentials: true }),

  getInvoiceEmails: (id) =>
    api.get(`${BASE}/invoices/${id}/emails/`, { withCredentials: true }),

  getEmailSummary: (ids) =>
    api.get(`${BASE}/invoices/email-summary/`, { params: { ids: ids.join(',') }, withCredentials: true }),

  // ── Reminder Settings ────────────────────────────────
  getReminderSettings: () =>
    api.get(`${BASE}/reminder-settings/`, { withCredentials: true }),

  updateReminderSettings: (data) =>
    api.patch(`${BASE}/reminder-settings/`, data, { withCredentials: true }),

  resetReminderSettings: () =>
    api.post(`${BASE}/reminder-settings/reset/`, {}, { withCredentials: true }),  


  // ── Public invoice ───────────────────────────────────
  getPublicInvoice: (uuid) =>
    api.get(`${BASE}/public/${uuid}/`, {}),

  getPublicInvoicePdf: (uuid) =>
    api.get(`${BASE}/public/${uuid}/pdf/`, { responseType: 'blob' }),  


  // --- Inv Subscription ---

  getInvSubscription: () =>
    api.get("inv/subscription/"),

  startInvTrial: () =>
    api.post("inv/start-trial/"),

};