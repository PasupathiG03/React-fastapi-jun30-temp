import { Loader2 } from "lucide-react";

/** Suspense fallback for a lazy-loaded route whose JS chunk hasn't finished fetching yet. Shown only
 * for that brief gap (first visit to a page, slow connection) -- a blank flash there read as broken. */
export default function RouteLoader() {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[50vh]">
      <Loader2 className="w-6 h-6 text-sky-500 animate-spin" />
    </div>
  );
}
