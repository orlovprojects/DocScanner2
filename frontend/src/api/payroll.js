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
  employeeReported: (id) => api.get(`${P}/employees/${id}/reported/`).then((r) => r.data),

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
  requestReview: (id) => api.get(`${P}/requests/${id}/review/`).then((r) => r.data),
  payrollOverview: () => api.get(`${P}/overview/`).then((r) => r.data), 
  requestAttachment: (id) => api.get(`${P}/requests/${id}/attachment/`, { responseType: "blob" }).then((r) => r.data),

  // įvykiai
  absences: (params) => api.get(`${P}/absences/`, { params }).then((r) => r.data),
  createAbsence: (data) => api.post(`${P}/absences/`, data).then((r) => r.data),
  deleteAbsence: (id) => api.delete(`${P}/absences/${id}/`),

  // tabelis
  timesheet: (year, month) => api.get(`${P}/timesheet/`, { params: { year, month } }).then((r) => r.data),
  timesheetFull: (year, month) => api.get(`${P}/timesheet/`, { params: { year, month, meta: 1 } }).then((r) => r.data),
  setTimesheetHours: (data) => api.post(`${P}/timesheet/`, data).then((r) => r.data),
  clearTimesheetHours: (data) => api.delete(`${P}/timesheet/`, { data }),

  // darbo apmokėjimo sistema
  positionGroups: () => api.get(`${P}/position-groups/`).then((r) => r.data),
  createGroup: (data) => api.post(`${P}/position-groups/`, data).then((r) => r.data),
  updateGroup: (id, data) => api.patch(`${P}/position-groups/${id}/`, data).then((r) => r.data),
  deleteGroup: (id) => api.delete(`${P}/position-groups/${id}/`),
  garnishments: (params) => api.get(`${P}/garnishments/`, { params }).then((r) => r.data),
  createGarnishment: (data) => api.post(`${P}/garnishments/`, data).then((r) => r.data),
  updateGarnishment: (id, data) => api.patch(`${P}/garnishments/${id}/`, data).then((r) => r.data),
  deleteGarnishment: (id) => api.delete(`${P}/garnishments/${id}/`),
  recurring: (params) => api.get(`${P}/recurring-items/`, { params }).then((r) => r.data),
  createRecurring: (data) => api.post(`${P}/recurring-items/`, data).then((r) => r.data),
  updateRecurring: (id, data) => api.patch(`${P}/recurring-items/${id}/`, data).then((r) => r.data),
  deleteRecurring: (id) => api.delete(`${P}/recurring-items/${id}/`),
  autoCreateGroups: () => api.post(`${P}/position-groups/auto_create/`).then((r) => r.data),
  mergeGroup: (id, target) => api.post(`${P}/position-groups/${id}/merge/`, { target }).then((r) => r.data),
  splitPosition: (position) => api.post(`${P}/position-groups/split/`, { position }).then((r) => r.data),
  groupsCheck: () => api.get(`${P}/position-groups/check/`).then((r) => r.data),
  dasList: () => api.get(`${P}/das/`).then((r) => r.data),
  dasPreview: (date, manager, title, city, opts) =>
    api.get(`${P}/das/`, { params: { preview: 1, date, manager, title, city, opts: JSON.stringify(opts || {}) }, responseType: "text" }).then((r) => r.data),
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
  // Sodros ataskaitos S15 / S47 (nebūtina)
  sodraReports: (files, apply) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    fd.append("apply", apply ? "1" : "0");
    return api.post(`${P}/sodra-reports/`, fd).then((r) => r.data);
  },
  sodraFix: (employee_id, field, value) =>
    api.post(`${P}/sodra-reports/`, { action: "fix", employee_id, field, value }).then((r) => r.data),
  // perėjimas iš kitos programos
  migration: () => api.get(`${P}/migration/`).then((r) => r.data),
  migrationAction: (data) => api.post(`${P}/migration/`, data).then((r) => r.data),
  migrationExcel: () => api.get(`${P}/migration/excel/`, { responseType: "blob" }).then((r) => r.data),
  migrationExcelUpload: (file) => {
    const fd = new FormData();
    fd.append("excel", file);
    return api.post(`${P}/migration/`, fd).then((r) => r.data);
  },
  migrationUpload: (files) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append("files", f));
    return api.post(`${P}/migration/`, fd).then((r) => r.data);
  },
  // komandiruotės
  trips: (params) => api.get(`${P}/trips/`, { params }).then((r) => r.data),
  saveTrip: (d) => (d.id ? api.patch(`${P}/trips/${d.id}/`, d) : api.post(`${P}/trips/`, d)).then((r) => r.data),
  deleteTrip: (id) => api.delete(`${P}/trips/${id}/`),
  approveTrip: (id, data = {}) => api.post(`${P}/trips/${id}/approve/`, data).then((r) => r.data),
  cancelTrip: (id) => api.post(`${P}/trips/${id}/cancel/`).then((r) => r.data),
  tripOrderHtml: (id) => api.get(`${P}/trips/${id}/order/`, { responseType: "text" }).then((r) => r.data),
  tripNorms: () => api.get(`${P}/trip-preview/`).then((r) => r.data),
  tripPreview: (d) => api.post(`${P}/trip-preview/`, d).then((r) => r.data),
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
  approveRun: (id, advance_decisions) => api.post(`${P}/runs/${id}/approve/`, advance_decisions ? { advance_decisions } : {}).then((r) => r.data),
  reopenRun: (id) => api.post(`${P}/runs/${id}/reopen/`).then((r) => r.data),
  runResults: (id) => api.get(`${P}/runs/${id}/results/`).then((r) => r.data),
  runLines: (id, employee) => api.get(`${P}/runs/${id}/lines/`, { params: { employee } }).then((r) => r.data),
  addRunLine: (data) => api.post(`${P}/run-lines/`, data).then((r) => r.data),
  deleteRunLine: (id) => api.delete(`${P}/run-lines/${id}/`),
  payrollReadiness: (year, month) => api.get(`${P}/runs/readiness/`, { params: { year, month } }).then((r) => r.data),
  payrollPeriod: () => api.get(`${P}/runs/period/`).then((r) => r.data),
  payrollPeriodCheck: (ym) => api.get(`${P}/runs/period/`, { params: { check: ym } }).then((r) => r.data),
};

// ---------- pagalbinės ----------
export const money = (v) =>
  v === null || v === undefined || v === ""
    ? "–"
    : `${Number(v).toLocaleString("lt-LT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

export const apiError = (e) => {
  const status = e?.response?.status;
  const d = e?.response?.data;
  if (!e?.response) return "Serveris nepasiekiamas – patikrinkite interneto ryšį ir bandykite dar kartą";
  // UX-02: serverio klaidos puslapis (HTML) nerodomas bukalteriui
  if (status >= 500 || (typeof d === "string" && /<(!doctype|html|body)/i.test(d))) {
    return `Serverio klaida${status ? ` (${status})` : ""}. Bandykite dar kartą; jei kartojasi – parašykite mums.`;
  }
  if (!d) return "Nepavyko atlikti veiksmo";
  if (typeof d === "string") return d.length > 300 ? `${d.slice(0, 300)}…` : d;
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
  vacation_prepaid: { label: "Kasmetinės atostogos (apmokėtos anksčiau)", short: "A", color: "#4C8BF5" },
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
