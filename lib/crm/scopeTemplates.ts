import type { ScopeCategory, ScopeTemplateRecord } from "./types";

const now = new Date("2026-06-26T12:00:00.000Z").toISOString();

type ScopeTemplateSeed = Omit<
  ScopeTemplateRecord,
  "company_id" | "created_at" | "updated_at"
> & {
  company_id?: string | null;
};

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
    description:
      "IHC exterior preparation, masking, Dunn-Edwards coating, color placement, and cleanup scope.",
    template_body:
      "1. Confirm approved body, trim, door, and accent colors before mobilization.\n2. Wash exterior surfaces, protect hardscape, landscaping, fixtures, roofing, and adjacent properties.\n3. Scrape loose coatings, sand failing edges, patch minor cracks, caulk open seams, and spot-prime bare surfaces.\n4. Apply approved Dunn-Edwards exterior coating system in the selected sheen to body, fascia, trim, doors, and accents.\n5. Maintain clean work zones, manage overspray protection, label leftover paint, and complete a color/touch-up walkthrough.",
    ai_prompt:
      "Generate an IHC exterior painting scope using property details, surface materials, prep level, Dunn-Edwards product line, sheen, body/trim/accent colors, access needs, masking protections, exclusions, and final walkthrough requirements.",
    is_active: true,
  },
  {
    id: "template-interior-painting",
    title: "Interior Painting",
    category: "interior_painting",
    description:
      "IHC interior room schedule with protection, wall prep, Dunn-Edwards finish system, and final touch-ups.",
    template_body:
      "1. Confirm room schedule, wall/ceiling/trim colors, sheen selections, and occupied-home access plan.\n2. Move or cover furniture, protect flooring, mask fixtures, outlets, cabinetry, countertops, and adjacent surfaces.\n3. Patch minor drywall imperfections, sand repairs, spot-prime stains or raw surfaces, and document any excluded repairs.\n4. Apply approved Dunn-Edwards primer and finish coats to scheduled walls, ceilings, doors, baseboards, and trim.\n5. Remove masking, reset rooms, label leftover paint by room, and complete customer touch-up review.",
    ai_prompt:
      "Generate an IHC interior painting scope with room-by-room surfaces, color placement, Dunn-Edwards products, sheen, prep level, protection requirements, access schedule, exclusions, and touch-up process.",
    is_active: true,
  },
  {
    id: "template-cabinet-refinishing",
    title: "Cabinet Refinishing",
    category: "cabinet_refinishing",
    description:
      "IHC cabinet refinishing workflow with labeling, degreasing, sanding, bonding primer, sprayed finish, and cure guidance.",
    template_body:
      "1. Confirm cabinet count, door/drawer layout, hardware plan, color, sheen, and work area ventilation requirements.\n2. Remove and label doors, drawer fronts, pulls, hinges, and hardware needed for clean reassembly.\n3. Clean, degrease, scuff-sand, fill minor imperfections, mask surrounding surfaces, and apply bonding primer.\n4. Spray or apply selected Dunn-Edwards cabinet-grade finish to doors, drawer fronts, face frames, and boxes.\n5. Reinstall after cure window, align hardware, provide care instructions, and complete final touch-up walkthrough.",
    ai_prompt:
      "Generate an IHC cabinet refinishing scope with cabinet count, color, sheen, Dunn-Edwards coating system, hardware handling, masking, ventilation, cure timing, exclusions, and customer care notes.",
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
    company_id: template.company_id ?? null,
    created_at: now,
    updated_at: now,
  }),
);
