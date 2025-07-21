export function exportToCsv(rows) {
  if (!rows.length) return;
  const exportFields = [
    "original_filename",
    "seller_name",
    "buyer_name",
    "document_number",
    "document_series",
    "order_number",
    "document_type",
    "currency",
    "invoice_date",
    "operation_date",
    "due_date",
    "amount_wo_vat",
    "vat_amount",
    "vat_percent",
    "amount_with_vat",
    "status",
    "uploaded_at",
  ];
  const csvRows = [];
  csvRows.push(exportFields.map(f => f.replace(/_/g, " ")).join(","));
  for (let row of rows) {
    csvRows.push(
      exportFields
        .map(f => {
          let v = row[f];
          if (f.endsWith("_date") && v) {
            try {
              v = new Date(v).toLocaleDateString("lt-LT");
            } catch {}
          }
          if (typeof v === "string" && (v.includes(",") || v.includes('"'))) {
            v = `"${v.replace(/"/g, '""')}"`;
          }
          return v ?? "";
        })
        .join(",")
    );
  }
  const blob = new Blob(["\uFEFF" + csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "export.csv";
  a.click();
  window.URL.revokeObjectURL(url);
}
