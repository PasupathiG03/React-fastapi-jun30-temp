import { useState } from "react";
import { bgRemoveImage, type BgRemoveProvider } from "@/services/bgRemove";
import { showError, showSuccess } from "@/lib/toast";

const PROVIDER_LABEL: Record<BgRemoveProvider, string> = {
  birefnet: "Local AI (BiRefNet)",
  photoroom: "Cloud AI (Photoroom)",
};

/**
 * Re-runs one image with background removal forced on and Gemini image classification skipped.
 * `running` is the provider currently in flight (null when idle).
 */
export function useBgRemoveRun(onDone: (updated: any) => void) {
  const [running, setRunning] = useState<BgRemoveProvider | null>(null);

  async function run(imageId: number | null | undefined, provider: BgRemoveProvider) {
    if (!imageId || running) return;
    setRunning(provider);
    try {
      const updated = await bgRemoveImage(imageId, provider);
      onDone(updated);
      if (updated.status === "processing") {
        showSuccess(
          `${PROVIDER_LABEL[provider]} background removal task queued for SKU ${updated.bbid || imageId}...`
        );
      } else if (updated.error_message) {
        showError(updated.error_message);
      } else {
        showSuccess(
          `${PROVIDER_LABEL[provider]} removed the background for SKU ${updated.bbid} without classification ` +
            `(Confidence: ${Math.round((updated.confidence_score || 0) * 100)}%).`
        );
      }
    } catch (e: any) {
      showError(e.message || `${PROVIDER_LABEL[provider]} background removal failed`);
    } finally {
      setRunning(null);
    }
  }

  return { running, run };
}
