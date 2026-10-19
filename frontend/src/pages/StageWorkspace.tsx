import { useParams } from "react-router-dom";
import PageContainer, { PageHeader } from "@/components/PageContainer";
import { useMyStages } from "@/hooks/useMyStages";
import { getStageIcon } from "@/lib/stageIcons";

// A workflow stage opened from the sidebar (/workflows/<workflow>/<stage>). Work items were removed, so the
// page is intentionally empty for now: it only shows which stage is open.
export default function StageWorkspacePage() {
  const { workflowSlug, stageSlug } = useParams();
  const { loading, resolve } = useMyStages();
  const found = resolve(workflowSlug, stageSlug);

  return (
    <PageContainer>
      <PageHeader
        icon={getStageIcon(found?.stage.stage_type ?? "production")}
        title={found?.stage.name ?? (loading ? "" : "Stage not found")}
        subtitle={found?.workflow.name ?? ""}
        loading={loading}
      />
    </PageContainer>
  );
}
