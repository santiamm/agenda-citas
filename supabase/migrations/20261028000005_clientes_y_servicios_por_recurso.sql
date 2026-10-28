-- Clientes (para historial y mensualidades) y qué recurso hace qué servicio.

create table public.customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null check (phone ~ '^[0-9]{7,15}$'),
  name text not null check (length(btrim(name)) between 2 and 80),
  notes text check (length(notes) <= 1000),
  created_at timestamptz not null default now(),
  unique (business_id, phone)
);

alter table public.appointments add column customer_id uuid references public.customers (id) on delete set null;
alter table public.appointments add column source text not null default 'web'
  check (source in ('web', 'owner', 'bot'));
-- El dueño puede anotar a alguien que llegó sin reserva y sin dar teléfono.
alter table public.appointments alter column customer_phone drop not null;
create index on public.appointments (customer_id);

insert into public.customers (business_id, phone, name)
select distinct on (business_id, customer_phone) business_id, customer_phone, customer_name
from public.appointments
where customer_phone is not null
order by business_id, customer_phone, created_at desc
on conflict do nothing;

update public.appointments a set customer_id = c.id
from public.customers c
where c.business_id = a.business_id and c.phone = a.customer_phone and a.customer_id is null;

-- Si un servicio no tiene filas aquí, lo hacen todos. Si tiene, solo los listados.
create table public.resource_services (
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  primary key (resource_id, service_id)
);
create index on public.resource_services (service_id);

alter table public.customers enable row level security;
alter table public.resource_services enable row level security;

create policy "dueño gestiona clientes" on public.customers for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "quién hace qué visible" on public.resource_services for select using (true);
create policy "dueño gestiona quién hace qué" on public.resource_services for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

grant select, insert, update, delete on public.customers, public.resource_services to authenticated;
grant select on public.resource_services to anon;
grant delete on public.appointments to authenticated;
create policy "dueño borra citas" on public.appointments for delete to authenticated
  using (public.is_business_owner(business_id));

create or replace function public.resource_does_service(p_resource_id uuid, p_service_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select not exists (select 1 from public.resource_services where service_id = p_service_id)
      or exists (select 1 from public.resource_services where service_id = p_service_id and resource_id = p_resource_id);
$$;

-- Igual que antes, pero solo con recursos que hacen ese servicio.
create or replace function public.get_available_slots(
  p_business_id uuid,
  p_service_id uuid,
  p_date date,
  p_resource_id uuid default null
)
returns table (resource_id uuid, resource_name text, starts_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
#variable_conflict use_column
declare
  v_biz public.businesses;
  v_duration interval;
  v_today date;
begin
  select * into v_biz from public.businesses b where b.id = p_business_id;
  if not found then
    return;
  end if;

  select make_interval(mins => s.duration_minutes) into v_duration
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;
  if v_duration is null then
    return;
  end if;

  v_today := (now() at time zone v_biz.timezone)::date;
  if p_date < v_today or p_date > v_today + v_biz.max_days_ahead then
    return;
  end if;

  return query
  with candidates as (
    select r.id as resource_id, r.name as resource_name, gs as starts_at
    from public.resources r
    join public.working_hours wh
      on wh.resource_id = r.id and wh.weekday = extract(dow from p_date)::int
    cross join lateral generate_series(
      (p_date + wh.start_time) at time zone v_biz.timezone,
      ((p_date + wh.end_time) at time zone v_biz.timezone) - v_duration,
      make_interval(mins => v_biz.slot_step_minutes)
    ) gs
    where r.business_id = p_business_id
      and r.is_active
      and (p_resource_id is null or r.id = p_resource_id)
      and public.resource_does_service(r.id, p_service_id)
  )
  select distinct c.resource_id, c.resource_name, c.starts_at
  from candidates c
  where c.starts_at >= now() + make_interval(mins => v_biz.min_notice_minutes)
    and not exists (
      select 1 from public.appointments a
      where a.resource_id = c.resource_id
        and a.status in ('pending', 'confirmed', 'completed')
        and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + v_duration, '[)')
    )
    and not exists (
      select 1 from public.time_off t
      where t.business_id = p_business_id
        and (t.resource_id is null or t.resource_id = c.resource_id)
        and tstzrange(t.starts_at, t.ends_at, '[)') && tstzrange(c.starts_at, c.starts_at + v_duration, '[)')
    )
  order by c.starts_at, c.resource_name;
end;
$$;

-- Crea o actualiza el cliente por teléfono y devuelve su id. Uso interno.
create or replace function public.upsert_customer(p_business_id uuid, p_phone text, p_name text)
returns uuid
language sql volatile security definer set search_path = ''
as $$
  insert into public.customers (business_id, phone, name)
  values (p_business_id, p_phone, p_name)
  on conflict (business_id, phone) do update set name = excluded.name
  returning id;
$$;

revoke execute on function public.upsert_customer(uuid, text, text) from public, anon, authenticated;
grant execute on function public.resource_does_service(uuid, uuid) to anon, authenticated;
