import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Upload,
  Zap,
  Cloud,
  FolderArchive,
  Image as ImageIcon,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Sparkles,
} from "lucide-react";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { PRIMARY_BUTTON, SECONDARY_BUTTON } from "@/components/ui";
import {
  createBatch,
  startBatchProcessing,
  uploadBatchImagesZip,
  uploadBatchImageFiles,
  verifyDriveFolder,
} from "@/services/bigbasket";
import { showError, showSuccess } from "@/lib/toast";

export default function CreateBatch() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1: Basics
  const [batchName, setBatchName] = useState("");
  const [sourceType, setSourceType] = useState<"auto_images" | "google_drive">("auto_images");
  const [productCategory, setProductCategory] = useState<"auto" | "food" | "non_food" | "kitchen_items">("auto");

  // Step 2: Images (Direct files or ZIP or Google Drive)
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveVerified, setDriveVerified] = useState(false);

  // Configuration settings (BigBasket SRS defaults)
  const config = {
    canvas_width: 2000,
    canvas_height: 2000,
    dpi: 150,
    product_category: productCategory,
    fop_bop_padding: { top: 180, bottom: 180, left: 100, right: 100 },
    confidence_threshold: 1.0,
    auto_inpaint_mrp: true,
  };

  const [loading, setLoading] = useState(false);

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

      // 2. Upload Images
      if (imageFiles.length > 0) {
        await uploadBatchImageFiles(batch.id, imageFiles);
      } else if (zipFile) {
        await uploadBatchImagesZip(batch.id, zipFile);
      }

      // 3. Auto-launch background pipeline
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

  const wizardSteps = [
    { num: 1, label: "Batch Setup" },
    { num: 2, label: "Upload Images" },
    { num: 3, label: "Review & Launch" },
  ];

  const totalImageSizeMb = imageFiles.reduce((acc, f) => acc + f.size, 0) / (1024 * 1024);

  return (
    <PageContainer>
      <PageHeader
        icon={Upload}
        title="Create Image Ingestion Batch"
        subtitle="Automated image ingestion, Photoroom background removal, repadding & catalog export"
      />

      {/* Step Indicator */}
      <div className="flex items-center justify-between max-w-xl mx-auto py-2">
        {wizardSteps.map((s) => (
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
              className={`text-xs font-semibold ${
                step === s.num ? "text-slate-900 dark:text-white" : "text-slate-400"
              }`}
            >
              {s.label}
            </span>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-6 max-w-2xl mx-auto space-y-6">
        {/* STEP 1: BATCH SETUP */}
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  Batch Title *
                </label>
                <span className="text-[10px] font-mono font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-md border border-sky-500/20">
                  Auto-assigned ID: IS-BATCH&lt;id&gt;
                </span>
              </div>
              <input
                type="text"
                value={batchName}
                onChange={(e) => setBatchName(e.target.value)}
                placeholder="e.g. Catalog Batch - Nov 7"
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 text-xs font-medium focus:outline-none focus:border-slate-300 dark:focus:border-slate-600 transition-colors"
              />
              <p className="text-[11px] text-slate-500 mt-1">
                Enter descriptive title. The extraction batch ID is automatically created as <span className="text-sky-400 font-mono font-medium">IS-BATCH-&lt;id&gt;</span> based on the database index.
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Ingestion Mode
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* 1. Fully Automated AI */}
                <button
                  type="button"
                  onClick={() => setSourceType("auto_images")}
                  className={`relative p-4 rounded-xl border text-left transition-all ${
                    sourceType === "auto_images"
                      ? "border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-sky-500 text-white uppercase tracking-wider">
                    Automated
                  </span>
                  <Zap className="w-5 h-5 text-sky-500 mb-2" />
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Images Only</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Upload images directly. AI auto-detects SKU and angles from file names.
                  </div>
                </button>

                {/* 2. Google Drive */}
                <button
                  type="button"
                  onClick={() => setSourceType("google_drive")}
                  className={`p-4 rounded-xl border text-left transition-all ${
                    sourceType === "google_drive"
                      ? "border-sky-500 bg-sky-500/10 shadow-sm ring-1 ring-sky-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <Cloud className="w-5 h-5 text-sky-500 mb-2" />
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Google Drive</div>
                  <div className="text-[11px] text-slate-500 mt-1 leading-snug">
                    Ingest directly from a shared Google Drive folder link.
                  </div>
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2">
                Product Category Logic
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <button
                  type="button"
                  onClick={() => setProductCategory("auto")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    productCategory === "auto"
                      ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-xs text-slate-900 dark:text-white">Auto-Detect</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Gemini AI detects Food, Non-Food, or Kitchen</div>
                </button>
                <button
                  type="button"
                  onClick={() => setProductCategory("food")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    productCategory === "food"
                      ? "border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-xs text-emerald-600 dark:text-emerald-400">Food Products</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Enforces FSSAI, Nutrition, & Ingredients</div>
                </button>
                <button
                  type="button"
                  onClick={() => setProductCategory("non_food")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    productCategory === "non_food"
                      ? "border-purple-500 bg-purple-500/10 ring-1 ring-purple-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-xs text-purple-600 dark:text-purple-400">Non-Food Products</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Directions, Material, & Safety (FSSAI exempt)</div>
                </button>
                <button
                  type="button"
                  onClick={() => setProductCategory("kitchen_items")}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    productCategory === "kitchen_items"
                      ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/30"
                      : "border-slate-200 dark:border-white/10 hover:border-slate-300"
                  }`}
                >
                  <div className="font-semibold text-xs text-amber-600 dark:text-amber-400">Kitchen Items</div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Cookware, Utensils, Glass & Metal rules</div>
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
                Next: Upload Images
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: IMAGE SOURCE */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Product Images Ingestion</h3>
              <span className="text-xs text-sky-600 dark:text-sky-400 font-medium">
                {sourceType === "auto_images" ? "Direct Image Upload" : "Google Drive Ingestion"}
              </span>
            </div>

            {sourceType !== "google_drive" ? (
              <div className="space-y-4">
                {/* 1. Direct multiple image files upload */}
                <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-6 text-center hover:border-sky-500 transition-colors">
                  <ImageIcon className="w-9 h-9 text-sky-500 mx-auto mb-2" />
                  <label className="cursor-pointer text-xs font-semibold text-sky-600 dark:text-sky-400 hover:underline">
                    Choose Image Files (Select Multiple)
                    <input
                      type="file"
                      multiple
                      accept=".png,.jpg,.jpeg,.webp"
                      className="hidden"
                      onChange={(e) => {
                        const files = Array.from(e.target.files || []);
                        setImageFiles(files);
                        if (files.length > 0) setZipFile(null);
                      }}
                    />
                  </label>
                  <p className="text-[11px] text-slate-400 mt-1">Select one or multiple images (.jpg, .png, .webp)</p>
                  {imageFiles.length > 0 && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium flex items-center justify-center gap-1.5">
                      <CheckCircle className="w-4 h-4" />
                      Selected {imageFiles.length} image file(s) ({totalImageSizeMb.toFixed(1)} MB)
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                  <span className="text-xs text-slate-400 font-medium">Or upload as ZIP</span>
                  <div className="flex-1 h-px bg-slate-200 dark:bg-white/10" />
                </div>

                {/* 2. ZIP Archive option */}
                <div className="border-2 border-dashed border-slate-200 dark:border-white/10 rounded-2xl p-4 text-center hover:border-sky-500 transition-colors">
                  <FolderArchive className="w-6 h-6 text-slate-400 mx-auto mb-1.5" />
                  <label className="cursor-pointer text-xs font-semibold text-slate-600 dark:text-slate-300 hover:underline">
                    Choose Images ZIP Archive
                    <input
                      type="file"
                      accept=".zip"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0] || null;
                        setZipFile(file);
                        if (file) setImageFiles([]);
                      }}
                    />
                  </label>
                  {zipFile && (
                    <div className="text-xs text-emerald-600 dark:text-emerald-400 mt-2 font-medium">
                      Selected ZIP: {zipFile.name} ({(zipFile.size / (1024 * 1024)).toFixed(1)} MB)
                    </div>
                  )}
                </div>
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
              <button
                type="button"
                onClick={() => setStep(1)}
                className={SECONDARY_BUTTON}
              >
                <ArrowLeft className="w-4 h-4 mr-1" /> Back
              </button>
              <button
                type="button"
                disabled={imageFiles.length === 0 && !zipFile && !driveVerified}
                onClick={() => setStep(3)}
                className={PRIMARY_BUTTON}
              >
                Next: Review & Launch
                <ArrowRight className="w-4 h-4 ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: REVIEW & LAUNCH */}
        {step === 3 && (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Review Processing Settings</h3>

            <div className="bg-slate-50 dark:bg-white/5 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Batch Name:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">{batchName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {sourceType === "auto_images" ? "Images Only (Auto-detected SKU)" : "Google Drive"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Images to Ingest:</span>
                <span className="font-semibold text-sky-600 dark:text-sky-400">
                  {imageFiles.length > 0
                    ? `${imageFiles.length} file(s) selected`
                    : zipFile
                    ? `ZIP: ${zipFile.name}`
                    : "Google Drive Folder"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Target Output Canvas:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">2000 × 2000 px, 150 DPI</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Background Removal:</span>
                <span className="font-semibold text-emerald-600 dark:text-emerald-400">Photoroom AI Transparent PNG</span>
              </div>
            </div>

            <div className="flex justify-between pt-3">
              <button type="button" onClick={() => setStep(2)} className={SECONDARY_BUTTON}>
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
