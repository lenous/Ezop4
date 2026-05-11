-- ════════════════════════════════════════════════════
-- EZOP 4 - Supabase produkcni schema
-- Spustit v Supabase SQL Editoru.
-- Zachovava kompatibilni public.app_state pro migraci z Ezop3.
-- ════════════════════════════════════════════════════

create extension if not exists pgcrypto;

do $$ begin
  create type public.ezop_role as enum ('operator','tpv','dispatcher','management','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.station_status as enum ('waiting','in_progress','partial','completed','issue','skipped');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.order_priority as enum ('low','normal','high','urgent');
exception when duplicate_object then null; end $$;

-- Kompatibilni blob pro Ezop3 a jednorazovou migraci.
create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  login text not null unique,
  role public.ezop_role not null default 'operator',
  name text not null,
  avatar text not null default '👤',
  color text not null default '#6b7280',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.station_catalog (
  id integer primary key,
  name text not null,
  icon text not null default '🔧',
  active boolean not null default true,
  default_sequence integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.orders (
  id text primary key,
  number text not null unique,
  name text not null,
  customer text not null,
  priority public.order_priority not null default 'normal',
  qty_ordered integer not null check (qty_ordered >= 0),
  order_date date,
  due_date date,
  technology text not null default '',
  production_type text not null default '',
  stencil_number text not null default '',
  purchase_order_number text,
  product_photo_data_url text,
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  name text not null,
  type text not null,
  size_bytes integer not null default 0,
  storage_path text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.order_stations (
  order_id text not null references public.orders(id) on delete cascade,
  station_id integer not null references public.station_catalog(id),
  sequence_no integer not null,
  status public.station_status not null default 'waiting',
  qty_received integer not null default 0 check (qty_received >= 0),
  qty_ok integer not null default 0 check (qty_ok >= 0),
  qty_rework integer not null default 0 check (qty_rework >= 0),
  qty_scrap integer not null default 0 check (qty_scrap >= 0),
  program_name text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  primary key (order_id, station_id),
  unique (order_id, sequence_no),
  constraint order_station_qty_limit check (qty_ok + qty_rework + qty_scrap <= greatest(qty_received, 0))
);

create table if not exists public.station_quantity_events (
  id uuid primary key default gen_random_uuid(),
  order_id text not null references public.orders(id) on delete cascade,
  station_id integer not null references public.station_catalog(id),
  qty_ok integer not null default 0 check (qty_ok >= 0),
  qty_rework integer not null default 0 check (qty_rework >= 0),
  qty_scrap integer not null default 0 check (qty_scrap >= 0),
  source text not null default 'manual',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.production_notes (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  station_id integer references public.station_catalog(id),
  target_scope text not null default 'station',
  target_roles public.ezop_role[],
  type text not null default 'info',
  text text not null,
  author_id uuid references auth.users(id),
  author_name text not null,
  author_role public.ezop_role,
  created_at timestamptz not null default now()
);

create table if not exists public.issues (
  id text primary key,
  order_id text not null references public.orders(id) on delete cascade,
  station_id integer references public.station_catalog(id),
  severity text not null default 'medium',
  description text not null,
  reported_by uuid references auth.users(id),
  reported_by_name text not null,
  reported_by_role public.ezop_role,
  reported_by_login text,
  target_scope text not null default 'all',
  target_label text,
  auto_key text unique,
  reported_at timestamptz not null default now(),
  resolved boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_by_name text,
  resolved_at timestamptz
);

create table if not exists public.issue_recipients (
  issue_id text not null references public.issues(id) on delete cascade,
  recipient_type text not null check (recipient_type in ('role','user','login','all')),
  recipient_value text not null,
  primary key (issue_id, recipient_type, recipient_value)
);

create table if not exists public.product_memory (
  product_key text primary key,
  customer text not null,
  name text not null,
  station_programs jsonb not null default '{}'::jsonb,
  photo_data_url text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.login_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  login text not null,
  success boolean not null,
  source jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  user_name text,
  role public.ezop_role,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  summary text not null,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_settings (
  system_key text primary key,
  enabled boolean not null default false,
  mode text not null default 'disabled',
  direction text not null default 'export_progress',
  config jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_outbox (
  id uuid primary key default gen_random_uuid(),
  system_key text not null,
  event_type text not null,
  entity_type text not null,
  entity_id text not null,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending','sent','failed','skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_profiles_updated_at on public.profiles;
create trigger touch_profiles_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists touch_orders_updated_at on public.orders;
create trigger touch_orders_updated_at before update on public.orders
for each row execute function public.touch_updated_at();

drop trigger if exists touch_order_stations_updated_at on public.order_stations;
create trigger touch_order_stations_updated_at before update on public.order_stations
for each row execute function public.touch_updated_at();

drop trigger if exists touch_integration_settings_updated_at on public.integration_settings;
create trigger touch_integration_settings_updated_at before update on public.integration_settings
for each row execute function public.touch_updated_at();

create or replace function public.current_user_role()
returns public.ezop_role
language sql
security definer
set search_path = public
stable
as $$
  select role from public.profiles where user_id = auth.uid() and active = true
$$;

create or replace function public.has_role(allowed public.ezop_role[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(public.current_user_role() = any(allowed), false)
$$;

alter table public.app_state enable row level security;
alter table public.profiles enable row level security;
alter table public.app_settings enable row level security;
alter table public.station_catalog enable row level security;
alter table public.orders enable row level security;
alter table public.order_documents enable row level security;
alter table public.order_stations enable row level security;
alter table public.station_quantity_events enable row level security;
alter table public.production_notes enable row level security;
alter table public.issues enable row level security;
alter table public.issue_recipients enable row level security;
alter table public.product_memory enable row level security;
alter table public.login_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.integration_settings enable row level security;
alter table public.integration_outbox enable row level security;

-- Reset opakovatelnych policies.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and tablename in (
        'app_state','profiles','app_settings','station_catalog','orders','order_documents',
        'order_stations','station_quantity_events','production_notes','issues','issue_recipients',
        'product_memory','login_events','audit_logs','integration_settings','integration_outbox'
      )
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- app_state je jen kompatibilni migracni fallback.
create policy "app_state authenticated read" on public.app_state
  for select to authenticated using (id = 'main');

create policy "app_state admin write" on public.app_state
  for all to authenticated
  using (id = 'main' and public.has_role(array['admin']::public.ezop_role[]))
  with check (id = 'main' and public.has_role(array['admin']::public.ezop_role[]));

create policy "profiles read own or managers" on public.profiles
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(array['admin','dispatcher','management']::public.ezop_role[]));

create policy "profiles admin write" on public.profiles
  for all to authenticated
  using (public.has_role(array['admin']::public.ezop_role[]))
  with check (public.has_role(array['admin']::public.ezop_role[]));

create policy "settings managers read" on public.app_settings
  for select to authenticated
  using (public.has_role(array['admin','dispatcher','management']::public.ezop_role[]));

create policy "settings admin write" on public.app_settings
  for all to authenticated
  using (public.has_role(array['admin']::public.ezop_role[]))
  with check (public.has_role(array['admin']::public.ezop_role[]));

create policy "station catalog read" on public.station_catalog
  for select to authenticated using (true);

create policy "station catalog managers write" on public.station_catalog
  for all to authenticated
  using (public.has_role(array['admin','dispatcher','management']::public.ezop_role[]))
  with check (public.has_role(array['admin','dispatcher','management']::public.ezop_role[]));

create policy "orders read production roles" on public.orders
  for select to authenticated
  using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "orders create managers" on public.orders
  for insert to authenticated
  with check (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));

create policy "orders update managers" on public.orders
  for update to authenticated
  using (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]))
  with check (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));

create policy "orders delete production managers" on public.orders
  for delete to authenticated
  using (public.has_role(array['tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "order child read" on public.order_documents
  for select to authenticated using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "order child write managers" on public.order_documents
  for all to authenticated
  using (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]))
  with check (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));

create policy "station progress read" on public.order_stations
  for select to authenticated using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "station progress update production" on public.order_stations
  for update to authenticated
  using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]))
  with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "station progress managers insert" on public.order_stations
  for insert to authenticated
  with check (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));
