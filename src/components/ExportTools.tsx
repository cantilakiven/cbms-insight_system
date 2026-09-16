import { useEffect, useRef, useState } from "react";
import { Check, Clipboard, Eye, EyeOff, FileType2, Printer, RefreshCw, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { buildPrintHtml, exportDOCX, type GroupedExportPayload, type ExportPayload } from "@/lib/cbms-export";
import { emitPrintPreview } from "@/lib/export-log";

export function ExportPasswordModal() {
  const [detail, setDetail] = useState<{ filename: string; password: string; format: string } | null>(null);
  const [revealed, setRevealed] = useState(true);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setDetail(d);
      setRevealed(true);
      setCopied(false);
    };
    window.addEventListener("cbms-export-password", onEvent);
    return () => window.removeEventListener("cbms-export-password", onEvent);
  }, []);
  if (!detail) return null;
  const copy = async () => { try { await navigator.clipboard.writeText(detail.password); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {} };
  return <div className="fixed inset-0 z-[220] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="w-full max-w-xl overflow-hidden rounded-2xl border border-slate-300/20 bg-card shadow-2xl">
      <div className="bg-gradient-to-br from-primary/20 via-card to-card px-6 py-5">
        <div className="flex items-start justify-between gap-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow"><ShieldCheck className="h-6 w-6" /></div><div><div className="text-[10px] font-black uppercase tracking-[.18em] text-primary">Secure export</div><h2 className="mt-1 text-xl font-black">Your export password is ready</h2></div></div><button onClick={() => setDetail(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-border bg-background/70"><X className="h-4 w-4" /></button></div>
        <p className="mt-4 text-sm leading-6 text-muted-foreground">The {detail.format} file was encrypted and saved. Keep this password separate from the exported archive.</p>
      </div>
      <div className="space-y-4 px-6 py-5">
        <div className="rounded-xl border border-border bg-muted/35 p-4"><div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">File</div><div className="mt-1 break-all font-mono text-xs">{detail.filename}</div></div>
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4"><div className="flex items-center justify-between gap-2"><div className="text-[10px] font-black uppercase tracking-wider text-primary">AES-256 password</div><button onClick={() => setRevealed(v=>!v)} className="inline-flex items-center gap-1 text-[11px] font-bold text-muted-foreground hover:text-foreground">{revealed ? <EyeOff className="h-3.5 w-3.5"/> : <Eye className="h-3.5 w-3.5"/>}{revealed ? "Hide" : "Show"}</button></div><div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-3"><code className="min-w-0 flex-1 break-all font-mono text-sm font-black tracking-wide">{revealed ? detail.password : "•".repeat(Math.min(18, detail.password.length))}</code><Button size="sm" onClick={copy}>{copied ? <Check className="h-4 w-4"/> : <Clipboard className="h-4 w-4"/>}{copied ? "Copied" : "Copy"}</Button></div><div className="mt-2 text-[11px] text-muted-foreground">The password was also recorded in the local Export Log.</div></div>
      </div>
      <div className="flex justify-end gap-2 border-t border-border bg-muted/30 px-6 py-4"><Button variant="outline" onClick={() => setDetail(null)}>Close</Button><Button onClick={copy}><Clipboard className="h-4 w-4"/> Copy password</Button></div>
    </div>
  </div>;
}

type PrinterInfo = { name: string; displayName?: string; description?: string; isDefault?: boolean; status?: number };
type PaperSizeKey = "folio" | "a4" | "letter" | "legal" | "a3";
type PrintOptions = { paperSize: PaperSizeKey; orientation: "portrait" | "landscape" };

const PAPER_SIZES: Record<PaperSizeKey, { label: string; widthMm: number; heightMm: number; note: string }> = {
  folio: { label: "Folio", widthMm: 215.9, heightMm: 330.2, note: "215.9 × 330.2 mm" },
  a4: { label: "A4", widthMm: 210, heightMm: 297, note: "210 × 297 mm" },
  letter: { label: "Letter", widthMm: 215.9, heightMm: 279.4, note: "8.5 × 11 in" },
  legal: { label: "Legal", widthMm: 215.9, heightMm: 355.6, note: "8.5 × 14 in" },
  a3: { label: "A3", widthMm: 297, heightMm: 420, note: "297 × 420 mm" },
};

declare global { interface Window { electronPrint?: { getPrinters: () => Promise<PrinterInfo[]>; printHtml: (html: string, printerName?: string, options?: PrintOptions) => Promise<{ ok: boolean; error?: string }> } } }

export function PrintPreviewModal() {
  const [detail, setDetail] = useState<{ html: string; title: string } | null>(null);
  const [printers, setPrinters] = useState<PrinterInfo[]>([]);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  const [fitScale, setFitScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<"fit" | "75" | "100">("fit");
  const [paperSize, setPaperSize] = useState<PaperSizeKey>("folio");
  const [orientation, setOrientation] = useState<"portrait" | "landscape">("portrait");
  const previewAreaRef = useRef<HTMLDivElement | null>(null);

  const pxPerMm = 96 / 25.4;
  const selectedPaper = PAPER_SIZES[paperSize];
  const orientedWidthMm = orientation === "portrait" ? selectedPaper.widthMm : selectedPaper.heightMm;
  const orientedHeightMm = orientation === "portrait" ? selectedPaper.heightMm : selectedPaper.widthMm;
  const paperWidthPx = Math.round(orientedWidthMm * pxPerMm);
  const paperHeightPx = Math.round(orientedHeightMm * pxPerMm);

  const buildPageDocument = (html: string) => {
    const doc = new DOMParser().parseFromString(html, "text/html");
    const style = Array.from(doc.head.querySelectorAll("style")).map((s) => s.outerHTML).join("");
    const override = `<style data-cbms-print-options>
      @page { size: ${orientedWidthMm}mm ${orientedHeightMm}mm; margin: 0; }
      html, body { width: ${orientedWidthMm}mm; min-width: ${orientedWidthMm}mm; margin: 0; padding: 0; }
      .print-page { width: ${orientedWidthMm}mm !important; min-width: ${orientedWidthMm}mm !important; height: ${orientedHeightMm}mm !important; min-height: ${orientedHeightMm}mm !important; }
    </style>`;
    const nodes = Array.from(doc.body.querySelectorAll<HTMLElement>(".print-page"));
    if (!nodes.length) return [html.replace("</head>", `${override}</head>`)];
    return nodes.map((node) => `<!doctype html><html><head><meta charset="utf-8">${style}${override}</head><body>${node.outerHTML}</body></html>`);
  };

  const extractPages = (html: string) => {
    try { return buildPageDocument(html); }
    catch { return [html]; }
  };

  const refresh = async () => {
    if (!window.electronPrint) return;
    try {
      const list = await window.electronPrint.getPrinters();
      const ordered = [...list].sort((a, b) => Number(b.isDefault) - Number(a.isDefault) || String(a.displayName || a.name).localeCompare(String(b.displayName || b.name)));
      setPrinters(ordered);
      setSelected((current) => current && ordered.some((p) => p.name === current) ? current : (ordered.find((p) => p.isDefault)?.name || ordered[0]?.name || ""));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load printers.");
    }
  };

  const recomputeFit = () => {
    const el = previewAreaRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const availableW = Math.max(320, rect.width - 44);
    const availableH = Math.max(320, rect.height - 44);
    const scale = Math.min(availableW / paperWidthPx, availableH / paperHeightPx, 1);
    setFitScale(Number.isFinite(scale) && scale > 0 ? scale : 1);
  };

  useEffect(() => {
    const onEvent = (e: Event) => {
      const d = (e as CustomEvent).detail;
      setDetail(d);
      setPages(extractPages(d.html));
      setPage(0);
      setZoomMode("fit");
      setError("");
      setTimeout(refresh, 0);
    };
    window.addEventListener("cbms-print-preview", onEvent);
    return () => window.removeEventListener("cbms-print-preview", onEvent);
  }, []);

  useEffect(() => {
    const savedPaper = localStorage.getItem("cbms-print-paper") as PaperSizeKey | null;
    const savedOrientation = localStorage.getItem("cbms-print-orientation") as "portrait" | "landscape" | null;
    if (savedPaper && savedPaper in PAPER_SIZES) setPaperSize(savedPaper);
    if (savedOrientation === "portrait" || savedOrientation === "landscape") setOrientation(savedOrientation);
  }, []);

  useEffect(() => {
    localStorage.setItem("cbms-print-paper", paperSize);
    localStorage.setItem("cbms-print-orientation", orientation);
    if (detail) setPages(extractPages(detail.html));
    setZoomMode("fit");
    setPage(0);
  }, [paperSize, orientation]);

  useEffect(() => {
    if (!detail) return;
    recomputeFit();
    const el = previewAreaRef.current;
    if (!el) return;
    const observer = new ResizeObserver(recomputeFit);
    observer.observe(el);
    window.addEventListener("resize", recomputeFit);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeFit);
    };
  }, [detail, page, pages.length, paperSize, orientation]);

  if (!detail) return null;

  const print = async () => {
    setBusy(true);
    setError("");
    try {
      if (window.electronPrint) {
        const r = await window.electronPrint.printHtml(detail.html, selected, { paperSize, orientation });
        if (!r.ok) setError(r.error || "Printing was cancelled or failed.");
        else setDetail(null);
      } else {
        const popup = window.open("", "_blank");
        if (!popup) { setError("The print preview window was blocked."); return; }
        popup.document.write(detail.html.replace("</head>", `<style>@page{size:${orientedWidthMm}mm ${orientedHeightMm}mm;margin:0}.print-page{width:${orientedWidthMm}mm!important;min-width:${orientedWidthMm}mm!important;height:${orientedHeightMm}mm!important;min-height:${orientedHeightMm}mm!important}</style></head>`));
        popup.document.close();
        setTimeout(() => { popup.focus(); popup.print(); }, 300);
        setDetail(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Printing failed.");
    } finally {
      setBusy(false);
    }
  };

  const currentPage = pages[Math.min(page, Math.max(0, pages.length - 1))] || detail.html;
  const zoom = zoomMode === "fit" ? fitScale : Number(zoomMode) / 100;
  const displayW = Math.round(paperWidthPx * zoom);
  const displayH = Math.round(paperHeightPx * zoom);

  return <div className="fixed inset-0 z-[210] bg-slate-950/70 p-3 backdrop-blur-sm" role="dialog" aria-modal="true">
    <div className="mx-auto flex h-full w-full max-w-[1600px] flex-col overflow-hidden rounded-2xl border border-white/10 bg-card shadow-2xl">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-border bg-card px-5 py-4">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-[.16em] text-primary">Print Preview</div>
          <div className="mt-1 truncate text-base font-black">{detail.title}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{selectedPaper.label} · {orientation} · {selectedPaper.note} · {pages.length} page{pages.length === 1 ? "" : "s"}</div>
        </div>
        <button onClick={() => setDetail(null)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border bg-background hover:bg-muted" aria-label="Close print preview"><X className="h-4 w-4"/></button>
      </header>

      <div className="shrink-0 border-b border-border bg-muted/20 px-4 py-3">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_1.2fr_auto] md:items-end">
          <div>
            <label className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">Paper size</label>
            <select value={paperSize} onChange={(e) => setPaperSize(e.target.value as PaperSizeKey)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30">
              {Object.entries(PAPER_SIZES).map(([key, p]) => <option key={key} value={key}>{p.label} · {p.note}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">Orientation</label>
            <div className="mt-1 grid grid-cols-2 gap-1 rounded-xl border border-border bg-background p-1">
              {(["portrait", "landscape"] as const).map((mode) => <button key={mode} onClick={() => setOrientation(mode)} className={`h-8 rounded-lg text-sm font-bold capitalize transition ${orientation === mode ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-muted"}`}>{mode}</button>)}
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">Printer</label>
              <Button size="sm" variant="ghost" onClick={refresh} className="h-7 px-2"><RefreshCw className="h-3.5 w-3.5"/></Button>
            </div>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-primary/30" disabled={!printers.length}>
              {printers.length ? printers.map((p) => <option key={p.name} value={p.name}>{p.isDefault ? "★ " : ""}{p.displayName || p.name}{p.isDefault ? " — Ready" : ""}</option>) : <option value="">No printer found</option>}
            </select>
          </div>
          <div className="rounded-xl border border-primary/15 bg-primary/5 px-3 py-2 text-[11px] text-muted-foreground md:min-w-[190px]">
            <div className="font-bold text-foreground">Selected output</div>
            <div className="mt-0.5">{orientedWidthMm.toFixed(1)} × {orientedHeightMm.toFixed(1)} mm</div>
          </div>
        </div>
        {error && <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs font-medium text-destructive">{error}</div>}
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-[132px_minmax(0,1fr)] gap-3 p-3">
        <aside className="min-h-0 overflow-hidden rounded-xl border border-border bg-muted/25">
          <div className="flex items-center justify-between border-b border-border px-3 py-2.5"><div className="text-[10px] font-black uppercase tracking-[.14em] text-muted-foreground">Pages</div><span className="text-[10px] font-bold text-muted-foreground">{page + 1}/{pages.length}</span></div>
          <div className="h-full overflow-y-auto p-2">
            <div className="space-y-2">
              {pages.map((src, i) => <button key={i} onClick={() => setPage(i)} className={`block w-full rounded-xl border p-1.5 text-left transition ${page === i ? "border-primary bg-primary/10 shadow-sm" : "border-border bg-background hover:bg-muted"}`}>
                <div className="mb-1 flex items-center justify-between px-1 text-[9px] font-black"><span>Page {i + 1}</span>{i === 0 ? <span>First</span> : null}</div>
                <div className="overflow-hidden rounded-md border border-border bg-white" style={{ aspectRatio: `${orientedWidthMm} / ${orientedHeightMm}` }}>
                  <iframe title={`Page ${i + 1} thumbnail`} srcDoc={src} className="pointer-events-none h-full w-full border-0" />
                </div>
              </button>)}
            </div>
          </div>
        </aside>

        <main ref={previewAreaRef} className="min-h-0 min-w-0 overflow-hidden rounded-xl border border-border bg-slate-100/70 p-3">
          <div className="mb-2.5 flex shrink-0 items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground"><span className="rounded-full border border-border bg-background px-2.5 py-1 font-semibold">Page {page + 1} of {pages.length}</span><span>{selectedPaper.label} · {orientation}</span></div>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-background p-1 shadow-sm">
              <Button size="sm" variant={zoomMode === "fit" ? "default" : "ghost"} onClick={() => setZoomMode("fit")}>Fit</Button>
              <Button size="sm" variant={zoomMode === "75" ? "default" : "ghost"} onClick={() => setZoomMode("75")}>75%</Button>
              <Button size="sm" variant={zoomMode === "100" ? "default" : "ghost"} onClick={() => setZoomMode("100")}>100%</Button>
              <Button size="sm" variant="ghost" onClick={() => previewAreaRef.current?.querySelector<HTMLElement>('.cbms-preview-scroller')?.scrollTo({ top: 0, behavior: 'smooth' })}>Top</Button>
              <Button size="sm" variant="ghost" onClick={() => { const el = previewAreaRef.current?.querySelector<HTMLElement>('.cbms-preview-scroller'); if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }); }}>Bottom</Button>
              <Button size="sm" variant="ghost" disabled={page <= 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <Button size="sm" variant="ghost" disabled={page >= pages.length - 1} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>

          <div className="cbms-preview-scroller flex h-[calc(100%-44px)] min-h-0 min-w-0 items-start justify-start overflow-auto rounded-xl border border-border/70 bg-[radial-gradient(circle_at_center,rgba(255,255,255,.98),rgba(226,232,240,.8))] p-3 [scrollbar-gutter:stable_both-edges]">
            <div className="relative shrink-0 mx-auto" style={{ width: displayW, height: displayH, minWidth: displayW, minHeight: displayH }}>
              <iframe key={`preview-${paperSize}-${orientation}-${page}-${pages.length}`} title="Printable paper preview" srcDoc={currentPage} className="absolute left-0 top-0 block origin-top-left border-0 bg-white shadow-[0_18px_50px_rgba(15,23,42,.18)]" style={{ width: paperWidthPx, height: paperHeightPx, transform: `scale(${zoom})` }} />
            </div>
          </div>
        </main>
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-border bg-card px-5 py-3.5">
        <div className="text-xs text-muted-foreground">The preview uses the selected paper settings. Windows will open the printer dialog so the physical printer driver can confirm the selected paper and orientation.</div>
        <div className="flex shrink-0 items-center gap-2"><Button variant="outline" onClick={() => setDetail(null)}>Cancel</Button><Button onClick={print} disabled={busy || (!!printers.length && !selected)}>{busy ? "Preparing…" : <><Printer className="h-4 w-4"/> Print document</>}</Button></div>
      </footer>
    </div>
  </div>;
}
export async function runGenericWordExport(payload: GroupedExportPayload | ExportPayload) { await exportDOCX(payload); }
export function runGenericPrint(payload: GroupedExportPayload | ExportPayload) { emitPrintPreview(buildPrintHtml(payload as GroupedExportPayload), payload.title); }
