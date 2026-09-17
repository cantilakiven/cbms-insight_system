/** Runtime CBMS data store.
 *
 * The large CBMS JSON files are deliberately NOT imported by the application.
 * Operators choose the 2022 and/or 2024 folders at runtime. Normalized data is
 * cached in IndexedDB so it survives restarts without putting the source JSON
 * inside the Electron/Vite build.
 */
import { convertLegacy2022, isLegacy2022Record } from "../cbms-legacy-2022";

export type DataYear = 2022 | 2024;
export const DATASET_KEYS = ["barangays", "barangayList", "households", "childMortality", "interviews", "persons", "personsTvet"] as const;
export type DatasetKey = typeof DATASET_KEYS[number];
export type Datasets = Record<DatasetKey, any[]>;

export const DATASET_LABELS: Record<DatasetKey, string> = {
  barangays: "Barangays",
  barangayList: "Barangay List",
  households: "Households",
  childMortality: "Child Mortality",
  interviews: "Interviews",
  persons: "Persons",
  personsTvet: "Persons — TVET",
};

export const coverageLabel = "Selected Local Area";
const empty = (): Datasets => Object.fromEntries(DATASET_KEYS.map((k) => [k, []])) as unknown as Datasets;

const yearStores: Record<DataYear, Datasets> = { 2022: empty(), 2024: empty() };
let activeYear: DataYear = 2022;
let activeBarangay = "";
let dataVersion = 0;
let loadedAt: Date | null = null;
const listeners = new Set<() => void>();

export const datasets = yearStores[activeYear];
/** Legacy-compatible live barangay list used by older routes. */
export let barangays: any[] = [];
export let detectedFiles: { filename: string; recordCount: number; year?: DataYear; classifiedAs?: string | null; path?: string }[] = [];
export let invalidFiles: any[] = [];
export let repairedFiles: any[] = [];
let importReport: ImportReport | null = null;
let readyYears = new Set<DataYear>();

export interface LoadProgress { phase: "saving" | "parsing" | "indexing" | "done"; step: string; percent: number; rows: number; total?: number; index?: number; }
export interface ImportReport {
  at: string; filesProcessed: number; bytesProcessed: number; durationMs: number; totalRecords: number;
  datasets: { key: DatasetKey; label: string; files: string[]; records: number; fields: { field: string; missing: number; total: number }[] }[];
  normalized: { nulls: number; trimmedStrings: number; employmentStatus: number; underemploymentStatus: number };
  joins: { personsWithoutHousehold: number; householdsWithoutPersons: number; personsMissingName: number; personsMissingAge: number; duplicatePersonKeys: number };
  unrecognizedFiles: string[];
}

function notify() { dataVersion++; for (const cb of listeners) cb(); }
export const subscribeData = (cb: () => void) => { listeners.add(cb); return () => listeners.delete(cb); };
export const getDataVersion = () => dataVersion;
export let dataLoadedAt: Date | null = null;
export function isDataLoaded() { return readyYears.size > 0; }
export function getAvailableYears(): DataYear[] { return ([2022, 2024] as DataYear[]).filter((y) => readyYears.has(y)); }
export function getActiveYear() { return activeYear; }
export function setActiveYear(year: DataYear) { activeYear = year; (Object.assign(datasets, yearStores[activeYear])); barangays = getAvailableBarangays(year); notify(); }
export function getActiveBarangay() { return activeBarangay; }
export function setActiveBarangay(value: string) { activeBarangay = value || ""; notify(); }
export function getYearDatasets(year: DataYear) { return yearStores[year]; }
export function getYearDataHealth(year: DataYear) {
  const d = yearStores[year];
  return { year, persons: d.persons.length, households: d.households.length, barangays: d.barangays.length, files: detectedFiles.filter((f) => f.year === year).length, totalRecords: DATASET_KEYS.reduce((n,k)=>n+d[k].length,0) };
}
export function getAvailableBarangays(year: DataYear = activeYear) {
  const d = yearStores[year];
  const m = new Map<string, any>();
  for (const row of d.barangays) if (row?.area_name) m.set(row.area_code || row.area_name, row);
  for (const row of d.persons) if (row?.area_name && !m.has(row.area_code || row.area_name)) m.set(row.area_code || row.area_name, { area_name: row.area_name, area_code: row.area_code });
  for (const row of d.households) if (row?.area_name && !m.has(row.area_code || row.area_name)) m.set(row.area_code || row.area_name, { area_name: row.area_name, area_code: row.area_code });
  return Array.from(m.values()).sort((a,b)=>String(a.area_name||"").localeCompare(String(b.area_name||""), undefined, {numeric:true, sensitivity:"base"}));
}
export function getHouseholdIncome(h: any): number | null {
  const candidates = [h?.h06_total_family_income, h?.H06_TOTAL_FAMILY_INCOME, h?.legacy_raw?.SECTION_H?.H06_TOTAL_FAMILY_INCOME, h?.legacy_raw?.H06_TOTAL_FAMILY_INCOME];
  for (const v of candidates) { const n = Number(v); if (v !== null && v !== undefined && v !== "" && Number.isFinite(n)) return n; }
  return null;
}
export function getYearIncomeSummary(year: DataYear, barangay = "") {
  const hh = yearStores[year].households.filter((h:any)=>!barangay||h.area_name===barangay);
  const reported = hh.filter((h:any)=>getHouseholdIncome(h)!==null);
  return { reported: reported.length, reportedHouseholds: reported.length, below15: reported.filter(h=>getHouseholdIncome(h)!<15000).length, below20: reported.filter(h=>getHouseholdIncome(h)!<20000).length };
}
export function householdKey(h: any) { return `${h?.area_code||""}-${h?.husn||""}-${h?.hsn||""}`; }
export function personsByHousehold(year: DataYear = activeYear) {
  const m = new Map<string, any[]>();
  for (const p of yearStores[year].persons) { const k=householdKey(p); if(!m.has(k))m.set(k,[]); m.get(k)!.push(p); }
  return m;
}
export function getPersonFullName(p:any) { return [p?.a01_last_name,p?.a01_first_name,p?.a01_middle_name,p?.a01_suffix].filter(Boolean).join(", "); }
export function getSourceWatermark(scope:any = activeYear) {
  const label = scope === "comparison"
    ? "Source: Authorized CBMS JSON datasets · CBMS 2022 and CBMS 2024"
    : `Source: Authorized CBMS JSON dataset · CBMS ${scope}`;
  return `${label}`;
}

