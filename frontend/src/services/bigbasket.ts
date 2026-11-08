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

export async function retryImageProcessing(imageId: number): Promise<any> {
  return request(`/api/image-studio/images/${imageId}/retry`, {
    method: "POST",
  });
}

export async function retryBatchFailed(batchId: number): Promise<{ message: string; count: number }> {
  return request<{ message: string; count: number }>(`/api/image-studio/batches/${batchId}/retry-failed`, {
    method: "POST",
  });
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

export function getOutputZipUrl(batchRef: string | number): string {
  return `${API_BASE_URL}/api/image-studio/reports/batch/${batchRef}/zip`;
}

export async function downloadBatchZipFile(batchRef: string | number, filename?: string): Promise<void> {
  const url = getOutputZipUrl(batchRef);
  const response = await fetch(url, { credentials: "include" });
  if (!response.ok) {
    throw new Error(`Failed to download ZIP: ${response.statusText}`);
  }
  const blob = await response.blob();
  const blobUrl = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = blobUrl;
  a.download = filename || `${batchRef}_output_images.zip`;
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
