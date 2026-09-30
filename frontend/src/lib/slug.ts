import type { PendingStage } from "@/services/workflow";

/** "QC Review (Final)" -> "qc-review-final". */
export function slugify(name: string): string {
  const s = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "item";
}

/** Adds -2, -3... so every slug in one list is unique (stable: earlier entries keep the plain slug). */
function uniqueSlugs(names: string[]): string[] {
  const used = new Map<string, number>();
  return names.map((n) => {
    const base = slugify(n);
    const seen = (used.get(base) ?? 0) + 1;
    used.set(base, seen);
    return seen === 1 ? base : `${base}-${seen}`;
  });
}

export interface StageRoute {
  workflowId: number;
  stageId: number;
  workflowSlug: string;
  stageSlug: string;
  path: string;
}

/**
 * Readable, id-free addresses for the stages a user can open: /workflows/<workflow>/<stage>.
 * Built from the list of accessible stages, so the sidebar, bell, dashboard and stage page always
 * agree on the same slugs.
 */
export function buildStageRoutes(stages: PendingStage[]): StageRoute[] {
  const byWorkflow = new Map<number, PendingStage[]>();
  for (const s of stages) {
    if (!byWorkflow.has(s.workflow_id)) byWorkflow.set(s.workflow_id, []);
    byWorkflow.get(s.workflow_id)!.push(s);
  }
  const workflows = [...byWorkflow.entries()].sort((a, b) => a[0] - b[0]);
  const workflowSlugs = uniqueSlugs(workflows.map(([, list]) => list[0].workflow_name));

  const routes: StageRoute[] = [];
  workflows.forEach(([workflowId, list], i) => {
    const ordered = [...list].sort((a, b) => a.sequence_order - b.sequence_order || a.stage_id - b.stage_id);
    const stageSlugs = uniqueSlugs(ordered.map((s) => s.stage_name));
    ordered.forEach((s, j) => {
      routes.push({
        workflowId,
        stageId: s.stage_id,
        workflowSlug: workflowSlugs[i],
        stageSlug: stageSlugs[j],
        path: `/workflows/${workflowSlugs[i]}/${stageSlugs[j]}`,
      });
    });
  });
  return routes;
}
