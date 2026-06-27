import type { ScopeCategory, ScopeTemplateRecord } from "./types";

const now = new Date("2026-06-26T12:00:00.000Z").toISOString();

type ScopeTemplateSeed = Omit<ScopeTemplateRecord, "created_at" | "updated_at">;

export const scopeCategoryLabels: Record<ScopeCategory, string> = {
  roofing: "Roofing",
  exterior_painting: "Exterior Painting",
  interior_painting: "Interior Painting",
  cabinet_refinishing: "Cabinet Refinishing",
  roof_repairs: "Roof Repairs",
  tile_underlayment: "Tile Underlayment",
  custom: "Custom",
};

export const scopeTemplateSeeds: ScopeTemplateSeed[] = [
  {
    id: "template-roofing",
    title: "Roof Replacement",
    category: "roofing",
    description: "Full roofing replacement scope with tear-off, dry-in, and cleanup.",
    template_body:
      "1. Protect landscaping, driveway, and adjacent surfaces before work begins.\n2. Remove existing roofing materials down to suitable decking.\n3. Inspect decking and notify customer of any required wood replacement.\n4. Install underlayment, flashings, drip edge, penetrations, and roof covering per manufacturer specifications.\n5. Haul away job debris and complete magnetic nail sweep.\n6. Provide final walkthrough and workmanship documentation.",
    ai_prompt:
      "Generate a professional roof replacement scope using customer property details, roof system, material selection, exclusions, warranty notes, and cleanup requirements.",
    is_active: true,
  },
  {
    id: "template-exterior-painting",
    title: "Exterior Painting",
    category: "exterior_painting",
    description: "Exterior preparation, masking, coating, and cleanup scope.",
    template_body:
      "1. Pressure wash exterior surfaces scheduled for coating.\n2. Scrape loose paint, sand rough edges, and spot-prime bare areas.\n3. Caulk open seams and mask windows, fixtures, hardscape, and landscaping.\n4. Apply approved exterior coating system to body, trim, fascia, doors, and selected accents.\n5. Remove masking, clean work areas, and perform final touch-ups.",
    ai_prompt:
      "Generate an exterior painting scope with prep level, surface repairs, coating system, color areas, exclusions, access notes, and final walkthrough steps.",
    is_active: true,
  },
  {
    id: "template-interior-painting",
    title: "Interior Painting",
    category: "interior_painting",
    description: "Interior room painting scope with protection and finish schedule.",
    template_body:
      "1. Move or cover furniture and protect flooring before painting.\n2. Patch minor wall imperfections and sand prepared areas.\n3. Mask fixtures, trim edges, and adjacent surfaces.\n4. Apply selected primer and finish coats to approved walls, ceilings, doors, and trim.\n5. Remove protection, clean rooms, and complete touch-up walkthrough.",
    ai_prompt:
      "Generate an interior painting scope with rooms, surfaces, prep requirements, paint finish, color selections, exclusions, and occupancy coordination.",
    is_active: true,
  },
  {
    id: "template-cabinet-refinishing",
    title: "Cabinet Refinishing",
    category: "cabinet_refinishing",
    description: "Cabinet cleaning, sanding, priming, spraying, and reassembly scope.",
    template_body:
      "1. Remove cabinet doors and drawer fronts and label hardware for reassembly.\n2. Clean and degloss cabinet surfaces scheduled for refinishing.\n3. Sand, fill minor imperfections, and apply bonding primer.\n4. Apply selected cabinet-grade finish to doors, drawer fronts, and boxes.\n5. Reinstall doors, drawers, and hardware after cure window.",
    ai_prompt:
      "Generate a cabinet refinishing scope with cabinet count, finish system, hardware handling, masking, cure timing, exclusions, and customer care notes.",
    is_active: true,
  },
  {
    id: "template-roof-repairs",
    title: "Roof Repairs",
    category: "roof_repairs",
    description: "Targeted roof leak or damaged area repair scope.",
    template_body:
      "1. Identify affected roof area and document current conditions.\n2. Remove damaged materials only as needed to complete repair.\n3. Replace compromised underlayment, flashing, tile, shingle, or sealant components.\n4. Water-test repair area when practical and clean affected work zone.\n5. Provide repair photos and recommended maintenance notes.",
    ai_prompt:
      "Generate a targeted roof repair scope with leak location, diagnosis, affected materials, repair method, limitations, and photo documentation requirements.",
    is_active: true,
  },
  {
    id: "template-tile-underlayment",
    title: "Tile Underlayment",
    category: "tile_underlayment",
    description: "Tile lift, underlayment replacement, and reset scope.",
    template_body:
      "1. Carefully lift and stack existing roof tile from work areas.\n2. Remove failed underlayment and inspect exposed decking.\n3. Replace damaged wood only as approved by customer.\n4. Install new tile underlayment, flashings, battens, and related waterproofing.\n5. Reset existing tile, replace broken tile as needed, and clean the work area.",
    ai_prompt:
      "Generate a tile underlayment replacement scope with tile handling, underlayment system, flashing details, broken tile allowance, wood replacement process, and cleanup.",
    is_active: true,
  },
];

export const demoScopeTemplates: ScopeTemplateRecord[] = scopeTemplateSeeds.map(
  (template) => ({
    ...template,
    created_at: now,
    updated_at: now,
  }),
);
