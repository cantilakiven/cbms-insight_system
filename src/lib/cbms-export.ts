import * as XLSX from "xlsx-js-style";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { BlobWriter, ZipWriter, TextReader, BlobReader } from "@zip.js/zip.js";
import { getSourceWatermark } from "@/data/cbms";
import { municipality, getActiveYear, type DataYear } from "@/data/cbms";
import { addExportLog, generatePassword, makeExportId, getExpectedSavedPath, saveBlobWithPrompt, emitExportPassword } from "./export-log";

export interface ExportColumn {
  key: string;
  label: string;
}

export interface SummaryItem {
  label: string;
  value: number | string;
  percentage?: number | null;
  percentageLabel?: string;
}

export interface ExportGroup {
  title: string;
  rows: Record<string, any>[];
}

export interface GroupedExportPayload extends ExportPayload {
  barangaySummaryColumns?: ExportColumn[];
  barangaySummaryRows?: Record<string, any>[];
  groups?: ExportGroup[];
}

export interface ExportPayload {
  title: string;
  subtitle?: string;
  columns: ExportColumn[];
  rows: Record<string, any>[];
  note?: string;
  summary?: SummaryItem[];
  /** Dataset year used for the export and source attribution. */
  dataYear?: DataYear;
}

const safeName = (s: string) => s.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toLowerCase();

const SORT_KEYWORDS = {
  barangay: ["area_name", "barangay", "barangay_name"],
  person: ["_full_name", "full_name", "person_name", "name"],
  head: ["_household_head", "household_head"],
};

function normalizeSortText(value: any): string {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase();
}

function compareText(a: any, b: any): number {
  return normalizeSortText(a).localeCompare(normalizeSortText(b), undefined, {
    sensitivity: "base",
    numeric: true,
    ignorePunctuation: true,
  });
}

function findColumnKey(columns: ExportColumn[], rows: Record<string, any>[], keys: string[]): string | undefined {
  const available = new Set([
    ...columns.map((c) => c.key),
    ...(rows.length ? Object.keys(rows[0]) : []),
  ]);
  return keys.find((key) => available.has(key));
}

/** Deterministic export order: Barangay A-Z, then person/head name A-Z. */
function sortRowsForExport(columns: ExportColumn[], rows: Record<string, any>[]): Record<string, any>[] {
  const barangayKey = findColumnKey(columns, rows, SORT_KEYWORDS.barangay);
  const personKey = findColumnKey(columns, rows, SORT_KEYWORDS.person);
  const headKey = findColumnKey(columns, rows, SORT_KEYWORDS.head);
  if (!barangayKey && !personKey && !headKey) return rows.slice();

  const indexed = rows.map((row, index) => ({ row, index }));
  const isTotal = (row: Record<string, any>) => columns.slice(0, 2).some((c) => {
    const value = normalizeSortText(getVal(row, c.key)).toUpperCase();
    return value === "TOTAL" || value.startsWith("TOTAL:");
  });

  indexed.sort((a, b) => {
    const at = isTotal(a.row);
    const bt = isTotal(b.row);
    if (at !== bt) return at ? 1 : -1;
    if (barangayKey) {
      const c = compareText(getVal(a.row, barangayKey), getVal(b.row, barangayKey));
      if (c !== 0) return c;
    }
    if (personKey) {
      const c = compareText(getVal(a.row, personKey), getVal(b.row, personKey));
      if (c !== 0) return c;
    }
    if (headKey) {
      const c = compareText(getVal(a.row, headKey), getVal(b.row, headKey));
      if (c !== 0) return c;
    }
    return a.index - b.index;
  });
  return indexed.map((x) => x.row);
}

async function imageUrlToDataUrl(url: string): Promise<string | null> {
  if (typeof window === "undefined") return null;
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function addPageFooter(pdf: jsPDF, ref: string) {
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  pdf.setDrawColor(220, 226, 235);
  pdf.setLineWidth(0.2);
  pdf.line(14, pageHeight - 14, pageWidth - 14, pageHeight - 14);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);
  pdf.setTextColor(100, 110, 125);
  pdf.text(`Doc. No. ${ref}`, pageWidth / 2, pageHeight - 9, { align: "center" });
  pdf.text(`Page ${pdf.getNumberOfPages()}`, pageWidth - 14, pageHeight - 9, { align: "right" });
}

function getVal(r: any, key: string): any {
  if (r == null) return "";
  if (key in r) return r[key];
  return key.split(".").reduce((a, k) => (a == null ? a : a[k]), r);
}

function escapePrintHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/** Build a clean, printer-ready HTML document with explicit Folio pages.
 * The explicit page wrappers are also consumed by the desktop preview so the
 * operator can move through Page 1, Page 2, Page 3, etc. before printing.
 */
