import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  FileSpreadsheet,
  FolderArchive,
  Cloud,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Download,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import {
  createBatch,
  startBatchProcessing,
  previewManifest,
  uploadBatchManifest,
  uploadBatchImagesZip,
  verifyDriveFolder,
  getManifestTemplateUrl,
  type ExcelPreview,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";

export default function CreateBatch() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  // Step 1: Basics
  const [batchName, setBatchName] = useState("");
  const [sourceType, setSourceType] = useState<"manual_upload" | "google_drive">("manual_upload");

  // Step 2: Manifest
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ExcelPreview | null>(null);
  const [mapping, setMapping] = useState({
    bbid: "",
    filename: "",
    category: "",
    sequence: "",
  });

  // Step 3: Images
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveVerified, setDriveVerified] = useState(false);

  // Configuration settings (BigBasket SRS defaults)
  const [config] = useState({
    canvas_width: 2000,
    canvas_height: 2000,
    dpi: 150,
    fop_bop_padding: { top: 180, bottom: 180, left: 100, right: 100 },
    confidence_threshold: 0.95,
    auto_inpaint_mrp: true,
  });

  const [loading, setLoading] = useState(false);

  async function handleManifestUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setManifestFile(file);
    try {
      const p = await previewManifest(file);
      setPreview(p);
      setMapping({
        bbid: p.suggested_mapping.bbid || "",
        filename: p.suggested_mapping.filename || "",
        category: p.suggested_mapping.category || "",
        sequence: p.suggested_mapping.sequence || "",
      });
      showSuccess(`Loaded manifest: ${p.total_rows} rows detected.`);
    } catch (err: any) {
      showError(err.message || "Failed to parse manifest file.");
    }
  }

  async function handleVerifyDrive() {
    if (!driveUrl.trim()) return showError("Please enter a Google Drive folder URL.");
    setLoading(true);
    try {
      const res = await verifyDriveFolder(driveUrl.trim());
      if (res.valid) {
        setDriveVerified(true);
        showSuccess("Google Drive folder verified successfully!");
      } else {
        showError(res.error || "Unable to access Google Drive folder.");
      }
    } catch (err: any) {
      showError(err.message || "Failed to verify Google Drive folder.");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateAndLaunch() {
    if (!batchName.trim()) return showError("Batch name is required.");
    setLoading(true);

    try {
      // 1. Create Batch
      const batch = await createBatch({
        name: batchName.trim(),
        source_type: sourceType,
        config,
      });

      // 2. Upload Manifest if present
      if (manifestFile && preview) {
        await uploadBatchManifest(batch.id, manifestFile, mapping);
      }

      // 3. Upload ZIP if manual
      if (sourceType === "manual_upload" && zipFile) {
        await uploadBatchImagesZip(batch.id, zipFile);
      }

      // 4. Auto-launch background pipeline
      try {
        await startBatchProcessing(batch.id);
      } catch {}

      showSuccess(`Batch ${batch.batch_code} created and processing started!`);
      navigate("/image-studio/batch-processing", { state: { batchId: batch.id } });
    } catch (err: any) {
      showError(err.message || "Failed to initialize batch.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        icon={Upload}
        title="Create Image Ingestion Batch"
        subtitle="Upload catalog manifest and product images for automated processing"
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-between max-w-2xl mx-auto py-2">
        {[
          { num: 1, label: "Batch Setup" },
          { num: 2, label: "Excel Mapping" },
          { num: 3, label: "Image Source" },
          { num: 4, label: "Review & Launch" },
        ].map((s) => (
          <div key={s.num} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                step === s.num
                  ? "bg-sky-500 text-white shadow-[0_0_12px_rgba(14,165,233,0.4)]"
                  : step > s.num
                  ? "bg-emerald-500 text-white"
                  : "bg-slate-200 dark:bg-white/10 text-slate-500"
              }`}
            >
              {step > s.num ? <CheckCircle className="w-4 h-4" /> : s.num}
            </div>
            <span
              className={`text-xs font-medium hidden sm:inline ${
                step === s.num ? "text-slate-900 dark:text-white" : "text-slate-500"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      {/* Main Wizard Form Card */}
      <div className="glass-card rounded-2xl p-6 max-w-2xl mx-auto space-y-6">
        {step === 1 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Batch Details</h3>
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
                Batch Name *
              </label>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. Catalog Product Ingestion - Batch #1"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Input Source Type
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSourceType("manual_upload")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sourceType === "manual_upload"
                      ? "border-sky-500 bg-sky-500/10 shadow-sm"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <FolderArchive className="w-5 h-5 text-sky-500 mb-2" />
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Manual Upload</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Upload Excel sheet and ZIP archive of images</div>
                </button>

                <button
                  type="button"
                  onClick={() => setSourceType("google_drive")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sourceType === "google_drive"
                      ? "border-sky-500 bg-sky-500/10 shadow-sm"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <Cloud className="w-5 h-5 text-sky-500 mb-2" />
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Google Drive</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Ingest from shared Google Drive folder link</div>
                </button>
              </div>
            </div>

            <div className="flex justify-end pt-3">
              <button
                type="button"
                disabled={!batchName.trim()}
                onClick={() => setStep(2)}
                className={PRIMARY_BUTTON}
              >
                Next: Excel Mapping
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Excel Manifest & Column Mapping</h3>
            <p className="text-xs text-slate-500">
              Upload the product metadata sheet (XLSX or CSV). The tool will auto-detect product ID and image name columns.
            </p>

            {/* Quick Template Download */}
            <div className="flex items-center justify-between p-3 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-slate-900/40">
              <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <FileSpreadsheet className="w-4 h-4 text-sky-500 shrink-0" />
                <span>Don't have a manifest formatted yet?</span>
              </div>
              <a
                href={getManifestTemplateUrl()}
                download="Catalog_Manifest_Template.xlsx"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline"
              >
                <Download className="w-3.5 h-3.5" />
                Download Sample Template (.xlsx)
              </a>
            </div>

            <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors">
              <FileSpreadsheet className="w-8 h-8 text-sky-500 mx-auto mb-2" />
              <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                Choose Excel or CSV Manifest
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={handleManifestUpload}
                />
              </label>
              {manifestFile && (
                <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                  Selected: {manifestFile.name} ({(manifestFile.size / 1024).toFixed(1)} KB)
                </div>
              )}
            </div>

            {preview && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Column Mapping
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Product ID (SKU) *
                    </label>
                    <select
                      value={mapping.bbid}
                      onChange={(e) => setMapping({ ...mapping, bbid: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select column...</option>
                      {preview.columns.map((c) => (
                        <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Image Filename *
                    </label>
                    <select
                      value={mapping.filename}
                      onChange={(e) => setMapping({ ...mapping, filename: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">Select column...</option>
                      {preview.columns.map((c) => (
                        <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Category / Type
                    </label>
                    <select
                      value={mapping.category}
                      onChange={(e) => setMapping({ ...mapping, category: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">(Optional - Local AI auto-classifies)</option>
                      {preview.columns.map((c) => (
                        <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
                      Sequence / Order
                    </label>
                    <select
                      value={mapping.sequence}
                      onChange={(e) => setMapping({ ...mapping, sequence: e.target.value })}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 cursor-pointer transition-colors"
                    >
                      <option value="" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">(Optional - natural index)</option>
                      {preview.columns.map((c) => (
                        <option key={c} value={c} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">{c}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between pt-3">
              <button type="button" onClick={() => setStep(1)} className={SECONDARY_BUTTON}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className={PRIMARY_BUTTON}
              >
                Next: Image Source
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Product Images Ingestion</h3>
            {sourceType === "manual_upload" ? (
              <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors">
                <FolderArchive className="w-8 h-8 text-sky-500 mx-auto mb-2" />
                <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                  Choose Images ZIP Archive
                  <input
                    type="file"
                    accept=".zip"
                    className="hidden"
                    onChange={(e) => setZipFile(e.target.files?.[0] || null)}
                  />
                </label>
                {zipFile && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                    Selected: {zipFile.name} ({(zipFile.size / (1024 * 1024)).toFixed(1)} MB)
                  </div>
                )}
                <p className="text-[11px] text-slate-400 mt-1">Accepts ZIP archives containing PNG and JPEG images</p>
              </div>
            ) : (
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Google Drive Folder URL
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={driveUrl}
                    onChange={(e) => {
                      setDriveUrl(e.target.value);
                      setDriveVerified(false);
                    }}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white/70 dark:bg-slate-900/60 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleVerifyDrive}
                    disabled={loading || !driveUrl.trim()}
                    className={SECONDARY_BUTTON}
                  >
                    Verify
                  </button>
                </div>
                {driveVerified && (
                  <div className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-medium">
                    <CheckCircle className="w-4 h-4" /> Folder link verified and accessible.
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between pt-3">
              <button type="button" onClick={() => setStep(2)} className={SECONDARY_BUTTON}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(4)}
                className={PRIMARY_BUTTON}
              >
                Next: Review & Launch
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Review Processing Settings</h3>

            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Batch Name:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{batchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 capitalize">{sourceType.replace("_", " ")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Output Canvas:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">2000 × 2000 px, 150 DPI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">FOP/BOP Padding:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">Top/Bottom: 180px, Left/Right: 100px</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Confidence Threshold:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">95.0% Confidence Level</span>
              </div>
            </div>

            <div className="flex justify-between pt-3">
              <button type="button" onClick={() => setStep(3)} className={SECONDARY_BUTTON}>
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={handleCreateAndLaunch}
                className={PRIMARY_BUTTON}
              >
                {loading ? "Initializing..." : "Create & Open Batch"}
                <Sparkles className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}