const DB_NAME = "cbms-insights-runtime";
const DB_VERSION = 2;
const openDb = () => new Promise<IDBDatabase>((resolve,reject)=>{
  if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB unavailable"));
  const req=indexedDB.open(DB_NAME,DB_VERSION);
  req.onupgradeneeded=()=>{ const db=req.result; if(!db.objectStoreNames.contains("years")) db.createObjectStore("years"); if(!db.objectStoreNames.contains("meta")) db.createObjectStore("meta"); };
  req.onsuccess=()=>resolve(req.result); req.onerror=()=>reject(req.error||new Error("IndexedDB open failed"));
});
async function dbPut(year: DataYear, data: Datasets) { const db=await openDb(); await new Promise<void>((res,rej)=>{ const tx=db.transaction("years","readwrite"); tx.objectStore("years").put(data, String(year)); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); db.close(); }
async function dbGet(year: DataYear): Promise<Datasets|null> { try { const db=await openDb(); return await new Promise((res,rej)=>{ const tx=db.transaction("years","readonly"); const r=tx.objectStore("years").get(String(year)); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); }); } catch { return null; } }
async function dbPutMeta(value: any) { const db=await openDb(); await new Promise<void>((res,rej)=>{ const tx=db.transaction("meta","readwrite"); tx.objectStore("meta").put(value,"runtime"); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }); db.close(); }
async function dbGetMeta(): Promise<any|null> { try { const db=await openDb(); return await new Promise((res,rej)=>{ const tx=db.transaction("meta","readonly"); const r=tx.objectStore("meta").get("runtime"); r.onsuccess=()=>res(r.result||null); r.onerror=()=>rej(r.error); }); } catch { return null; } }
async function dbClear(){ try { const db=await openDb(); await new Promise<void>((res,rej)=>{const tx=db.transaction(["years","meta"],"readwrite"); tx.objectStore("years").clear(); tx.objectStore("meta").clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)});db.close(); } catch {} }
async function persistRuntimeMeta() {
  await dbPutMeta({
    version: 1,
    detectedFiles,
    dataLoadedAt: dataLoadedAt ? dataLoadedAt.toISOString() : null,
    importReport,
    readyYears: Array.from(readyYears),
  });
}

function replaceYearData(year: DataYear, data: Datasets) {
  yearStores[year]=data;
  readyYears.add(year);
  if (activeYear===year) { Object.assign(datasets, data); barangays = getAvailableBarangays(year); }
}

function mergedLegacy(records: any[]) {
  const byKey = new Map<string, any>();
  const merge = (a:any,b:any):any => {
    if (Array.isArray(a)&&Array.isArray(b)) {
      const n=Math.max(a.length,b.length); const out=[]; for(let i=0;i<n;i++) out[i]=i<a.length&&i<b.length?merge(a[i],b[i]):(i<a.length?a[i]:b[i]); return out;
    }
    if (a&&typeof a==="object"&&b&&typeof b==="object") { const out={...a}; for(const [k,v] of Object.entries(b)) out[k]=k in out?merge(out[k],v):v; return out; }
    return b!==null&&b!==undefined&&b!=="" ? b : a;
  };
  for (const r of records) { const k=String(r?.key||r?.uuid||JSON.stringify(r)); byKey.set(k, byKey.has(k)?merge(byKey.get(k),r):r); }
  return Array.from(byKey.values());
}