create policy "station progress managers delete" on public.order_stations
  for delete to authenticated
  using (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));

create policy "quantity events read" on public.station_quantity_events
  for select to authenticated using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "quantity events insert" on public.station_quantity_events
  for insert to authenticated with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "notes read" on public.production_notes
  for select to authenticated using (
    target_scope = 'all'
    or target_roles is null
    or public.current_user_role() = any(target_roles)
    or author_id = auth.uid()
  );
create policy "notes insert production" on public.production_notes
  for insert to authenticated with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "notes delete managers" on public.production_notes
  for delete to authenticated using (public.has_role(array['dispatcher','management','admin']::public.ezop_role[]));

create policy "issues read recipients" on public.issues
  for select to authenticated using (
    reported_by = auth.uid()
    or target_scope = 'all'
    or exists (
      select 1 from public.issue_recipients r
      where r.issue_id = issues.id
        and (
          r.recipient_type = 'all'
          or (r.recipient_type = 'role' and r.recipient_value = public.current_user_role()::text)
          or (r.recipient_type = 'user' and r.recipient_value = auth.uid()::text)
          or (r.recipient_type = 'login' and r.recipient_value = (select login from public.profiles where user_id = auth.uid()))
        )
    )
  );
create policy "issues insert production" on public.issues
  for insert to authenticated with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));
