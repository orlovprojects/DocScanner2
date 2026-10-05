// DU modulio API. Jei endpoints.js eksportuoja axios kitu vardu - pakeisk importą.
import { api } from "./endpoints";

const P = "payroll";

export const payrollApi = {
  // žinynai
  settings: () => api.get(`${P}/settings/`).then((r) => r.data),
  saveSettings: (data) => api.put(`${P}/settings/`, data).then((r) => r.data),
  positions: () => api.get(`${P}/positions/`).then((r) => r.data),
  searchPositions: (q) => api.get(`${P}/lpk/`, { params: { q } }).then((r) => r.data),
  leavePreview: (data) => api.post(`${P}/leave-preview/`, data).then((r) => r.data),
  createPosition: (data) => api.post(`${P}/positions/`, data).then((r) => r.data),
  payCodes: (params) => api.get(`${P}/pay-codes/`, { params }).then((r) => r.data),

  // darbuotojai
  employees: (params) => api.get(`${P}/employees/`, { params }).then((r) => r.data),
  employee: (id) => api.get(`${P}/employees/${id}/`).then((r) => r.data),
  createEmployee: (data) => api.post(`${P}/employees/`, data).then((r) => r.data),
  updateEmployee: (id, data) => api.patch(`${P}/employees/${id}/`, data).then((r) => r.data),
  createContract: (data) => api.post(`${P}/contracts/`, data).then((r) => r.data),
  updateContract: (id, data) => api.patch(`${P}/contracts/${id}/`, data).then((r) => r.data),
  createTerms: (data) => api.post(`${P}/contract-terms/`, data).then((r) => r.data),
  inviteEmployee: (id) => api.post(`${P}/employees/${id}/invite/`).then((r) => r.data),
  vacation: (id, params) => api.get(`${P}/employees/${id}/vacation/`, { params }).then((r) => r.data),
  setVacationBalance: (id, data) => api.post(`${P}/employees/${id}/vacation/`, data).then((r) => r.data),
  createChild: (data) => api.post(`${P}/children/`, data).then((r) => r.data),
  deleteChild: (id) => api.delete(`${P}/children/${id}/`),

  // dokumentai
  generateContract: (id) => api.post(`${P}/contracts/${id}/generate/`).then((r) => r.data),
  documents: (params) => api.get(`${P}/documents/`, { params }).then((r) => r.data),
  createDocument: (formData) => api.post(`${P}/documents/`, formData).then((r) => r.data),
  updateDocument: (id, data) => api.patch(`${P}/documents/${id}/`, data).then((r) => r.data),
  deleteDocument: (id) => api.delete(`${P}/documents/${id}/`),
  uploadDocument: (id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return api.post(`${P}/documents/${id}/upload/`, fd).then((r) => r.data);
  },
  documentHtml: (id) => api.get(`${P}/documents/${id}/html/`, { responseType: "text" }).then((r) => r.data),
  documentFile: (id) => api.get(`${P}/documents/${id}/file/`, { responseType: "blob" }).then((r) => r.data),

  // prašymai (esavitarna.lt)
  requests: (params) => api.get(`${P}/requests/`, { params }).then((r) => r.data),
  approveRequest: (id, answer) => api.post(`${P}/requests/${id}/approve/`, answer ? { answer } : {}).then((r) => r.data),
  requestAnswerPreview: (id) => api.get(`${P}/requests/${id}/answer_preview/`).then((r) => r.data),
  rejectRequest: (id, reason) => api.post(`${P}/requests/${id}/reject/`, { reason }).then((r) => r.data),
  requestHtml: (id) => api.get(`${P}/requests/${id}/html/`, { responseType: "text" }).then((r) => r.data),

  // įvykiai
  absences: (params) => api.get(`${P}/absences/`, { params }).then((r) => r.data),
  createAbsence: (data) => api.post(`${P}/absences/`, data).then((r) => r.data),
  deleteAbsence: (id) => api.delete(`${P}/absences/${id}/`),

  // tabelis
  timesheet: (year, month) => api.get(`${P}/timesheet/`, { params: { year, month } }).then((r) => r.data),
  setTimesheetHours: (data) => api.post(`${P}/timesheet/`, data).then((r) => r.data),
  clearTimesheetHours: (data) => api.delete(`${P}/timesheet/`, { data }),

  // darbo apmokėjimo sistema
  positionGroups: () => api.get(`${P}/position-groups/`).then((r) => r.data),
  createGroup: (data) => api.post(`${P}/position-groups/`, data).then((r) => r.data),
  updateGroup: (id, data) => api.patch(`${P}/position-groups/${id}/`, data).then((r) => r.data),
  deleteGroup: (id) => api.delete(`${P}/position-groups/${id}/`),
  autoCreateGroups: () => api.post(`${P}/position-groups/auto_create/`).then((r) => r.data),
  groupsCheck: () => api.get(`${P}/position-groups/check/`).then((r) => r.data),
  dasList: () => api.get(`${P}/das/`).then((r) => r.data),
  dasPreview: (date, manager) =>
    api.get(`${P}/das/`, { params: { preview: 1, date, manager }, responseType: "text" }).then((r) => r.data),
  dasApprove: (data) => api.post(`${P}/das/`, data).then((r) => r.data),
  dasHtml: (id) => api.get(`${P}/das/${id}/`, { responseType: "text" }).then((r) => r.data),

  // deklaracijos
  declarations: (year, month) => api.get(`${P}/declarations/`, { params: { year, month } }).then((r) => r.data),
  generateDeclaration: (data) => api.post(`${P}/declarations/`, data).then((r) => r.data),
  declarationFile: (id) => api.get(`${P}/declarations/${id}/file/`, { responseType: "blob" }).then((r) => r.data),
  submitDeclaration: (id) => api.post(`${P}/declarations/${id}/submit/`).then((r) => r.data),
  checkDeclaration: (id) => api.post(`${P}/declarations/${id}/check/`).then((r) => r.data),
  testVmi: () => api.post(`${P}/settings/test-vmi/`).then((r) => r.data),
  // išmokėjimai
  payments: (year, month) => api.get(`${P}/payments/`, { params: { year, month } }).then((r) => r.data),
  markPaid: (data) => api.post(`${P}/payments/mark-paid/`, data).then((r) => r.data),
  allocationAction: (id, data) => api.post(`${P}/payment-allocations/${id}/`, data).then((r) => r.data),
  removeAllocation: (id) => api.delete(`${P}/payment-allocations/${id}/`),
  createAdvances: (year, month) => api.post(`${P}/payments/advances/`, { year, month }).then((r) => r.data),
  linkTransaction: (id, data) => api.post(`${P}/payments/${id}/link-transaction/`, data).then((r) => r.data),
  bankAccounts: () => api.get("invoicing/bank-accounts/").then((r) => r.data),
  // grafikai
  roster: (year, month) => api.get(`${P}/roster/`, { params: { year, month } }).then((r) => r.data),
  rosterAction: (data) => api.post(`${P}/roster/action/`, data).then((r) => r.data),
  rosterCatalog: () => api.get(`${P}/roster/catalog/`).then((r) => r.data),
  shiftTypes: () => api.get(`${P}/shift-types/`).then((r) => r.data),
  saveShiftType: (d) => (d.id ? api.patch(`${P}/shift-types/${d.id}/`, d) : api.post(`${P}/shift-types/`, d)).then((r) => r.data),
  deleteShiftType: (id) => api.delete(`${P}/shift-types/${id}/`),
  rules: () => api.get(`${P}/schedule-rules/`).then((r) => r.data),
  saveRule: (d) => (d.id ? api.patch(`${P}/schedule-rules/${d.id}/`, d) : api.post(`${P}/schedule-rules/`, d)).then((r) => r.data),
  deleteRule: (id) => api.delete(`${P}/schedule-rules/${id}/`),
  tags: () => api.get(`${P}/employee-tags/`).then((r) => r.data),
  saveTag: (d) => (d.id ? api.patch(`${P}/employee-tags/${d.id}/`, d) : api.post(`${P}/employee-tags/`, d)).then((r) => r.data),
  deleteTag: (id) => api.delete(`${P}/employee-tags/${id}/`),
  paymentFile: (data) => api.post(`${P}/payments/file/`, data, { responseType: "blob" }),
  declarationStatus: (id, status, reason) => api.post(`${P}/declarations/${id}/status/`, { status, reason }).then((r) => r.data),

  // SDUP
  runSdup: (id) => api.get(`${P}/runs/${id}/sdup/`).then((r) => r.data),
  runSdupFile: (id) => api.get(`${P}/runs/${id}/sdup/`, { params: { download: 1 }, responseType: "blob" }).then((r) => r.data),

  // mėnesio DU
  prepareRun: (year, month) => api.post(`${P}/runs/prepare/`, { year, month }).then((r) => r.data),
  recalcRun: (id) => api.post(`${P}/runs/${id}/recalculate/`).then((r) => r.data),
  approveRun: (id) => api.post(`${P}/runs/${id}/approve/`).then((r) => r.data),
  reopenRun: (id) => api.post(`${P}/runs/${id}/reopen/`).then((r) => r.data),
  runResults: (id) => api.get(`${P}/runs/${id}/results/`).then((r) => r.data),
  runLines: (id, employee) => api.get(`${P}/runs/${id}/lines/`, { params: { employee } }).then((r) => r.data),
  addRunLine: (data) => api.post(`${P}/run-lines/`, data).then((r) => r.data),
  deleteRunLine: (id) => api.delete(`${P}/run-lines/${id}/`),
};

