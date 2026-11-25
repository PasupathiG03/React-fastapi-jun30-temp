import { API_BASE_URL } from "@/lib/constants";

export interface BatchItem {
  id: number;
  batch_code: string;
  name: string;
  source_type: string;
  status: "created" | "validating" | "queued" | "processing" | "paused" | "completed" | "failed" | "cancelled";
  total_images: number;
  processed_images: number;
  approved_images: number;
  review_needed_images: number;
  failed_images: number;
  idempotency_key?: string | null;
  config?: any;
  created_at: string;
  updated_at: string;
  /** The user who uploaded the batch. */
  creator?: { employee_id: string; employee_name: string | null } | null;
}

export interface BatchListResponse {
  items: BatchItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImageItem {
  id: number;
  batch_id: number;
  bbid: string;
  original_filename: string;
  original_width?: number | null;
  original_height?: number | null;
  file_size_bytes?: number | null;
  image_type: string;
  status: "pending" | "processing" | "auto_approved" | "needs_review" | "manually_approved" | "rejected" | "failed";
  sequence_order: number;
  confidence_score?: number | null;
  final_output_path?: string | null;
  error_message?: string | null;
  created_at: string;
  validation_results?: any;
  validation_status?: any;
}

export interface ImageListResponse {
  items: ImageItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface ImageInspectionItem {
  filename: string;
  width: number;
  height: number;
  format?: string | null;
  file_size_bytes?: number;
  megapixels?: number;
  required_width?: number;
  required_height?: number;
  width_shortfall?: number;
  height_shortfall?: number;
  is_dimension_valid: boolean;
  dimension_message: string;
  has_hundred_percent: boolean;
  hundred_percent_matches: Array<{
    text: string;
    confidence: number;
    box: number[][];
  }>;
  ocr_status: string;
  error?: string | null;
}

export interface InspectionResponse {
  total_inspected: number;
  required_width?: number;
  required_height?: number;
  has_any_invalid_dimension: boolean;
  has_any_hundred_percent: boolean;
  items: ImageInspectionItem[];
}

export interface DashboardSummary {
  total_batches: number;
  total_images: number;
  auto_approved_images: number;
  manually_approved_images: number;
  review_needed_images: number;
  failed_images: number;
  auto_approval_rate: number;
  avg_processing_time_ms: number;
  recent_batches: BatchItem[];
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      Accept: "application/json",
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    let errDetail = "Request failed";
    try {
      const data = await res.json();
      errDetail = data.detail || data.message || errDetail;
    } catch { }
    throw new Error(errDetail);
  }

  if (res.status === 204) return null as T;
  return res.json();
}

// ── API Functions ─────────────────────────────────────────────────────────────

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  return request<DashboardSummary>("/api/image-studio/reports/dashboard");
}

export async function fetchBatches(page = 1, pageSize = 20, status?: string): Promise<BatchListResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) q.append("status", status);
  return request<BatchListResponse>(`/api/image-studio/batches/?${q.toString()}`);
}

export async function fetchBatchDetails(batchId: number): Promise<BatchItem> {
  return request<BatchItem>(`/api/image-studio/batches/${batchId}`);
}

export async function createBatch(data: { name: string; source_type?: string; config?: any }): Promise<BatchItem> {
  return request<BatchItem>("/api/image-studio/batches/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function startBatchProcessing(batchId: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/image-studio/batches/${batchId}/start`, { method: "POST" });
}

export async function pauseBatchProcessing(batchId: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/image-studio/batches/${batchId}/pause`, { method: "POST" });
}

export async function resumeBatchProcessing(batchId: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/image-studio/batches/${batchId}/resume`, { method: "POST" });
}

export async function cancelBatchProcessing(batchId: number): Promise<{ message: string }> {
  return request<{ message: string }>(`/api/image-studio/batches/${batchId}/cancel`, { method: "POST" });
}

export async function deleteBatch(batchId: number): Promise<void> {
  return request<void>(`/api/image-studio/batches/${batchId}`, { method: "DELETE" });
}

export async function uploadBatchImagesZip(batchId: number, zipFile: File): Promise<any> {
  const fd = new FormData();
  fd.append("file", zipFile);
  return request(`/api/image-studio/uploads/batch/${batchId}/images-zip`, {
    method: "POST",
    body: fd,
  });
}

