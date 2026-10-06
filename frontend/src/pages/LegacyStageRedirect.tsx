import { Navigate } from "react-router-dom";

export default function LegacyStageRedirect() {
  return <Navigate to="/access-control/workflow-management" replace />;
}
