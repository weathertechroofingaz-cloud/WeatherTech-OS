import type {
  DiscountType,
  EstimateLineItemInput,
  PaintFinish,
  PaintingAreaType,
  ScopeCategory,
  ServiceType,
  SurfacePrepLevel,
  Trade,
} from "./types";

export type EstimateTemplate = {
  key: string;
  name: string;
  trade: Trade;
  serviceType: ServiceType;
  scopeCategory: ScopeCategory;
  description: string;
  taxRate: number;
  profitMarginRate: number;
  discountType: DiscountType;
  discountValue: number;
  notes: string;
  lineItems: EstimateLineItemInput[];
  painting?: {
    areaType: PaintingAreaType;
    productLine: string;
    finish: PaintFinish;
    surfacePrepLevel: SurfacePrepLevel;
    coats: number;
    primerRequired: boolean;
  };
};

export const estimateTemplates: EstimateTemplate[] = [
  {
    key: "weathertech_roof_replacement",
    name: "WeatherTech Roof Replacement",
    trade: "roofing",
    serviceType: "roofing",
    scopeCategory: "roofing",
    description: "Full tear-off, dry-in, roof system installation, cleanup, and warranty proposal.",
    taxRate: 8.6,
    profitMarginRate: 18,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes roof system installation per manufacturer specifications, standard flashing details, cleanup, and workmanship documentation. Wood replacement, structural repairs, and concealed conditions are handled by approved change order.",
    lineItems: [
      {
        category: "labor",
        name: "Roof tear-off, dry-in, and installation labor",
        description:
          "Crew labor for property protection, tear-off, dry-in, flashing preparation, roof system installation, cleanup, and final walkthrough.",
        quantity: 1,
        unit: "project",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Roofing material package",
        description:
          "Underlayment, drip edge, flashings, vents, fasteners, sealants, and selected roof covering materials.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 18,
        taxable: true,
        sort_order: 1,
      },
      {
        category: "other",
        name: "Debris disposal and site protection",
        description:
          "Dump fees, magnetic nail sweep, driveway/landscape protection, and final cleanup.",
        quantity: 1,
        unit: "allowance",
        unit_cost: 0,
        markup_rate: 10,
        taxable: true,
        sort_order: 2,
      },
    ],
  },
  {
    key: "weathertech_roof_repair",
    name: "WeatherTech Roof Repair",
    trade: "roofing",
    serviceType: "roofing",
    scopeCategory: "roof_repairs",
    description: "Targeted leak, flashing, tile, shingle, or penetration repair proposal.",
    taxRate: 8.6,
    profitMarginRate: 20,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes targeted repair work in the documented area. Water intrusion sources outside the repaired area, hidden decking damage, and unrelated roof conditions are excluded unless added by change order.",
    lineItems: [
      {
        category: "labor",
        name: "Roof repair labor",
        description:
          "Diagnosis, controlled removal, component replacement, sealant/flashing work, cleanup, and repair photos.",
        quantity: 1,
        unit: "repair",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Repair materials",
        description:
          "Compatible underlayment, flashing, tile/shingle replacement allowance, fasteners, and sealants.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 18,
        taxable: true,
        sort_order: 1,
      },
    ],
  },
  {
    key: "weathertech_tile_underlayment",
    name: "WeatherTech Tile Underlayment",
    trade: "roofing",
    serviceType: "roofing",
    scopeCategory: "tile_underlayment",
    description: "Tile lift, underlayment replacement, flashing work, reset, and cleanup proposal.",
    taxRate: 8.6,
    profitMarginRate: 18,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes tile lift/reset and underlayment replacement in approved work areas. Broken tile allowance, wood replacement, and upgraded flashing details should be confirmed before production.",
    lineItems: [
      {
        category: "labor",
        name: "Tile lift, dry-in, and reset labor",
        description:
          "Careful tile removal/stacking, underlayment replacement, flashing preparation, tile reset, and final cleanup.",
        quantity: 1,
        unit: "project",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Tile underlayment system",
        description:
          "Underlayment, battens, flashing components, fasteners, sealants, and broken tile allowance.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 18,
        taxable: true,
        sort_order: 1,
      },
    ],
  },
  {
    key: "ihc_exterior_painting",
    name: "IHC Exterior Painting",
    trade: "painting",
    serviceType: "painting",
    scopeCategory: "exterior_painting",
    description:
      "Exterior wash, prep, masking, Dunn-Edwards coating system, colors, cleanup, and touch-up proposal.",
    taxRate: 8.6,
    profitMarginRate: 16,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes exterior preparation, masking, Dunn-Edwards coating system, standard touch-ups, and labeled leftover paint. Wood replacement, stucco repairs beyond minor patching, and color changes after approval are excluded unless added by change order.",
    painting: {
      areaType: "exterior",
      productLine: "Dunn-Edwards Evershield",
      finish: "low_sheen",
      surfacePrepLevel: "standard",
      coats: 2,
      primerRequired: true,
    },
    lineItems: [
      {
        category: "labor",
        name: "Exterior prep, masking, and application labor",
        description:
          "Pressure washing, scraping/sanding, caulking, masking, application, cleanup, and touch-up walkthrough.",
        quantity: 1,
        unit: "project",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Dunn-Edwards exterior coating system",
        description:
          "Exterior finish paint, primer, caulk, masking materials, rollers, sprayer supplies, and sundries.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 15,
        taxable: true,
        sort_order: 1,
      },
    ],
  },
  {
    key: "ihc_interior_painting",
    name: "IHC Interior Painting",
    trade: "painting",
    serviceType: "painting",
    scopeCategory: "interior_painting",
    description:
      "Interior room protection, wall/trim prep, Dunn-Edwards finish system, cleanup, and touch-up proposal.",
    taxRate: 8.6,
    profitMarginRate: 15,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes standard interior protection, minor drywall prep, Dunn-Edwards finish coats, cleanup, and room-by-room touch-up review. Furniture moving, major drywall repairs, and color revisions after approval are excluded unless documented.",
    painting: {
      areaType: "interior",
      productLine: "Dunn-Edwards Spartawall",
      finish: "eggshell",
      surfacePrepLevel: "standard",
      coats: 2,
      primerRequired: false,
    },
    lineItems: [
      {
        category: "labor",
        name: "Interior protection, prep, and painting labor",
        description:
          "Floor/furniture protection, masking, patching minor imperfections, sanding, application, cleanup, and touch-up review.",
        quantity: 1,
        unit: "project",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Dunn-Edwards interior coating system",
        description:
          "Interior finish paint, primer allowance, masking supplies, rollers, trays, caulk, and sundries.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 15,
        taxable: true,
        sort_order: 1,
      },
    ],
  },
  {
    key: "ihc_cabinet_refinishing",
    name: "IHC Cabinet Refinishing",
    trade: "painting",
    serviceType: "painting",
    scopeCategory: "cabinet_refinishing",
    description:
      "Cabinet removal/labeling, degreasing, sanding, bonding primer, sprayed finish, cure, and reassembly proposal.",
    taxRate: 8.6,
    profitMarginRate: 18,
    discountType: "fixed",
    discountValue: 0,
    notes:
      "Includes cabinet surface preparation, bonding primer, cabinet-grade finish, hardware labeling, reassembly, cure guidance, and final adjustment review. New hardware, cabinet modifications, and color changes after approval are excluded unless documented.",
    painting: {
      areaType: "cabinet",
      productLine: "Dunn-Edwards Aristoshield",
      finish: "cabinet_finish",
      surfacePrepLevel: "enhanced",
      coats: 2,
      primerRequired: true,
    },
    lineItems: [
      {
        category: "labor",
        name: "Cabinet prep, spray, cure, and reassembly labor",
        description:
          "Door/drawer removal, labeling, degreasing, sanding, masking, priming, finish application, reassembly, and final adjustments.",
        quantity: 1,
        unit: "project",
        unit_cost: 0,
        markup_rate: 0,
        taxable: false,
        sort_order: 0,
      },
      {
        category: "material",
        name: "Dunn-Edwards cabinet finish system",
        description:
          "Bonding primer, cabinet-grade finish, masking materials, sanding supplies, sprayer consumables, and sundries.",
        quantity: 1,
        unit: "package",
        unit_cost: 0,
        markup_rate: 15,
        taxable: true,
        sort_order: 1,
      },
    ],
  },
];

export function getEstimateTemplatesForTrade(trade: Trade | undefined) {
  if (!trade || trade === "both") {
    return estimateTemplates;
  }

  return estimateTemplates.filter((template) => template.trade === trade);
}
