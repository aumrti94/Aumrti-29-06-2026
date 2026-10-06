import React from "react";
import { cn } from "@/lib/utils";

/**
 * A plain informational marker — deliberately NOT StatusBadge. StatusBadge implies a tracked
 * entity with a real lifecycle (pending → fulfilled); nothing on the Quick Scribe screen is
 * that. Kept visually distinct from a confirmed/actioned state (no green, no checkmark) until
 * the doctor has actually reviewed the draft.
 */
interface SectionChipProps {
  label: string;
  tone?: "draft" | "neutral";
  className?: string;
}

const SectionChip: React.FC<SectionChipProps> = ({ label, tone = "draft", className }) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
      tone === "draft" ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-muted text-muted-foreground border border-border",
      className,
    )}
  >
    {label}
  </span>
);

export default SectionChip;