export async function uploadBatchImageFiles(batchId: number, files: File[]): Promise<any> {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }
  return request(`/api/image-studio/uploads/batch/${batchId}/images-files`, {
    method: "POST",
    body: fd,
  });
}

/** Without minWidth/minHeight the server validates against the saved Image Automation settings. */
function dimensionQuery(minWidth?: number, minHeight?: number): string {
  const q = new URLSearchParams();
  if (minWidth) q.set("min_width", String(minWidth));
  if (minHeight) q.set("min_height", String(minHeight));
  const qs = q.toString();
  return qs ? `?${qs}` : "";
}

export async function inspectImageFiles(
  files: File[],
  minWidth?: number,
  minHeight?: number
): Promise<InspectionResponse> {
  const fd = new FormData();
  for (const f of files) {
    fd.append("files", f);
  }
  return request<InspectionResponse>(
    `/api/image-studio/inspect/images${dimensionQuery(minWidth, minHeight)}`,
    {
      method: "POST",
      body: fd,
    }
  );
}

export async function inspectImagesZip(
  zipFile: File,
  minWidth?: number,
  minHeight?: number
): Promise<InspectionResponse> {
  const fd = new FormData();
  fd.append("file", zipFile);
  return request<InspectionResponse>(
    `/api/image-studio/inspect/zip${dimensionQuery(minWidth, minHeight)}`,
    {
      method: "POST",
      body: fd,
    }
  );
}

export interface ImageValidationSettings {
  /** Null until a user saves the setting in Image Automation > Settings. */
  min_width: number | null;
  min_height: number | null;
  is_configured: boolean;
  updated_at?: string | null;
}

export async function fetchImageValidationSettings(): Promise<ImageValidationSettings> {
  return request<ImageValidationSettings>("/api/image-studio/settings/image-validation");
}

