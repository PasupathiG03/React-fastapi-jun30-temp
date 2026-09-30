import { Navigate, useParams } from "react-router-dom";
import { usePending } from "@/context/PendingContext";

/** /workflows/4/stages/2 (old, id-based) -> /workflows/demo/production */
export default function LegacyStageRedirect() {
  const { workflowId, stageId } = useParams();
  const { ready, routeById } = usePending();
  if (!ready) return null;
  const route = routeById(Number(workflowId), Number(stageId));
  return <Navigate to={route ? route.path : "/dashboard"} replace />;
}
