import { api } from "./endpoints";

const BASE = "/fixed-assets";

export const fixedAssetsApi = {
  getGroups: () =>
    api.get(`${BASE}/groups/`, { withCredentials: true }),

  updateGroup: (id, data) =>
    api.patch(`${BASE}/groups/${id}/`, data, { withCredentials: true }),

  createManual: (data) =>
    api.post(`${BASE}/manual/`, data, { withCredentials: true }),

  getImprovements: (purchaseId) =>
    api.get(`${BASE}/improvements/`, { params: { purchase_id: purchaseId }, withCredentials: true }),

  createImprovement: (data) =>
    api.post(`${BASE}/improvements/`, data, { withCredentials: true }),

  cancelImprovement: (opId) =>
    api.post(`${BASE}/improvements/${opId}/cancel/`, {}, { withCredentials: true }),

  getSaleCandidates: (search) =>
    api.get(`${BASE}/sale-candidates/`, { params: { search: search || undefined }, withCredentials: true }),

  getAssets: (params = {}) =>
    api.get(`${BASE}/`, { params, withCredentials: true }),

  getPurchaseUsage: (purchaseId) =>
    api.get(`${BASE}/purchase-usage/`, { params: { purchase_id: purchaseId }, withCredentials: true }),

  getPurchaseSource: (purchaseId, lineId = null) =>
    api.get(`${BASE}/purchase-source/`, {
      params: { purchase_id: purchaseId, line_id: lineId || undefined },
      withCredentials: true,
    }),

  createFromPurchase: (data) =>
    api.post(`${BASE}/from-purchase/`, data, { withCredentials: true }),

  getAsset: (id) =>
    api.get(`${BASE}/${id}/`, { withCredentials: true }),

  updateAsset: (id, data) =>
    api.patch(`${BASE}/${id}/`, data, { withCredentials: true }),

  deleteAsset: (id) =>
    api.delete(`${BASE}/${id}/`, { withCredentials: true }),

  getOperations: (id) =>
    api.get(`${BASE}/${id}/operations/`, { withCredentials: true }),

  getSchedule: (id) =>
    api.get(`${BASE}/${id}/schedule/`, { withCredentials: true }),

  getDepreciation: (period) =>
    api.get(`${BASE}/depreciation/`, { params: { period }, withCredentials: true }),

  registerDepreciation: (period) =>
    api.post(`${BASE}/depreciation/register/`, { period }, { withCredentials: true }),

  cancelDepreciation: (period) =>
    api.post(`${BASE}/depreciation/cancel/`, { period }, { withCredentials: true }),

  writeOff: (id, data) =>
    api.post(`${BASE}/${id}/write-off/`, data, { withCredentials: true }),

  cancelWriteOff: (id) =>
    api.post(`${BASE}/${id}/write-off/cancel/`, {}, { withCredentials: true }),

  sell: (id, data) =>
    api.post(`${BASE}/${id}/sell/`, data, { withCredentials: true }),

  getSalePrefill: (id) =>
    api.get(`${BASE}/${id}/sale-prefill/`, { withCredentials: true }),

  checkSale: (id, data) =>
    api.post(`${BASE}/${id}/sale-check/`, data, { withCredentials: true }),

  cancelSale: (id) =>
    api.post(`${BASE}/${id}/sell/cancel/`, {}, { withCredentials: true }),
};