import { useEffect, useState } from "react";
import {
  FileText,
  FileSpreadsheet,
  FolderArchive,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import {
  fetchBatches,
  downloadBatchExcelFile,
  downloadBatchZipFile,
  type BatchItem,
} from "@/services/bigbasket";
import { showError } from "@/lib/toast";

export default function BigBasketReports() {
  const [batches, setBatches] = useState<BatchItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBatches();
  }, []);

  async function loadBatches() {
    try {
      const data = await fetchBatches(1, 50);
      setBatches(data.items);
    } catch (e: any) {
      showError(e.message || "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={FileText}
        title="Reports & Catalog Exports"
        subtitle="Download automated Excel audit reports, exception logs, and approved 2000x2000 PNG image packages"
      />

      {/* Batch Export Archive Table */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">Batch Export Packages</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Exported packages include standardized filenames ({`{SKU}_{sequence}.png`}) and full audit trails
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-white/10 text-slate-500 dark:text-slate-400">
                <th className="py-2.5 px-3 font-semibold">Batch Code</th>
                <th className="py-2.5 px-3 font-semibold">Name</th>
                <th className="py-2.5 px-3 font-semibold">Total Items</th>
                <th className="py-2.5 px-3 font-semibold">Approved</th>
                <th className="py-2.5 px-3 font-semibold">Status</th>
                <th className="py-2.5 px-3 font-semibold text-right">Downloads</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    Loading reports...
                  </td>
                </tr>
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-slate-400">
                    No batches found.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="hover:bg-slate-500/5 transition-colors">
                    <td className="py-3 px-3 font-mono font-medium text-slate-800 dark:text-slate-200">
                      {b.batch_code}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900 dark:text-white">
                      {b.name}
                    </td>
                    <td className="py-3 px-3 text-slate-600 dark:text-slate-300">
                      {b.total_images}
                    </td>
                    <td className="py-3 px-3 text-emerald-600 dark:text-emerald-400 font-semibold">
                      {b.approved_images}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase ${
                          b.status === "completed"
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                            : b.status === "processing"
                            ? "bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20 animate-pulse"
                            : "bg-slate-500/10 text-slate-600 dark:text-slate-400 border border-slate-500/20"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => downloadBatchExcelFile(b.batch_code)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 transition-colors cursor-pointer"
                          title="Download Excel processing and exception audit log"
                        >
                          <FileSpreadsheet className="w-3.5 h-3.5" />
                          Excel Report
                        </button>
                        <button
                          type="button"
                          onClick={() => downloadBatchZipFile(b.batch_code)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-sky-700 dark:text-sky-300 bg-sky-50 dark:bg-sky-500/10 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors cursor-pointer"
                          title="Download ZIP package of approved 2000x2000 PNG images"
                        >
                          <FolderArchive className="w-3.5 h-3.5" />
                          Images ZIP
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}
