-- Keep generated tasks lifecycle-bound to their one required CRM source.
begin;

alter table public.office_tasks
drop constraint if exists office_tasks_lead_id_fkey,
drop constraint if exists office_tasks_inspection_id_fkey,
drop constraint if exists office_tasks_estimate_id_fkey,
drop constraint if exists office_tasks_job_id_fkey;

alter table public.office_tasks
add constraint office_tasks_lead_id_fkey
  foreign key (lead_id) references public.leads(id) on delete cascade,
add constraint office_tasks_inspection_id_fkey
  foreign key (inspection_id) references public.inspections(id) on delete cascade,
add constraint office_tasks_estimate_id_fkey
  foreign key (estimate_id) references public.estimates(id) on delete cascade,
add constraint office_tasks_job_id_fkey
  foreign key (job_id) references public.jobs(id) on delete cascade;

commit;
