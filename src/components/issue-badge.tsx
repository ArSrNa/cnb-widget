import { CircleCheck, CircleDashed, CircleHelp, CircleX, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ISSUE_STATE_META, type IssueState } from "@/lib/npc";

const ICONS = {
  NPC_WORKING: LoaderCircle,
  NPC_REPLIED: CircleCheck,
  NPC_FAILED: CircleX,
  NPC_QUEUED: CircleDashed,
  WAITING_REPLY: CircleHelp,
};

export function IssueBadge({ state, count }: { state: IssueState; count?: number }) {
  const Icon = ICONS[state];
  const variant = state === "NPC_FAILED" ? "destructive" : state === "NPC_WORKING" ? "default" : "secondary";
  return (
    <Badge variant={variant}>
      <Icon data-icon="inline-start" />
      {ISSUE_STATE_META[state].label}
      {count !== undefined && <span className="tabular-nums">{count}</span>}
    </Badge>
  );
}
