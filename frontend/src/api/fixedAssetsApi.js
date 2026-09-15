import { api } from "./endpoints";

const BASE = "/fixed-assets";

export const fixedAssetsApi = {
  getGroups: () =>
    api.get(`${BASE}/groups/`, { withCredentials: true }),

  getAssets: (params = {}) =>
    api.get(`${BASE}/`, { params, withCredentials: true }),

  getPurchaseSource: (purchaseId, lineId = null) =>
    api.get(`${BASE}/purchase-source/`, {
      params: { purchase_id: purchaseId, line_id: lineId || undefined },
      withCredentials: true,
    }),

  createFromPurchase: (data) =>
    api.post(`${BASE}/from-purchase/`, data, { withCredentials: true }),

  deleteAsset: (id) =>
    api.delete(`${BASE}/${id}/`, { withCredentials: true }),

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

  cancelSale: (id) =>
    api.post(`${BASE}/${id}/sell/cancel/`, {}, { withCredentials: true }),
};