create policy "issues resolve managers" on public.issues
  for update to authenticated
  using (public.has_role(array['tpv','dispatcher','management','admin']::public.ezop_role[]))
  with check (public.has_role(array['tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "issue recipients read via issue" on public.issue_recipients
  for select to authenticated using (exists (select 1 from public.issues i where i.id = issue_id));
create policy "issue recipients insert production" on public.issue_recipients
  for insert to authenticated with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "product memory read" on public.product_memory
  for select to authenticated using (true);
create policy "product memory write production" on public.product_memory
  for all to authenticated
  using (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]))
  with check (public.has_role(array['operator','tpv','dispatcher','management','admin']::public.ezop_role[]));

create policy "login events insert own" on public.login_events
  for insert to authenticated with check (user_id = auth.uid() or user_id is null);
create policy "login events admin read" on public.login_events
  for select to authenticated using (public.has_role(array['admin']::public.ezop_role[]));

create policy "audit admin read" on public.audit_logs
  for select to authenticated using (public.has_role(array['admin','management']::public.ezop_role[]));
create policy "audit insert authenticated" on public.audit_logs
  for insert to authenticated with check (true);

create policy "integration settings admin read" on public.integration_settings
  for select to authenticated using (public.has_role(array['admin','management']::public.ezop_role[]));
create policy "integration settings admin write" on public.integration_settings
  for all to authenticated
  using (public.has_role(array['admin']::public.ezop_role[]))
  with check (public.has_role(array['admin']::public.ezop_role[]));

create policy "integration outbox admin read" on public.integration_outbox
  for select to authenticated using (public.has_role(array['admin','management']::public.ezop_role[]));
create policy "integration outbox admin write" on public.integration_outbox
  for all to authenticated
  using (public.has_role(array['admin']::public.ezop_role[]))
  with check (public.has_role(array['admin']::public.ezop_role[]));

-- Realtime pro provozni tabulky. Blok je opakovatelny.
do $$ begin
  alter publication supabase_realtime add table public.orders;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.order_stations;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.production_notes;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.issues;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.issue_recipients;
exception when duplicate_object then null; end $$;

do $$ begin
  alter publication supabase_realtime add table public.integration_outbox;
exception when duplicate_object then null; end $$;
