alter table public.estimates
add column if not exists painting_area_type text,
add column if not exists paint_brand text default 'Dunn-Edwards',
add column if not exists paint_product_line text,
add column if not exists paint_finish text,
add column if not exists color_selection_status text default 'not_started',
add column if not exists paint_color_body text,
add column if not exists paint_color_trim text,
add column if not exists paint_color_accent text,
add column if not exists surface_prep_level text,
add column if not exists coats integer default 2,
add column if not exists primer_required boolean default false;

update public.estimates
set
  paint_brand = coalesce(paint_brand, 'Dunn-Edwards'),
  color_selection_status = coalesce(color_selection_status, 'not_started'),
  coats = coalesce(coats, 2),
  primer_required = coalesce(primer_required, false);

alter table public.estimates
alter column paint_brand set default 'Dunn-Edwards',
alter column paint_brand set not null,
alter column color_selection_status set default 'not_started',
alter column color_selection_status set not null,
alter column coats set default 2,
alter column coats set not null,
alter column primer_required set default false,
alter column primer_required set not null;

alter table public.estimates
drop constraint if exists estimates_painting_area_type_check,
add constraint estimates_painting_area_type_check
check (
  painting_area_type is null
  or painting_area_type in ('interior', 'exterior', 'cabinet', 'multi_area', 'touch_up')
);

alter table public.estimates
drop constraint if exists estimates_paint_finish_check,
add constraint estimates_paint_finish_check
check (
  paint_finish is null
  or paint_finish in (
    'flat',
    'velvet',
    'eggshell',
    'low_sheen',
    'satin',
    'semi_gloss',
    'gloss',
    'cabinet_finish'
  )
);

alter table public.estimates
drop constraint if exists estimates_color_selection_status_check,
add constraint estimates_color_selection_status_check
check (
  color_selection_status in (
    'not_started',
    'in_review',
    'approved',
    'change_requested'
  )
);

alter table public.estimates
drop constraint if exists estimates_surface_prep_level_check,
add constraint estimates_surface_prep_level_check
check (
  surface_prep_level is null
  or surface_prep_level in ('standard', 'enhanced', 'restoration')
);

alter table public.estimates
drop constraint if exists estimates_coats_check,
add constraint estimates_coats_check
check (coats between 1 and 4);

create index if not exists estimates_painting_area_type_idx
on public.estimates(painting_area_type);

create index if not exists estimates_color_selection_status_idx
on public.estimates(color_selection_status);

with ihc_company as (
  select id as company_id
  from public.companies
  where name = 'IHC Painting'
  limit 1
)
insert into public.scope_templates (
  id,
  company_id,
  title,
  category,
  description,
  template_body,
  ai_prompt,
  is_active
)
select
  template.id,
  ihc_company.company_id,
  template.title,
  template.category,
  template.description,
  template.template_body,
  template.ai_prompt,
  true
from ihc_company
cross join (
  values
    (
      '00000000-0000-4000-8000-000000000102'::uuid,
      'Exterior Painting',
      'exterior_painting',
      'IHC exterior preparation, masking, Dunn-Edwards coating, color placement, and cleanup scope.',
      '1. Confirm approved body, trim, door, and accent colors before mobilization.\n2. Wash exterior surfaces, protect hardscape, landscaping, fixtures, roofing, and adjacent properties.\n3. Scrape loose coatings, sand failing edges, patch minor cracks, caulk open seams, and spot-prime bare surfaces.\n4. Apply approved Dunn-Edwards exterior coating system in the selected sheen to body, fascia, trim, doors, and accents.\n5. Maintain clean work zones, manage overspray protection, label leftover paint, and complete a color/touch-up walkthrough.',
      'Generate an IHC exterior painting scope using property details, surface materials, prep level, Dunn-Edwards product line, sheen, body/trim/accent colors, access needs, masking protections, exclusions, and final walkthrough requirements.'
    ),
    (
      '00000000-0000-4000-8000-000000000103'::uuid,
      'Interior Painting',
      'interior_painting',
      'IHC interior room schedule with protection, wall prep, Dunn-Edwards finish system, and final touch-ups.',
      '1. Confirm room schedule, wall/ceiling/trim colors, sheen selections, and occupied-home access plan.\n2. Move or cover furniture, protect flooring, mask fixtures, outlets, cabinetry, countertops, and adjacent surfaces.\n3. Patch minor drywall imperfections, sand repairs, spot-prime stains or raw surfaces, and document any excluded repairs.\n4. Apply approved Dunn-Edwards primer and finish coats to scheduled walls, ceilings, doors, baseboards, and trim.\n5. Remove masking, reset rooms, label leftover paint by room, and complete customer touch-up review.',
      'Generate an IHC interior painting scope with room-by-room surfaces, color placement, Dunn-Edwards products, sheen, prep level, protection requirements, access schedule, exclusions, and touch-up process.'
    ),
    (
      '00000000-0000-4000-8000-000000000104'::uuid,
      'Cabinet Refinishing',
      'cabinet_refinishing',
      'IHC cabinet refinishing workflow with labeling, degreasing, sanding, bonding primer, sprayed finish, and cure guidance.',
      '1. Confirm cabinet count, door/drawer layout, hardware plan, color, sheen, and work area ventilation requirements.\n2. Remove and label doors, drawer fronts, pulls, hinges, and hardware needed for clean reassembly.\n3. Clean, degrease, scuff-sand, fill minor imperfections, mask surrounding surfaces, and apply bonding primer.\n4. Spray or apply selected Dunn-Edwards cabinet-grade finish to doors, drawer fronts, face frames, and boxes.\n5. Reinstall after cure window, align hardware, provide care instructions, and complete final touch-up walkthrough.',
      'Generate an IHC cabinet refinishing scope with cabinet count, color, sheen, Dunn-Edwards coating system, hardware handling, masking, ventilation, cure timing, exclusions, and customer care notes.'
    )
) as template(id, title, category, description, template_body, ai_prompt)
on conflict (id) do update
set
  company_id = excluded.company_id,
  title = excluded.title,
  category = excluded.category,
  description = excluded.description,
  template_body = excluded.template_body,
  ai_prompt = excluded.ai_prompt,
  is_active = excluded.is_active,
  updated_at = now();

update public.company_workflow_settings
set
  estimate_terms = 'IHC Painting estimates remain valid through the expiration date and are subject to confirmed colors, access, surface condition, selected Dunn-Edwards product system, and approved prep scope.',
  warranty_terms = 'IHC Painting workmanship warranty is governed by prep level, coating manufacturer requirements, moisture conditions, maintenance, and the signed agreement.',
  production_checklist = '["Confirm Dunn-Edwards product line and sheen", "Approve body, trim, accent, cabinet, or room colors", "Protect floors, hardscape, fixtures, roofing, landscaping, and adjacent surfaces", "Complete prep and masking review", "Capture before, progress, and final photos", "Label leftover paint and complete final touch-up walkthrough"]'::jsonb,
  updated_at = now()
where company_id = (
  select id
  from public.companies
  where name = 'IHC Painting'
  limit 1
);