export function buildPrintHtml(payload: GroupedExportPayload): string {
  const { title, subtitle, columns, rows, summary, barangaySummaryColumns, barangaySummaryRows, groups, dataYear } = payload;
  const sortedGroups = (groups || []).slice().sort((a, b) => compareText(a.title, b.title));
  const sbCols = barangaySummaryColumns || [];
  const sbRows = barangaySummaryRows || [];
  const source = getSourceWatermark(resolveExportYear(title, subtitle, dataYear));
  const rowsPerPage = columns.length >= 10 ? 24 : columns.length >= 7 ? 30 : 36;
  const pageHeader = (pageNo: number, label?: string) => `<header class="report-head">${pageNo === 1 ? `<div class="eyebrow">Mutia · Community-Based Monitoring System</div>` : ""}<h1>${escapePrintHtml(label || title)}</h1><p>${escapePrintHtml(subtitle || `Municipality: ${municipality}`)}</p><p class="meta">Generated: ${escapePrintHtml(new Date().toLocaleString())} · Page ${pageNo}</p></header>`;
  const renderTable = (tableRows: Record<string, any>[]) => `<table><thead><tr>${columns.map((c) => `<th>${escapePrintHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${tableRows.map((r) => `<tr>${columns.map((c) => `<td>${escapePrintHtml(getVal(r, c.key))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  const pages: string[] = [];

  let firstPageBody = "";
  if (summary?.length) {
    firstPageBody += `<section class="summary-block"><h2>Summary</h2><table><thead><tr><th>Indicator</th><th>Count / Value</th><th>Percentage Rate (%Rate) / Population (%Population)</th></tr></thead><tbody>${summary.map((item) => `<tr><td>${escapePrintHtml(item.label)}</td><td class="num">${escapePrintHtml(typeof item.value === "number" ? item.value.toLocaleString() : item.value)}</td><td class="num">${item.percentage == null ? "—" : `${item.percentage.toFixed(2)}%`}</td></tr>`).join("")}</tbody></table></section>`;
  }
  if (sbCols.length && sbRows.length) {
    firstPageBody += `<section class="summary-block"><h2>By Barangay Summary</h2><table><thead><tr>${sbCols.map((c) => `<th>${escapePrintHtml(c.label)}</th>`).join("")}</tr></thead><tbody>${sortRowsForExport(sbCols, sbRows).map((r) => `<tr>${sbCols.map((c) => `<td>${escapePrintHtml(getVal(r, c.key))}</td>`).join("")}</tr>`).join("")}</tbody></table></section>`;
  }
  if (!sortedGroups.length) {
    const sorted = sortRowsForExport(columns, rows || []);
    if (sorted.length === 0) {
      firstPageBody += `<section class="summary-block"><h2>Records</h2><p class="empty">No records for this report.</p></section>`;
    } else {
      for (let i = 0; i < sorted.length; i += rowsPerPage) {
        if (i === 0) firstPageBody += `<section class="summary-block"><h2>Records</h2>${renderTable(sorted.slice(i, i + rowsPerPage))}</section>`;
        else pages.push(`<section class="print-page">${pageHeader(pages.length + 2)}<section>${renderTable(sorted.slice(i, i + rowsPerPage))}</section></section>`);
      }
    }
  } else {
    for (const group of sortedGroups) {
      const groupRows = sortRowsForExport(columns, group.rows || []);
      for (let i = 0; i < groupRows.length; i += rowsPerPage) {
        const chunk = groupRows.slice(i, i + rowsPerPage);
        pages.push(`<section class="print-page">${pageHeader(pages.length + 2)}<div class="barangay-heading"><div class="kicker">${i ? "Continuation · Barangay" : "Barangay"}</div><h2>${escapePrintHtml(group.title)}</h2><div class="sub">${groupRows.length.toLocaleString()} record(s) · rows ${i + 1}–${Math.min(i + rowsPerPage, groupRows.length)}</div></div>${renderTable(chunk)}</section>`);
      }
    }
  }
  pages.unshift(`<section class="print-page">${pageHeader(1)}${firstPageBody}<p class="meta source-note">${escapePrintHtml(source)}</p></section>`);

  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapePrintHtml(title)}</title><style>
  @page{size:215.9mm 330.2mm;margin:0}.print-page{width:215.9mm;min-height:330.2mm;height:330.2mm;padding:12mm 14mm 16mm;box-sizing:border-box;background:#fff;color:#1f2937;font-family:Arial,Helvetica,sans-serif;font-size:9pt;position:relative;page-break-after:always;break-after:page;overflow:hidden}.print-page:last-child{page-break-after:auto;break-after:auto}*{box-sizing:border-box}.report-head{padding-bottom:6mm;border-bottom:1.2px solid #1f3a5a;margin-bottom:6mm}.eyebrow{font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;color:#64748b;font-weight:700}.report-head h1{font-size:17pt;line-height:1.1;margin:2mm 0 1.5mm;color:#17324d}.report-head p{margin:0;color:#64748b;font-size:8.2pt}.meta{font-size:7pt;color:#64748b}.summary-block{margin-bottom:6mm}.summary-block h2{font-size:10.5pt;margin:0 0 2.5mm;color:#17324d;text-transform:uppercase;letter-spacing:.05em}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #cfd6df;padding:2mm 1.8mm;vertical-align:top;word-break:break-word}th{background:#e9eef4;color:#17324d;font-weight:700;font-size:7.3pt}td{font-size:7.2pt}td.num{text-align:right;font-weight:700}.barangay-heading{padding:0 0 4mm;margin-bottom:4mm;border-bottom:1.2px solid #1f3a5a}.barangay-heading .kicker{font-size:7pt;letter-spacing:.13em;text-transform:uppercase;color:#64748b;font-weight:700}.barangay-heading h2{font-size:15pt;margin:1mm 0;color:#17324d}.barangay-heading .sub{font-size:7.8pt;color:#64748b}.source-note{position:absolute;left:14mm;right:14mm;bottom:7mm;border-top:1px solid #d7dee7;padding-top:2mm}.empty{font-size:9pt;color:#64748b}.screen-page-number{display:none}
  @media screen{body{margin:0;background:#dfe5ec;padding:10px}.print-page{margin:0 auto 12px;box-shadow:0 8px 30px rgba(15,23,42,.14)}.screen-page-number{display:block;position:absolute;top:4mm;right:7mm;font-size:8px;color:#94a3b8}}
  @media print{body{margin:0;background:#fff}.screen-page-number{display:none}}
  </style></head><body>${pages.map((html, i) => html.replace('<section class="print-page">', `<section class="print-page"><div class="screen-page-number">Page ${i + 1}</div>`)).join("")}</body></html>`;
}

// ── Unique document identity ───────────────────────────────────────────────
// Every export gets its own document number + timestamp so two files are never
// named the same and the operator can trace any file back to the Export Log.
function stamp() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    slug: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`,
    human: d.toLocaleString(),
  };
}

function reportCode(title: string): string {
  const normalized = title.toLowerCase();
  if (/persons? with disability|pwd/.test(normalized)) return "PWD";
  if (/indigenous cultural communities|icc\/?ip/.test(normalized)) return "ICC-IP";
  if (/senior/.test(normalized)) return "SENIORS";
  if (/household/.test(normalized) && /barangay/.test(normalized)) return "HOUSEHOLDS-BY-BARANGAY";
  if (/person/.test(normalized) && /barangay/.test(normalized)) return "PERSONS-BY-BARANGAY";
  return title.replace(/&/g, " AND ").replace(/\([^)]*\)/g, "").replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").toUpperCase();
}

interface DocId {
  /** dataset year represented by the export */
  year: DataYear;
  /** unique title printed inside the document */
  docTitle: string;
  /** unique base filename */
  base: string;
  /** document control number */
  ref: string;
  generatedAt: string;
}

function resolveExportYear(title: string, subtitle?: string, dataYear?: DataYear): DataYear {
  if (dataYear === 2022 || dataYear === 2024) return dataYear;
  const yearMatch = `${title} ${subtitle || ""}`.match(/\b(2022|2024)\b/);
  return yearMatch ? Number(yearMatch[1]) as DataYear : getActiveYear();
}

function makeDocId(title: string, subtitle?: string, dataYear?: DataYear): DocId {
  const s = stamp();
  const id = makeExportId();
  const ref = `${s.slug}-${id.split("-").pop()!.slice(0, 5).toUpperCase()}`;
  const year = resolveExportYear(title, subtitle, dataYear);
  return {
    year,
    docTitle: `${title} — Doc. No. ${ref}`,
    base: `CBMS${year}-${safeName(municipality).toUpperCase()}_${reportCode(title)}_${s.slug}_${ref.split("-").pop()!.toUpperCase()}`,
    ref,
    generatedAt: s.human,
  };
}

// ── Password-protected ZIP wrapper ────────────────────────────────────────
async function packageProtected(
  innerFilename: string,
  data: Blob | string,
  meta: { format: "CSV" | "XLSX" | "PDF" | "DOCX" | "HTML"; title: string; rowCount: number; doc: DocId },
) {
  const password = generatePassword(16);
  const zipBlobWriter = new BlobWriter("application/zip");
  const writer = new ZipWriter(zipBlobWriter, { password, encryptionStrength: 3 });
  const reader = typeof data === "string" ? new TextReader(data) : new BlobReader(data);
  await writer.add(innerFilename, reader);
  const readme =
`Encrypted export from Local Data — Municipal CBMS Analytics.

Document No.  : ${meta.doc.ref}
Report        : ${meta.title}
File inside   : ${innerFilename}
Records       : ${meta.rowCount}
Format        : ${meta.format}
Generated     : ${meta.doc.generatedAt}
Municipality  : ${municipality}

To open: use 7-Zip, WinRAR, or the built-in extractor on macOS/Linux with the
password provided by the person who sent you this archive. This archive is
AES-256 encrypted; do not share the password over the same channel as the file.

${getSourceWatermark(meta.doc.year)}
`;
  await writer.add("README.txt", new TextReader(readme));
  await writer.close();
  const zipBlob = await zipBlobWriter.getData();
  const zipName = `${meta.doc.base}.protected.zip`;
  const bytes = zipBlob.size;

  const savedPath = await saveBlobWithPrompt(zipBlob, zipName);
  if (!savedPath && typeof window !== "undefined") return;
  addExportLog({
    id: makeExportId(),
    timestamp: new Date().toISOString(),
    filename: zipName,
    innerFile: innerFilename,
    format: meta.format,
    title: meta.doc.docTitle,
    rowCount: meta.rowCount,
    password,
    bytes,
    savedPath,
    encryption: "AES-256",
  });
  showPasswordToast(zipName, password, meta.format);
}

function showPasswordToast(filename: string, password: string, format: string) {
  emitExportPassword(filename, password, format);
}

// ── CSV ───────────────────────────────────────────────────────────────────
export async function exportCSV({ title, subtitle, columns, rows, note, summary, dataYear }: ExportPayload) {
  const doc = makeDocId(title, subtitle, dataYear);
  rows = sortRowsForExport(columns, rows);
  const header = columns.map((c) => `"${c.label}"`).join(",");
  const body = rows
    .map((r) => columns.map((c) => `"${String(getVal(r, c.key) ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
  const totalLine = `"TOTAL RECORDS",${rows.length}`;
  const summaryBlock = summary && summary.length
    ? `SUMMARY\n${summary.map((s) => `"${s.label}",${s.value},${s.percentage == null ? "" : `${s.percentage.toFixed(2)}%`}`).join("\n")}\n\n`
    : "";
  const csv =
    `${doc.docTitle}\n"Municipality","${municipality}"\n"Generated","${doc.generatedAt}"\n\n` +
    `${summaryBlock}${header}\n${body}\n${totalLine}\n\n${note || getSourceWatermark(doc.year)}`;
  await packageProtected(`${doc.base}.csv`, csv, { format: "CSV", title, rowCount: rows.length, doc });
}

// ── Excel (styled) ────────────────────────────────────────────────────────
const FONT = "Arial";
const BORDER_THIN = { style: "thin", color: { rgb: "D0D7E2" } } as any;
const box = { top: BORDER_THIN, bottom: BORDER_THIN, left: BORDER_THIN, right: BORDER_THIN };

const S = {
  title: {
    font: { name: FONT, sz: 15, bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "1E3A5F" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  subtitle: {
    font: { name: FONT, sz: 10, italic: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "2F5D8C" } },
    alignment: { horizontal: "left", vertical: "center" },
  },
  sectionHead: {
    font: { name: FONT, sz: 11, bold: true, color: { rgb: "1E3A5F" } },
    fill: { patternType: "solid", fgColor: { rgb: "DCE6F1" } },
    border: box,
  },
  summaryLabel: {
    font: { name: FONT, sz: 10 },
    fill: { patternType: "solid", fgColor: { rgb: "F4F7FB" } },
    border: box,
  },
  summaryValue: {
    font: { name: FONT, sz: 10, bold: true },
    fill: { patternType: "solid", fgColor: { rgb: "F4F7FB" } },
    alignment: { horizontal: "right" },
    border: box,
    numFmt: "#,##0",
  },
  th: {
    font: { name: FONT, sz: 10, bold: true, color: { rgb: "FFFFFF" } },
    fill: { patternType: "solid", fgColor: { rgb: "28407A" } },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: box,
  },
  td: { font: { name: FONT, sz: 10 }, border: box, alignment: { vertical: "top", wrapText: false } },
  tdAlt: {
    font: { name: FONT, sz: 10 },
    fill: { patternType: "solid", fgColor: { rgb: "F7F9FC" } },
    border: box,
    alignment: { vertical: "top", wrapText: false },
  },
  tdNum: { font: { name: FONT, sz: 10 }, border: box, alignment: { horizontal: "right" }, numFmt: "#,##0" },
  tdNumAlt: {
    font: { name: FONT, sz: 10 },
    fill: { patternType: "solid", fgColor: { rgb: "F7F9FC" } },
    border: box,
    alignment: { horizontal: "right" },
    numFmt: "#,##0",
  },
  total: {
    font: { name: FONT, sz: 10, bold: true, color: { rgb: "1E3A5F" } },
    fill: { patternType: "solid", fgColor: { rgb: "E4EAF4" } },
    border: { ...box, top: { style: "medium", color: { rgb: "1E3A5F" } } },
  },
  note: { font: { name: FONT, sz: 9, italic: true, color: { rgb: "5A6472" } } },
} as const;

const A1 = (r: number, c: number) => XLSX.utils.encode_cell({ r, c });

export async function exportXLSX({ title, subtitle, columns, rows, note, summary, dataYear }: ExportPayload) {
  const doc = makeDocId(title, subtitle, dataYear);
  rows = sortRowsForExport(columns, rows);
  const nCols = Math.max(columns.length, 3);
  const ws: XLSX.WorkSheet = {};
  const merges: XLSX.Range[] = [];
  let r = 0;

  const put = (row: number, col: number, v: any, style: any) => {
    const isNum = typeof v === "number" && Number.isFinite(v);
    ws[A1(row, col)] = { t: isNum ? "n" : "s", v: isNum ? v : v === null || v === undefined ? "" : String(v), s: style };
  };
  const bandRow = (row: number, style: any) => {
    for (let c = 0; c < nCols; c++) if (!ws[A1(row, c)]) ws[A1(row, c)] = { t: "s", v: "", s: style };
  };

  // Title band
  put(r, 0, doc.docTitle, S.title);
  bandRow(r, S.title);
  merges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
  r++;
  put(r, 0, `${subtitle || `Municipality: ${municipality}`}  ·  Generated: ${doc.generatedAt}`, S.subtitle);
  bandRow(r, S.subtitle);
  merges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
  r += 2;

  // Summary block
  if (summary && summary.length) {
    put(r, 0, "SUMMARY", S.sectionHead);
    put(r, 1, "Count / Value", S.sectionHead);
    put(r, 2, "Percentage Rate / Population", S.sectionHead);
    r++;
    for (const s of summary) {
      put(r, 0, s.label, S.summaryLabel);
      put(r, 1, typeof s.value === "number" ? s.value : s.value, S.summaryValue);
      put(r, 2, s.percentage == null ? "" : `${s.percentage.toFixed(2)}%`, S.summaryValue);
      r++;
    }
    r++;
  }

  // Header row
  columns.forEach((c, i) => put(r, i, c.label, S.th));
  const headerRow = r;
  r++;

  // Body
  rows.forEach((row, i) => {
    const alt = i % 2 === 1;
    columns.forEach((c, ci) => {
      const v = getVal(row, c.key);
      const isNum = typeof v === "number" && Number.isFinite(v);
      put(r, ci, v ?? "", isNum ? (alt ? S.tdNumAlt : S.tdNum) : alt ? S.tdAlt : S.td);
    });
    r++;
  });

  // Total row
  put(r, 0, `TOTAL: ${rows.length.toLocaleString()} record(s)`, S.total);
  bandRow(r, S.total);
  merges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
  r += 2;

  put(r, 0, note || getSourceWatermark(doc.year), S.note);
  merges.push({ s: { r, c: 0 }, e: { r, c: nCols - 1 } });
  r++;
  put(r, 0, `Document No. ${doc.ref}`, S.note);
  r++;

  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: r, c: nCols - 1 } });
  ws["!merges"] = merges;
  ws["!cols"] = Array.from({ length: nCols }, (_, i) => {
    const label = columns[i]?.label ?? "";
    const widest = rows.slice(0, 200).reduce((m, row) => {
      const v = String(getVal(row, columns[i]?.key ?? "") ?? "");
      return Math.max(m, v.length);
    }, label.length);
    return { wch: Math.min(46, Math.max(12, widest + 2)) };
  });
  ws["!rows"] = [{ hpt: 24 }, { hpt: 16 }];
  ws["!freeze"] = { xSplit: "0", ySplit: String(headerRow + 1) } as any;
  ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: headerRow, c: 0 }, e: { r: headerRow + rows.length, c: columns.length - 1 } }) };

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Report");
  const arrayBuffer = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
  const xlsxBlob = new Blob([arrayBuffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  await packageProtected(`${doc.base}.xlsx`, xlsxBlob, { format: "XLSX", title, rowCount: rows.length, doc });
}

// ── PDF ───────────────────────────────────────────────────────────────────
// jsPDF's bundled Helvetica does not reliably contain U+20B1 (₱). Keep the
// text ASCII-safe and draw the peso mark as a compact vector symbol only where
// the source data actually contains ₱. This avoids the old visual "P=" effect.
const pdfPeso = (text: string) => String(text ?? "").replace(/₱/g, "P");

function drawPesoMark(pdf: jsPDF, x: number, y: number) {
  const fontSizeMm = pdf.getFontSize() / 2.83465;
  const pWidth = Math.max(pdf.getTextWidth("P"), 1.8);
  // Draw the two peso bars across the stem/inner bowl area, not the entire P.
  const lineStart = x + 0.15;
  const lineEnd = x + Math.min(pWidth * 0.72, 1.55);
  pdf.setDrawColor(45, 52, 62);
  pdf.setLineWidth(Math.max(0.18, Math.min(0.3, fontSizeMm * 0.045)));
  pdf.line(lineStart, y - fontSizeMm * 0.43, lineEnd, y - fontSizeMm * 0.43);
  pdf.line(lineStart, y - fontSizeMm * 0.23, lineEnd, y - fontSizeMm * 0.23);
}

function drawPesoMarksInCell(pdf: jsPDF, original: string, cell: any) {
  const symbols: number[] = [];
  for (let i = 0; i < original.length; i++) if (original[i] === "₱") symbols.push(i);
  if (!symbols.length) return;

  const safe = pdfPeso(original);
  const lines = Array.isArray(cell.text) ? cell.text.map((v: any) => String(v)) : [safe];
  const cellPadding = 1.6;
  const halign = cell.styles.halign === "right" ? "right" : cell.styles.halign === "center" ? "center" : "left";
  const baseline = cell.y + cell.height / 2 + pdf.getFontSize() / 2.83465 * 0.35;

  for (const symbolIndex of symbols) {
    const target = symbolIndex;
    let lineIndex = 0;
    let lineOffset = target;
    for (let i = 0; i < lines.length; i++) {
      if (lineOffset <= lines[i].length) {
        lineIndex = i;
        break;
      }
      lineOffset -= lines[i].length;
    }
    const line = lines[Math.min(lineIndex, lines.length - 1)] || "";
    const prefix = line.slice(0, Math.min(lineOffset, line.length));
    const textWidth = pdf.getTextWidth(line);
    const prefixWidth = pdf.getTextWidth(prefix);
    const lineHeight = pdf.getFontSize() * 1.15 / 2.83465;
    const y = baseline + lineIndex * lineHeight;

    let startX = cell.x + cellPadding;
    if (halign === "right") startX = cell.x + cell.width - cellPadding - textWidth;
    if (halign === "center") startX = cell.x + (cell.width - textWidth) / 2;
    drawPesoMark(pdf, startX + prefixWidth, y);
  }
}


function xmlEscape(value: unknown) { return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&apos;"); }
function simpleDocxRun(text: unknown, bold = false) { return `<w:r><w:rPr>${bold?"<w:b/>":""}<w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${xmlEscape(text)}</w:t></w:r>`; }
function simpleDocxTable(columns: ExportColumn[], rows: Record<string, any>[], total?: number) {
  const cols = Math.max(1, columns.length); const widths = Array.from({length:cols},()=>Math.floor(10500/cols));
  const row = (cells: string[], header=false, totalRow=false) => `<w:tr><w:trPr>${header?"<w:tblHeader/>":""}<w:cantSplit/></w:trPr>${cells.map((cell,i)=>`<w:tc><w:tcPr><w:tcW w:w="${widths[i]}" w:type="dxa"/>${header||totalRow?`<w:shd w:fill="${header?"DFE5EC":"EEF1F5"}"/>`:""}</w:tcPr><w:p><w:pPr><w:spacing w:after="0"/></w:pPr>${simpleDocxRun(cell, header||totalRow)}</w:p></w:tc>`).join("")}</w:tr>`;
  const body=rows.length?rows.map(r=>row(columns.map(c=>String(getVal(r,c.key)??"")))).join(""):row(["No records",...columns.slice(1).map(()=>"")]);
  return `<w:tbl><w:tblPr><w:tblW w:w="10500" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders><w:top w:val="single" w:sz="5" w:color="AEB8C4"/><w:left w:val="single" w:sz="5" w:color="AEB8C4"/><w:bottom w:val="single" w:sz="5" w:color="AEB8C4"/><w:right w:val="single" w:sz="5" w:color="AEB8C4"/><w:insideH w:val="single" w:sz="4" w:color="C7CED7"/><w:insideV w:val="single" w:sz="4" w:color="C7CED7"/></w:tblBorders></w:tblPr><w:tblGrid>${widths.map(w=>`<w:gridCol w:w="${w}"/>`).join("")}</w:tblGrid>${row(columns.map(c=>c.label),true)}${body}${row([`TOTAL: ${(total??rows.length).toLocaleString()} record(s)`,...columns.slice(1).map(()=>"")],false,true)}</w:tbl>`;
}
async function buildGenericDocx(payload: GroupedExportPayload): Promise<Blob> {
  const parts:string[]=[];
  parts.push(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:after="100"/></w:pPr>${simpleDocxRun(municipality,true)}</w:p>`);
  parts.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${simpleDocxRun(payload.title,true)}</w:p>`);
  if(payload.subtitle) parts.push(`<w:p><w:pPr><w:jc w:val="center"/></w:pPr>${simpleDocxRun(payload.subtitle)}</w:p>`);
  if(payload.summary?.length){ parts.push(`<w:p>${simpleDocxRun("SUMMARY",true)}</w:p>`); parts.push(simpleDocxTable([{key:"label",label:"Indicator"},{key:"value",label:"Count / Value"},{key:"percentage",label:"Percentage Rate / Population"}], payload.summary.map(s=>({label:s.label,value:s.value,percentage:s.percentage==null?"":`${s.percentage.toFixed(2)}%`})), payload.summary.length)); }
  if(payload.barangaySummaryColumns?.length && payload.barangaySummaryRows?.length){ parts.push(`<w:p>${simpleDocxRun("BY BARANGAY SUMMARY",true)}</w:p>`); parts.push(simpleDocxTable(payload.barangaySummaryColumns,payload.barangaySummaryRows)); }
  const groups=payload.groups?.length?payload.groups:[{title:"Report",rows:payload.rows}];
  for(const g of groups){ parts.push(`<w:p><w:pPr><w:pageBreakBefore/></w:pPr>${simpleDocxRun(`Barangay: ${g.title}`,true)}</w:p>`); parts.push(simpleDocxTable(payload.columns,g.rows)); }
  parts.push(`<w:p><w:pPr><w:spacing w:before="160"/></w:pPr>${simpleDocxRun(`Source: ${getSourceWatermark(resolveExportYear(payload.title,payload.subtitle,payload.dataYear))}`)}</w:p>`);
  const docXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${parts.join("")}<w:sectPr><w:pgSz w:w="12240" w:h="18720"/><w:pgMar w:top="720" w:right="900" w:bottom="720" w:left="900"/></w:sectPr></w:body></w:document>`;
  const ct=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;
  const rels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`;
  const zw=new ZipWriter(new BlobWriter("application/vnd.openxmlformats-officedocument.wordprocessingml.document"));
  await zw.add("[Content_Types].xml",new TextReader(ct)); await zw.add("_rels/.rels",new TextReader(rels)); await zw.add("word/document.xml",new TextReader(docXml));
  return await zw.close();
}
export async function exportDOCX(payload: GroupedExportPayload) {
  const doc=makeDocId(payload.title, payload.subtitle, payload.dataYear); const blob=await buildGenericDocx(payload); const inner=`${doc.base}.docx`;
  await packageProtected(inner, blob, {format:"DOCX", title:payload.title, rowCount:payload.rows.length, doc});
}

export function printPayload(payload: GroupedExportPayload) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("cbms-print-preview", { detail: { title: payload.title, html: buildPrintHtml(payload) } }));
}

export async function exportPDF(payload: GroupedExportPayload) {
  const { title, subtitle, columns, rows, note, summary, barangaySummaryColumns, barangaySummaryRows, groups, dataYear } = payload;
  const docId = makeDocId(title, subtitle, dataYear);
  const FOLIO_WIDTH_MM = 215.9;
  const FOLIO_HEIGHT_MM = 330.2;
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [FOLIO_WIDTH_MM, FOLIO_HEIGHT_MM] });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 14;
  const source = pdfPeso(note || getSourceWatermark(docId.year));
  const usableWidth = pageWidth - margin * 2;

  const drawReportHeader = (sectionTitle?: string, continuation = false) => {
    let y = 17;
    pdf.setTextColor(25, 34, 48);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(sectionTitle ? 13.5 : 15);
    const heading = sectionTitle ? `BARANGAY: ${sectionTitle}` : pdfPeso(title);
    const headingLines = pdf.splitTextToSize(heading, usableWidth);
    pdf.text(headingLines, margin, y);
    y += headingLines.length * 5.6 + 1.5;

    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(8.2);
    pdf.setTextColor(86, 96, 110);
    const line = continuation
      ? `${pdfPeso(subtitle || `Municipality: ${municipality}`)} · Continuation`
      : pdfPeso(subtitle || `Municipality: ${municipality}`);
    const lines = pdf.splitTextToSize(line, usableWidth);
    pdf.text(lines, margin, y);
    y += lines.length * 4 + 4;
    return y;
  };

  const drawSectionFooter = () => addPageFooter(pdf, docId.ref);

  // Page 1 is deliberately reserved for report-level summary information.
  let y = drawReportHeader();
  if (summary?.length) {
    autoTable(pdf, {
      startY: y,
      head: [["Summary", "Count / Value", "Percentage Rate (%Rate) / Population (%Population)"]],
      body: summary.map((item) => [
        pdfPeso(String(item.label)),
        typeof item.value === "number" ? item.value.toLocaleString() : pdfPeso(String(item.value)),
        item.percentage == null ? "-" : `${item.percentage.toFixed(2)}%`,
      ]),
      margin: { left: margin, right: margin, bottom: 24 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 8.2, cellPadding: 2.4, lineColor: [190, 196, 204], lineWidth: 0.15, textColor: [40, 45, 52], valign: "middle" },
      headStyles: { fillColor: [226, 231, 237], textColor: [25, 30, 38], fontStyle: "bold" },
      columnStyles: { 1: { halign: "right", fontStyle: "bold" }, 2: { halign: "right", fontStyle: "bold" } },
      didDrawPage: drawSectionFooter,
    });
    y = (pdf as any).lastAutoTable.finalY + 7;
  }

  const sbCols = barangaySummaryColumns || (rows.length ? columns : []);
  const sbRows = barangaySummaryRows || rows.filter((r) => String(r._report_section || "") === "By Barangay Summary");
  if (sbCols.length && sbRows.length) {
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10.5);
    pdf.setTextColor(25, 34, 48);
    pdf.text("BY BARANGAY SUMMARY", margin, y);
    y += 4;
    autoTable(pdf, {
      startY: y,
      head: [sbCols.map((c) => pdfPeso(c.label))],
      body: sortRowsForExport(sbCols, sbRows).map((r) => sbCols.map((c) => pdfPeso(String(getVal(r, c.key) ?? "")))),
      margin: { left: margin, right: margin, bottom: 24 },
      theme: "grid",
      styles: { font: "helvetica", fontSize: 7.7, cellPadding: 2.1, lineColor: [190, 196, 204], lineWidth: 0.15, textColor: [45, 50, 58], valign: "middle", overflow: "linebreak" },
      headStyles: { fillColor: [226, 231, 237], textColor: [25, 30, 38], fontStyle: "bold", valign: "middle" },
      alternateRowStyles: { fillColor: [249, 250, 251] },
      didDrawPage: drawSectionFooter,
    });
    y = (pdf as any).lastAutoTable.finalY + 5;
  }

  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);
  pdf.setTextColor(90, 96, 104);
  const metaY = Math.min(y, pageHeight - 26);
  pdf.text(`System generated: ${docId.generatedAt}`, margin, metaY);
  pdf.text(`Source: ${source}`, margin, metaY + 4.2);
  pdf.text(`Document No. ${docId.ref}`, margin, metaY + 8.4);
  drawSectionFooter();

  const sortedGroups = (groups || []).slice().sort((a, b) => compareText(a.title, b.title));

  // Grouped mode: each barangay is an independent section. The first page of a
  // barangay starts on a fresh page; the barangay title is redrawn on every
  // continuation page by autoTable's didDrawPage hook.
  if (sortedGroups.length) {
    for (const group of sortedGroups) {
      const groupRows = sortRowsForExport(columns, group.rows || []);
      if (!groupRows.length) continue;
      pdf.addPage([FOLIO_WIDTH_MM, FOLIO_HEIGHT_MM], "portrait");
      const groupY = drawReportHeader(group.title);

      const groupColumns = columns.map((c) => ({ ...c, label: pdfPeso(c.label) }));
      const groupOutputRows = groupRows.map((r) => groupColumns.map((c) => pdfPeso(String(getVal(r, c.key) ?? ""))));
      const numericIndexes = new Set(
        columns.map((c, i) => groupRows.some((r) => typeof getVal(r, c.key) === "number") ? i : -1).filter((i) => i >= 0),
      );

      autoTable(pdf, {
        startY: groupY,
        head: [groupColumns.map((c) => c.label)],
        body: groupOutputRows,
        foot: [[`TOTAL: ${groupRows.length.toLocaleString()} record(s)`, ...groupColumns.slice(1).map(() => "")]],
        margin: { top: 43, left: margin, right: margin, bottom: 24 },
        tableWidth: "auto",
        theme: "grid",
        styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.15, lineColor: [184, 190, 198], lineWidth: 0.14, textColor: [45, 50, 58], valign: "middle", overflow: "linebreak", minCellHeight: 6 },
        headStyles: { fillColor: [226, 231, 237], textColor: [25, 30, 38], fontStyle: "bold", halign: "left", valign: "middle", cellPadding: 2.3, lineColor: [150, 156, 164], lineWidth: 0.18 },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        bodyStyles: { minCellHeight: 6 },
        footStyles: { fillColor: [242, 243, 245], textColor: [30, 35, 42], fontStyle: "bold", lineColor: [140, 146, 154], lineWidth: 0.2 },
        columnStyles: Object.fromEntries(Array.from(numericIndexes).map((i) => [i, { halign: "right" }])),
        didDrawPage: () => {
          // The barangay heading belongs only to the first page of this
          // section. AutoTable repeats the column header on continuation pages
          // while the footer remains on every page. This keeps long barangays
          // visually grouped without repeating the large barangay title.
          drawSectionFooter();
        },
      });
    }
  } else {
    // Legacy/general export mode: retain a safe, readable flat table for routes
    // that are not grouped by barangay.
    const flatRows = sortRowsForExport(columns, rows);
    if (flatRows.length) {
      pdf.addPage([FOLIO_WIDTH_MM, FOLIO_HEIGHT_MM], "portrait");
      const flatY = drawReportHeader();
      const outputColumns = columns.map((c) => ({ ...c, label: pdfPeso(c.label) }));
      const outputRows = flatRows.map((r) => outputColumns.map((c) => pdfPeso(String(getVal(r, c.key) ?? ""))));
      const numericIndexes = new Set(columns.map((c, i) => flatRows.some((r) => typeof getVal(r, c.key) === "number") ? i : -1).filter((i) => i >= 0));
      autoTable(pdf, {
        startY: flatY,
        head: [outputColumns.map((c) => c.label)],
        body: outputRows,
        foot: [[`TOTAL: ${flatRows.length.toLocaleString()} record(s)`, ...outputColumns.slice(1).map(() => "")]],
        margin: { top: 43, left: margin, right: margin, bottom: 24 },
        theme: "grid",
        styles: { font: "helvetica", fontSize: 7.2, cellPadding: 2.1, lineColor: [184, 190, 198], lineWidth: 0.14, textColor: [45, 50, 58], valign: "middle", overflow: "linebreak", minCellHeight: 6 },
        headStyles: { fillColor: [226, 231, 237], textColor: [25, 30, 38], fontStyle: "bold" },
        alternateRowStyles: { fillColor: [250, 250, 250] },
        footStyles: { fillColor: [242, 243, 245], textColor: [30, 35, 42], fontStyle: "bold" },
        columnStyles: Object.fromEntries(Array.from(numericIndexes).map((i) => [i, { halign: "right" }])),
        didDrawPage: () => { drawReportHeader(); drawSectionFooter(); },
      });
    }
  }

  const pdfBlob = pdf.output("blob");
  await packageProtected(`${docId.base}.pdf`, pdfBlob, { format: "PDF", title, rowCount: rows.length, doc: docId });
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