function classify(filename:string, sample:any): DatasetKey|null {
  const n=filename.toLowerCase();
  if (isLegacy2022Record(sample) || isLegacyName(filename)) return "households";
  if (n.includes("person_record_tvet")) return "personsTvet";
  if (n.includes("person_record")) return "persons";
  if (n.includes("household_record_child_mortality")) return "childMortality";
  if (n.includes("household_record")) return "households";
  if (n.includes("interview_record")) return "interviews";
  if (n.includes("barangay_record_list")) return "barangayList";
  if (n.includes("barangay_record")) return "barangays";
  return null;
}

function normalize2024(rawByKey: Record<string,any[]>, namesByKey: Record<string,string[]>) : Datasets {
  const out=empty();
  for(const key of DATASET_KEYS) if(rawByKey[key]) out[key]=rawByKey[key];
  // Some exports provide barangay data only through persons/households.
  if(!out.barangays.length){ const seen=new Map(); for(const r of [...out.persons,...out.households]) if(r?.area_code&&!seen.has(r.area_code)) seen.set(r.area_code,{area_code:r.area_code,area_name:r.area_name,region_code:r.region_code,province_code:r.province_code,city_mun_code:r.city_mun_code,barangay_code:r.barangay_code}); out.barangays=[...seen.values()]; }
  return out;
}

async function readFiles(files: File[], yearHint: DataYear, progress?: (p:LoadProgress)=>void): Promise<ImportReport> {
  const started=performance.now(); invalidFiles=[]; repairedFiles=[]; const groups: File[] = files.filter(f=>/\.json$/i.test(f.name));
  const total=groups.length; const legacyMerged = new Map<string, any>(); const rawBy: Record<string,any[]> = {};
  let bytes=0, records=0; const reportFiles=[] as any[]; const unrecognized:string[]=[];
  const mergeLegacyRecord = (a:any,b:any):any => {
    if (Array.isArray(a)&&Array.isArray(b)) { const n=Math.max(a.length,b.length); const out=[]; for(let i=0;i<n;i++) out[i]=i<a.length&&i<b.length?mergeLegacyRecord(a[i],b[i]):(i<a.length?a[i]:b[i]); return out; }
    if (a&&typeof a==="object"&&b&&typeof b==="object") { const out={...a}; for(const [k,v] of Object.entries(b)) out[k]=k in out?mergeLegacyRecord(out[k],v):v; return out; }
    return b!==null&&b!==undefined&&b!=="" ? b : a;
  };
  for(let i=0;i<groups.length;i++){
    const f=groups[i]; bytes+=f.size; progress?.({phase:"parsing",step:`Reading ${f.name}`,percent:15+Math.round(i/Math.max(1,total)*60),rows:records,total,index:i});
    try {
      const text=await f.text(); const json=JSON.parse(text); const arr=Array.isArray(json)?json:[]; records+=arr.length;
      const key=classify(f.name,arr[0]);
      
      reportFiles.push({filename:f.name,recordCount:arr.length,year:yearHint,classifiedAs:key,path:(f as any).webkitRelativePath||f.name});
      if(key){ if(yearHint===2022) { for (const record of arr) { const k=String(record?.key||record?.uuid||JSON.stringify(record)); const existing=legacyMerged.get(k); legacyMerged.set(k, existing ? mergeLegacyRecord(existing, record) : record); } } else { (rawBy[key] ||= []).push(...arr); } } else unrecognized.push(f.name);
    } catch(e:any){ invalidFiles.push({filename:f.name,reason:e?.message||"Invalid JSON"}); }
  }
  progress?.({phase:"indexing",step:`Building CBMS ${yearHint} indexes`,percent:82,rows:records,total,index:total});
  let normalized: Datasets;
  if(yearHint===2022){ const merged=Array.from(legacyMerged.values()); const batch=convertLegacy2022(merged,"Imported CBMS 2022 folder"); normalized=batch as Datasets; }
  else normalized=normalize2024(rawBy,{});
  replaceYearData(yearHint, normalized); detectedFiles=detectedFiles.filter(f=>f.year!==yearHint).concat(reportFiles); loadedAt=new Date(); dataLoadedAt=loadedAt;
  await dbPut(yearHint,normalized);
  const report: ImportReport = { at:new Date().toISOString(),filesProcessed:groups.length,bytesProcessed:bytes,durationMs:Math.round(performance.now()-started),totalRecords:records,
    datasets:DATASET_KEYS.map(k=>({key:k,label:DATASET_LABELS[k],files:groups.filter(f=>classify(f.name,[])===k).map(f=>f.name),records:normalized[k].length,fields:[]})),
    normalized:{nulls:0,trimmedStrings:0,employmentStatus:0,underemploymentStatus:0},
    joins:{personsWithoutHousehold:0,householdsWithoutPersons:0,personsMissingName:0,personsMissingAge:0,duplicatePersonKeys:0},unrecognizedFiles:unrecognized };
  importReport=report;
  await persistRuntimeMeta();
  progress?.({phase:"done",step:`CBMS ${yearHint} import complete`,percent:100,rows:records,total,index:total}); notify();
  return report;
}

