import { createContext, useContext, useMemo } from "react";
import { type StageRoute } from "@/lib/slug";

export interface PendingStage {
  workflow_id: number;
  workflow_name: string;
  stage_id: number;
  stage_name: string;
  stage_type: string;
  sequence_order: number;
  count: number;
}

interface PendingValue {
  stages: PendingStage[];
  total: number;
  refresh: () => Promise<void>;
  countFor: (stageId: number) => number;
  ready: boolean;
  pathFor: (stageId: number) => string;
  resolve: (workflowSlug: string, stageSlug: string) => StageRoute | null;
  routeById: (workflowId: number, stageId: number) => StageRoute | null;
}

const PendingContext = createContext<PendingValue>({
  stages: [],
  total: 0,
  refresh: async () => {},
  countFor: () => 0,
  ready: true,
  pathFor: () => "/dashboard",
  resolve: () => null,
  routeById: () => null,
});

export const usePending = () => useContext(PendingContext);

export function PendingProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo<PendingValue>(
    () => ({
      stages: [],
      total: 0,
      refresh: async () => {},
      countFor: () => 0,
      ready: true,
      pathFor: () => "/dashboard",
      resolve: () => null,
      routeById: () => null,
    }),
    []
  );

  return (
    <PendingContext.Provider value={value}>
      {children}
    </PendingContext.Provider>
  );
}
