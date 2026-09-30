import type { ElementType } from "react";
import { BadgeCheck, ClipboardCheck, Factory } from "lucide-react";

export type StageTypeKey = "production" | "qc" | "qa";

const STAGE_TYPE_ICONS: Record<StageTypeKey, ElementType> = {
  production: Factory,
  qc: ClipboardCheck,
  qa: BadgeCheck,
};

/** The icon of a workflow stage. It depends only on the stage type, never on the (custom) name. */
export function getStageIcon(stageType: StageTypeKey): ElementType {
  return STAGE_TYPE_ICONS[stageType] ?? Factory;
}