export async function importFiles(files: File[] | FileList, progress?: (p:LoadProgress)=>void) {
  const list=Array.from(files as any as File[]).filter((f:any)=>/\.json$/i.test(f.name));
  const buckets: Record<DataYear, File[]> = { 2022: [], 2024: [] };

  for (const f of list) {
    let year: DataYear = isLegacyName(f.name) ? 2022 : 2024;
    if (year === 2024) {
      try {
        const sample = JSON.parse(await f.text());
        const first = Array.isArray(sample) ? sample[0] : sample;
        if (isLegacy2022Record(first)) year = 2022;
      } catch { /* invalid JSON will be reported by readFiles */ }
    }
    buckets[year].push(f);
  }

  const reports: ImportReport[] = [];
  for (const year of [2022, 2024] as DataYear[]) {
    if (!buckets[year].length) continue;
    reports.push(await readFiles(buckets[year], year, progress));
    setActiveYear(year);
  }

  if (reports.length > 1) {
    const datasetsMerged = DATASET_KEYS.map((key) => {
      const parts = reports.map((r) => r.datasets.find((d) => d.key === key)).filter(Boolean) as any[];
      return { key, label: DATASET_LABELS[key], files: parts.flatMap((p) => p.files), records: parts.reduce((n, p) => n + p.records, 0), fields: [] };
    });
    importReport = {
      at: new Date().toISOString(),
      filesProcessed: reports.reduce((n, r) => n + r.filesProcessed, 0),
      bytesProcessed: reports.reduce((n, r) => n + r.bytesProcessed, 0),
      durationMs: reports.reduce((n, r) => n + r.durationMs, 0),
      totalRecords: reports.reduce((n, r) => n + r.totalRecords, 0),
      datasets: datasetsMerged,
      normalized: { nulls: 0, trimmedStrings: 0, employmentStatus: 0, underemploymentStatus: 0 },
      joins: { personsWithoutHousehold: 0, householdsWithoutPersons: 0, personsMissingName: 0, personsMissingAge: 0, duplicatePersonKeys: 0 },
      unrecognizedFiles: reports.flatMap((r) => r.unrecognizedFiles),
    };
    await persistRuntimeMeta();
    notify();
  }
}
function isLegacyName(n:string){ return /(^|[_\s-])(a|b|c)\.json$/i.test(n) || /097208.*\.json$/i.test(n); }

export async function loadFromCache(progress?: (p:LoadProgress)=>void){
  let any=false;
  for(const y of [2022,2024] as DataYear[]){
    progress?.({phase:"parsing",step:`Loading saved CBMS ${y} data`,percent:y===2022?20:60,rows:0});
    const d=await dbGet(y);
    if(d?.persons?.length||d?.households?.length||d?.barangays?.length){ replaceYearData(y,d); any=true; }
  }
  const meta = await dbGetMeta();
  if (meta?.detectedFiles && Array.isArray(meta.detectedFiles)) detectedFiles = meta.detectedFiles;
  if (meta?.importReport) importReport = meta.importReport;
  if (meta?.dataLoadedAt) dataLoadedAt = new Date(meta.dataLoadedAt);
  if (Array.isArray(meta?.readyYears)) {
    for (const y of meta.readyYears) if (y === 2022 || y === 2024) readyYears.add(y);
  }
  any = any || readyYears.size > 0;
  if(any){loadedAt=dataLoadedAt || new Date(); dataLoadedAt=loadedAt; setActiveYear(readyYears.has(2022)?2022:2024); notify();}
  return any;
}
export async function clearData(){ await dbClear(); for(const y of [2022,2024] as DataYear[]){yearStores[y]=empty();} readyYears.clear(); Object.assign(datasets,yearStores[activeYear]); barangays = []; detectedFiles=[]; importReport=null; loadedAt=null; dataLoadedAt=null; notify(); }
export function getImportReport(){return importReport;}
// Kept for compatibility with older screens. Runtime data is never bundled.
export async function loadBundled2022(){ return false; }
export async function loadBundled2024(){ return false; }
