alter table public.leads
add column if not exists updated_at timestamptz not null default now();

alter table public.leads
add column if not exists pipeline_stage text;

update public.leads
set pipeline_stage = case
  when pipeline_stage in (
    'new_lead',
    'contacted',
    'estimate_scheduled',
    'estimate_sent',
    'approved',
    'job_scheduled',
    'completed',
    'paid',
    'lost'
  ) then pipeline_stage
  when status = 'contacted' then 'contacted'
  when status = 'qualified' then 'estimate_scheduled'
  when status = 'estimate_sent' then 'estimate_sent'
  when status = 'won' then 'approved'
  when status = 'lost' then 'lost'
  else 'new_lead'
end
where pipeline_stage is null
  or pipeline_stage not in (
    'new_lead',
    'contacted',
    'estimate_scheduled',
    'estimate_sent',
    'approved',
    'job_scheduled',
    'completed',
    'paid',
    'lost'
  );

alter table public.leads
alter column pipeline_stage set default 'new_lead';

alter table public.leads
alter column pipeline_stage set not null;

alter table public.leads
drop constraint if exists leads_pipeline_stage_check;

alter table public.leads
add constraint leads_pipeline_stage_check
check (
  pipeline_stage in (
    'new_lead',
    'contacted',
    'estimate_scheduled',
    'estimate_sent',
    'approved',
    'job_scheduled',
    'completed',
    'paid',
    'lost'
  )
);

create index if not exists leads_pipeline_stage_idx
on public.leads(pipeline_stage);