// ---------- pagalbinės ----------
export const money = (v) =>
  v === null || v === undefined || v === ""
    ? "–"
    : `${Number(v).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const apiError = (e) => {
  const d = e?.response?.data;
  if (!d) return "Nepavyko susisiekti su serveriu";
  if (typeof d === "string") return d;
  if (Array.isArray(d)) return d.join(" ");
  if (d.detail) return d.detail;
  return Object.entries(d)
    .map(([k, v]) => (Array.isArray(v) ? v.join(" ") : String(v)))
    .join(" ");
};

export const MONTHS = [
  "Sausis", "Vasaris", "Kovas", "Balandis", "Gegužė", "Birželis",
  "Liepa", "Rugpjūtis", "Rugsėjis", "Spalis", "Lapkritis", "Gruodis",
];

export const ABSENCE_KINDS = {
  vacation: { label: "Kasmetinės atostogos", short: "A", color: "#4C8BF5" },
  sick: { label: "Liga", short: "L", color: "#E5484D" },
  parent_day: { label: "Mamadienis / tėvadienis", short: "MD", color: "#A15CE0" },
  unpaid: { label: "Nemokamos atostogos", short: "NA", color: "#8B8D98" },
  truancy: { label: "Pravaikšta", short: "PB", color: "#F76B15" },
  downtime: { label: "Prastova", short: "PR", color: "#B08A3E" },
  study: { label: "Mokymosi atostogos", short: "MA", color: "#12A594" },
  business_trip: { label: "Komandiruotė", short: "K", color: "#0090FF" },
  donor: { label: "Donorystė", short: "D", color: "#E54666" },
  civic: { label: "Valstybinės pareigos", short: "VV", color: "#6E56CF" },
  paternity: { label: "Tėvystės atostogos", short: "TA", color: "#3E63DD" },
  childcare: { label: "Vaiko priežiūros atostogos", short: "VP", color: "#3E63DD" },
  maternity: { label: "Nėštumo ir gimdymo atostogos", short: "G", color: "#D6409F" },
  suspension: { label: "Nušalinimas", short: "NS", color: "#8B8D98" },
};

export const EXTRA_HOURS = {
  overtime: "Viršvalandžiai (×1,5)",
  night: "Darbas naktį (priemoka +50 %)",
  rest_day: "Darbas poilsio dieną (×2)",
  holiday: "Darbas švenčių dieną (×2)",
  ot_night: "Viršvalandžiai naktį (×2)",
  ot_rest: "Viršvalandžiai poilsio dieną (×2)",
  ot_holiday: "Viršvalandžiai švenčių dieną (×2,5)",
};

export const CONTRACT_TYPES = [
  { value: "01", label: "Neterminuota" },
  { value: "02", label: "Terminuota" },
  { value: "03", label: "Laikinojo darbo", subtypes: true },
  { value: "04", label: "Pameistrystės" },
  { value: "05", label: "Projektinio darbo" },
  { value: "06", label: "Darbo vietos dalijimosi", subtypes: true },
  { value: "07", label: "Darbo keliems darbdaviams", subtypes: true },
  { value: "08", label: "Sezoninio darbo", subtypes: true },
];

export const days = (v) =>
  v === null || v === undefined ? "–" : `${Number(v).toLocaleString("lt-LT", { maximumFractionDigits: 2 })} d.`;

export const NPD_MODES = [
  { value: "standard", label: "Taikyti (dirba tik pas mus arba čia pagrindinė darbovietė)" },
  { value: "none", label: "Netaikyti (NPD taikomas kitoje darbovietėje)" },
  { value: "d30_55", label: "Taikyti padidintą (30–55 % dalyvumo lygis)" },
  { value: "d0_25", label: "Taikyti padidintą (0–25 % dalyvumo lygis)" },
];
