import type {
  ColorSelectionStatus,
  CompanyRecord,
  EstimateRecord,
  PaintFinish,
  PaintingAreaType,
  SurfacePrepLevel,
} from "./types";

export const paintingAreaTypes: { value: PaintingAreaType; label: string }[] = [
  { value: "interior", label: "Interior" },
  { value: "exterior", label: "Exterior" },
  { value: "cabinet", label: "Cabinet refinishing" },
  { value: "multi_area", label: "Multi-area project" },
  { value: "touch_up", label: "Touch-up" },
];

export const paintFinishOptions: { value: PaintFinish; label: string }[] = [
  { value: "flat", label: "Flat" },
  { value: "velvet", label: "Velvet" },
  { value: "eggshell", label: "Eggshell" },
  { value: "low_sheen", label: "Low sheen" },
  { value: "satin", label: "Satin" },
  { value: "semi_gloss", label: "Semi-gloss" },
  { value: "gloss", label: "Gloss" },
  { value: "cabinet_finish", label: "Cabinet-grade finish" },
];

export const colorSelectionStatuses: {
  value: ColorSelectionStatus;
  label: string;
}[] = [
  { value: "not_started", label: "Not started" },
  { value: "in_review", label: "In review" },
  { value: "approved", label: "Approved" },
  { value: "change_requested", label: "Change requested" },
];

export const surfacePrepLevels: { value: SurfacePrepLevel; label: string }[] = [
  { value: "standard", label: "Standard prep" },
  { value: "enhanced", label: "Enhanced prep" },
  { value: "restoration", label: "Restoration prep" },
];

export const dunnEdwardsProductLines = [
  "Dunn-Edwards Spartawall",
  "Dunn-Edwards Suprema",
  "Dunn-Edwards Everest",
  "Dunn-Edwards Evershield",
  "Dunn-Edwards Aristoshield",
  "Dunn-Edwards Decoglo",
  "Dunn-Edwards Aristowall",
];

export function isPaintingCompany(company: CompanyRecord | null | undefined) {
  return company?.trade === "painting" || company?.workflow_profile === "painting";
}

export function isPaintingEstimate(
  estimate: EstimateRecord | null | undefined,
  company?: CompanyRecord | null,
) {
  return estimate?.service_type === "painting" || isPaintingCompany(company);
}

export function paintingAreaLabel(value: PaintingAreaType | null | undefined) {
  return paintingAreaTypes.find((area) => area.value === value)?.label ?? "Not set";
}

export function paintFinishLabel(value: PaintFinish | null | undefined) {
  return paintFinishOptions.find((finish) => finish.value === value)?.label ?? "Not set";
}

export function colorSelectionStatusLabel(
  value: ColorSelectionStatus | null | undefined,
) {
  return (
    colorSelectionStatuses.find((status) => status.value === value)?.label ??
    "Not started"
  );
}

export function surfacePrepLabel(value: SurfacePrepLevel | null | undefined) {
  return surfacePrepLevels.find((level) => level.value === value)?.label ?? "Not set";
}
