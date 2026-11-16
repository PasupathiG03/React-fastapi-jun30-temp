import { API_BASE_URL } from "@/lib/constants";

export type BgRemoveProvider = "birefnet" | "photoroom";

/** Re-runs background removal + standardization for one image, skipping image classification. */
export async function bgRemoveImage(imageId: number, provider: BgRemoveProvider = "birefnet"): Promise<any> {
  const res = await fetch(`${API_BASE_URL}/api/image-studio/images/${imageId}/bg-remove?provider=${provider}`, {
    method: "POST",
    credentials: "include",
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let detail = "BG Remove failed";
    try {
      const data = await res.json();
      detail = data.detail || data.message || detail;
    } catch {
      // keep default message
    }
    throw new Error(detail);
  }
  return res.json();
}
