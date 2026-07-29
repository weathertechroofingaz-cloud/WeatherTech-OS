create table if not exists public.job_tasks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'todo' check (
    status in ('todo', 'in_progress', 'done')
  ),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.job_notes (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.job_materials (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.jobs(id) on delete cascade,
  name text not null,
  quantity numeric(12, 2) not null default 1,
  unit text not null default 'each',
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists job_tasks_job_id_idx
on public.job_tasks(job_id);

create index if not exists job_tasks_job_sort_idx
on public.job_tasks(job_id, sort_order);

create index if not exists job_notes_job_id_idx
on public.job_notes(job_id);

create index if not exists job_notes_created_at_idx
on public.job_notes(created_at);

create index if not exists job_materials_job_id_idx
on public.job_materials(job_id);

drop trigger if exists set_job_tasks_updated_at on public.job_tasks;
create trigger set_job_tasks_updated_at
before update on public.job_tasks
for each row execute function public.set_updated_at();

alter table public.job_tasks enable row level security;
alter table public.job_notes enable row level security;
alter table public.job_materials enable row level security;

drop policy if exists "Authenticated users manage job tasks" on public.job_tasks;
create policy "Authenticated users manage job tasks"
on public.job_tasks for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users manage job notes" on public.job_notes;
create policy "Authenticated users manage job notes"
on public.job_notes for all
to authenticated
using (true)
with check (true);

drop policy if exists "Authenticated users manage job materials" on public.job_materials;
create policy "Authenticated users manage job materials"
on public.job_materials for all
to authenticated
using (true)
with check (true);

grant select, insert, update, delete on public.job_tasks to authenticated, service_role;
grant select, insert, update, delete on public.job_notes to authenticated, service_role;
grant select, insert, update, delete on public.job_materials to authenticated, service_role;