export async function updateImageValidationSettings(data: {
  min_width: number;
  min_height: number;
}): Promise<ImageValidationSettings> {
  return request<ImageValidationSettings>("/api/image-studio/settings/image-validation", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export interface OutputPresetPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** A saved output preset: canvas size, DPI and FOP/BOP padding. */
export interface OutputPresetValues {
  canvas_width: number;
  canvas_height: number;
  dpi: number;
  padding: OutputPresetPadding;
}

export interface OutputPreset {
  /** All null until a user saves the preset in Image Automation > Settings. */
  canvas_width: number | null;
  canvas_height: number | null;
  dpi: number | null;
  padding: OutputPresetPadding | null;
  is_configured: boolean;
  updated_at?: string | null;
}

/** The preset's values when it has been saved, otherwise null. */
export function configuredPreset(p: OutputPreset | null | undefined): OutputPresetValues | null {
  if (!p || !p.is_configured || p.canvas_width == null || p.canvas_height == null || p.dpi == null || !p.padding) {
    return null;
  }
  return { canvas_width: p.canvas_width, canvas_height: p.canvas_height, dpi: p.dpi, padding: p.padding };
}

export async function fetchOutputPreset(): Promise<OutputPreset> {
  return request<OutputPreset>("/api/image-studio/settings/output-preset");
}

export async function updateOutputPreset(data: OutputPresetValues): Promise<OutputPreset> {
  return request<OutputPreset>("/api/image-studio/settings/output-preset", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

/** Short summary of a saved preset: canvas, DPI and FOP/BOP padding (top/bottom, left/right). */
export function describeOutputPreset(p: OutputPresetValues): string {
  const { top, bottom, left, right } = p.padding;
  const vertical = top === bottom ? `${top}` : `${top}/${bottom}`;
  const horizontal = left === right ? `${left}` : `${left}/${right}`;
  return `${p.canvas_width}×${p.canvas_height}px · ${p.dpi} DPI · FOP/BOP padding ${vertical}/${horizontal}`;
}

export interface OutputSpec {
  width: number;
  height: number;
  dpi: number;
}

/** Canvas size and DPI an image was produced for: the spec recorded on the image, else the one from its
 * batch (`{width, height, dpi}` or a batch config with canvas_width/canvas_height/dpi). Null when neither
 * is known; there is no built-in value. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getOutputSpec(validation: any, fallback?: any): OutputSpec | null {
  const pick = (w: unknown, h: unknown, d: unknown): OutputSpec | null => {
    const width = Number(w);
    const height = Number(h);
    const dpi = Number(d);
    return width > 0 && height > 0 && dpi > 0 ? { width, height, dpi } : null;
  };
  const spec = validation?.output_spec;
  return (
    pick(spec?.width, spec?.height, spec?.dpi) ??
    pick(fallback?.width ?? fallback?.canvas_width, fallback?.height ?? fallback?.canvas_height, fallback?.dpi)
  );
}

export async function fetchBatchImages(
  batchId: number,
  page = 1,
  pageSize = 25,
  status?: string,
  search?: string
): Promise<ImageListResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (status) q.append("status", status);
  if (search) q.append("search", search);
  return request<ImageListResponse>(`/api/image-studio/images/batch/${batchId}?${q.toString()}`);
}

export async function fetchImageDetails(imageId: number): Promise<any> {
  return request(`/api/image-studio/images/${imageId}`);
}

export async function retryImageProcessing(
  imageId: number,
  provider: "photoroom" | "birefnet" = "photoroom"
): Promise<any> {
  return request(`/api/image-studio/images/${imageId}/retry?provider=${provider}`, {
    method: "POST",
  });
}

export async function retryBatchFailed(batchId: number): Promise<{ message: string; count: number }> {
  return request<{ message: string; count: number }>(`/api/image-studio/batches/${batchId}/retry-failed`, {
    method: "POST",
  });
}

export async function rerunEntireBatch(
  batchId: number,
  provider?: "photoroom" | "birefnet"
): Promise<{ message: string; batch_id: number; status: string; count: number }> {
  const q = provider ? `?provider=${provider}` : "";
  return request<{ message: string; batch_id: number; status: string; count: number }>(
    `/api/image-studio/batches/${batchId}/rerun${q}`,
    {
      method: "POST",
    }
  );
}

export async function fetchReviewQueue(
  page = 1,
  pageSize = 20,
  batchId?: number
): Promise<ImageListResponse> {
  const q = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
  if (batchId) q.append("batch_id", String(batchId));
  return request<ImageListResponse>(`/api/image-studio/reviews/queue?${q.toString()}`);
}

export async function submitReviewAction(
  imageId: number,
  decision: "approved" | "rejected" | "reprocess",
  comments?: string,
  cropAdjustments?: any
): Promise<any> {
  return request(`/api/image-studio/reviews/${imageId}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ decision, comments, crop_adjustments: cropAdjustments }),
  });
}

export async function submitBulkReview(
  imageIds: number[],
  decision: "approved" | "rejected",
  comments?: string
): Promise<any> {
  return request("/api/image-studio/reviews/bulk-action", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_ids: imageIds, decision, comments }),
  });
}

export async function verifyDriveFolder(folderUrl: string): Promise<any> {
  return request("/api/image-studio/google-drive/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ folder_url: folderUrl }),
  });
}

export async function reapplyPadding(
  imageId: number,
  padding: { top: number; bottom: number; left: number; right: number }
): Promise<any> {
  return request(`/api/image-studio/images/${imageId}/repad`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(padding),
  });
}

export async function updateImageCategory(
  imageId: number,
  productCategory: "FOOD" | "NON_FOOD" | "KITCHEN_ITEMS" | "food" | "non_food"
): Promise<any> {
  return request(`/api/image-studio/images/${imageId}/update-category`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ product_category: productCategory }),
  });
}

export function getImageFileUrl(imageId: number, variant: "original" | "final" = "original"): string {
  return `${API_BASE_URL}/api/image-studio/images/${imageId}/file?variant=${variant}`;
}

export function getExcelReportUrl(batchRef: string | number): string {
  return `${API_BASE_URL}/api/image-studio/reports/batch/${batchRef}/excel`;
}

export function getOutputZipUrl(batchRef: string | number, includeAll: boolean = false): string {
  const query = includeAll ? "?include_all=true" : "";
  return `${API_BASE_URL}/api/image-studio/reports/batch/${batchRef}/zip${query}`;
}

export async function downloadBatchZipFile(batchRef: string | number, filename?: string, includeAll: boolean = false): Promise<void> {
  const url = getOutputZipUrl(batchRef, includeAll);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download ZIP: ${response.statusText}`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  const defaultName = includeAll ? `${batchRef}_all_images.zip` : `${batchRef}_output_images.zip`;
  a.download = filename || defaultName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}

export async function downloadBatchExcelFile(batchRef: string | number, filename?: string): Promise<void> {
  const url = getExcelReportUrl(batchRef);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download Excel report: ${response.statusText}`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename || `${batchRef}_processing_report.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.URL.revokeObjectURL(blobUrl);
}
