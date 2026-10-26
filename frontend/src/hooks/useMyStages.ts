import { useEffect, useMemo, useState } from "react";
import { useLive } from "@/context/LiveContext";
import { buildStageRoutes } from "@/lib/slug";
import { fetchMyStages, type MyWorkflow } from "@/services/workflow";

type Stage = MyWorkflow["stages"][number];

/**
 * The workflows/stages this user can open, and a lookup from a stage address (/workflows/<workflow>/<stage>)
 * back to the real names. Uses the same slugs the sidebar builds its links from, so every place that shows a
 * stage (sidebar, breadcrumb, stage page) agrees. Refreshes when access changes.
 */
export function useMyStages() {
  const { accessVersion } = useLive();
  const [workflows, setWorkflows] = useState<MyWorkflow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyStages()
      .then((list) => !cancelled && setWorkflows(list))
      .catch(() => !cancelled && setWorkflows([]));
    return () => {
      cancelled = true;
    };
  }, [accessVersion]);

  const routes = useMemo(
    () =>
      buildStageRoutes(
        (workflows ?? []).flatMap((w) =>
          w.stages.map((s) => ({
            workflow_id: w.id,
            workflow_name: w.name,
            stage_id: s.id,
            stage_name: s.name,
            sequence_order: s.sequence_order,
          }))
        )
      ),
    [workflows]
  );

  function resolve(workflowSlug?: string, stageSlug?: string): { workflow: MyWorkflow; stage: Stage } | null {
    const route = routes.find((r) => r.workflowSlug === workflowSlug && r.stageSlug === stageSlug);
    const workflow = workflows?.find((w) => w.id === route?.workflowId);
    const stage = workflow?.stages.find((s) => s.id === route?.stageId);
    return workflow && stage ? { workflow, stage } : null;
  }

  return { loading: workflows === null, resolve, workflows: workflows ?? [], routes };
}
