-- Mensualidades: el cliente paga un plan fijo al mes que incluye ciertos servicios,
-- con un cupo de visitas (o ilimitado). Los pagos se registran a mano (efectivo, Nequi...).

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (length(description) <= 300),
  price numeric(12, 2) not null default 0 check (price >= 0),
  visits_per_period int check (visits_per_period between 1 and 100), -- null = ilimitado
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Servicios que cubre el plan. Sin filas = cubre todos.
create table public.plan_services (
  plan_id uuid not null references public.plans (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  business_id uuid not null references public.businesses (id) on delete cascade,
  primary key (plan_id, service_id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  plan_id uuid not null references public.plans (id) on delete restrict,
  customer_id uuid not null references public.customers (id) on delete cascade,
  starts_on date not null default current_date,
  paid_until date,
  status text not null default 'active' check (status in ('active', 'paused', 'cancelled')),
  notes text check (length(notes) <= 500),
  created_at timestamptz not null default now()
);
create index on public.memberships (business_id);
create index on public.memberships (customer_id);

create table public.membership_payments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  membership_id uuid not null references public.memberships (id) on delete cascade,
  amount numeric(12, 2) not null check (amount >= 0),
  paid_on date not null default current_date,
  period_start date not null,
  period_end date not null,
  method text not null default 'efectivo'
    check (method in ('efectivo', 'nequi', 'daviplata', 'transferencia', 'otro')),
  notes text check (length(notes) <= 300),
  created_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index on public.membership_payments (membership_id);

alter table public.plans enable row level security;
alter table public.plan_services enable row level security;
alter table public.memberships enable row level security;
alter table public.membership_payments enable row level security;

create policy "dueño gestiona planes" on public.plans for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "dueño gestiona servicios del plan" on public.plan_services for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "dueño gestiona mensualidades" on public.memberships for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "dueño gestiona pagos" on public.membership_payments for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

grant select, insert, update, delete on public.plans, public.plan_services, public.memberships,
  public.membership_payments to authenticated;

-- Al registrar o borrar un pago, "pagado hasta" queda en el final del último periodo pagado.
create or replace function private.sync_paid_until()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.membership_id, old.membership_id);
begin
  update public.memberships
  set paid_until = (select max(period_end) from public.membership_payments where membership_id = v_id)
  where id = v_id;
  return null;
end;
$$;

create trigger membership_payments_sync
after insert or update or delete on public.membership_payments
for each row execute function private.sync_paid_until();

-- Registra el pago de un mes. Si paga a tiempo (o hasta 7 días tarde) el mes sigue desde
-- donde terminó el anterior; si pasó más tiempo, empieza el día que paga.
create or replace function public.register_membership_payment(
  p_membership_id uuid,
  p_amount numeric,
  p_method text default 'efectivo',
  p_paid_on date default null,
  p_notes text default null
)
returns date
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_m public.memberships;
  v_paid_on date;
  v_start date;
  v_end date;
begin
  select * into v_m from public.memberships where id = p_membership_id;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  v_paid_on := coalesce(p_paid_on, (now() at time zone
    (select timezone from public.businesses where id = v_m.business_id))::date);
  v_start := case
    when v_m.paid_until is null then least(v_m.starts_on, v_paid_on)
    when v_m.paid_until >= v_paid_on - 7 then v_m.paid_until
    else v_paid_on
  end;
  v_end := (v_start + interval '1 month')::date;
  insert into public.membership_payments
    (business_id, membership_id, amount, paid_on, period_start, period_end, method, notes)
  values (v_m.business_id, v_m.id, p_amount, v_paid_on, v_start, v_end, p_method, p_notes);
  if v_m.status <> 'active' then
    update public.memberships set status = 'active' where id = v_m.id;
  end if;
  return v_end;
end;
$$;

-- Estado de cada mensualidad: al día o vencida, periodo actual y visitas usadas en él.
create or replace function private.membership_rows(p_business_id uuid)
returns table (
  membership_id uuid, customer_id uuid, customer_name text, customer_phone text,
  plan_id uuid, plan_name text, price numeric, visits_limit int, status text,
  starts_on date, paid_until date, is_paid boolean, period_start date, period_end date,
  visits_used int, notes text
)
language sql stable security definer set search_path = ''
as $$
  with today as (
    select (now() at time zone b.timezone)::date as d, b.timezone as tz
    from public.businesses b where b.id = p_business_id
  ),
  base as (
    select m.*, c.name as cname, c.phone as cphone, p.name as pname, p.price as pprice,
           p.visits_per_period as plimit,
           coalesce((select mp.period_start from public.membership_payments mp
                     where mp.membership_id = m.id order by mp.period_end desc limit 1), m.starts_on) as pstart,
           coalesce(m.paid_until, (m.starts_on + interval '1 month')::date) as pend
    from public.memberships m
    join public.customers c on c.id = m.customer_id
    join public.plans p on p.id = m.plan_id
    where m.business_id = p_business_id
  )
  select b.id, b.customer_id, b.cname, b.cphone, b.plan_id, b.pname, b.pprice, b.plimit, b.status,
         b.starts_on, b.paid_until, coalesce(b.paid_until >= t.d, false), b.pstart, b.pend,
         (select count(*)::int from public.appointments a
          where a.customer_id = b.customer_id
            and a.status in ('pending', 'confirmed', 'completed')
            and (a.starts_at at time zone t.tz)::date >= b.pstart
            and (a.starts_at at time zone t.tz)::date < b.pend
            and (not exists (select 1 from public.plan_services ps where ps.plan_id = b.plan_id)
                 or exists (select 1 from public.plan_services ps
                            where ps.plan_id = b.plan_id and ps.service_id = a.service_id))),
         b.notes
  from base b cross join today t
  order by b.cname;
$$;

create or replace function public.membership_overview(p_business_id uuid)
returns table (
  membership_id uuid, customer_id uuid, customer_name text, customer_phone text,
  plan_id uuid, plan_name text, price numeric, visits_limit int, status text,
  starts_on date, paid_until date, is_paid boolean, period_start date, period_end date,
  visits_used int, notes text
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'FORBIDDEN';
  end if;
  return query select * from private.membership_rows(p_business_id);
end;
$$;

revoke execute on function public.register_membership_payment(uuid, numeric, text, date, text) from public, anon;
revoke execute on function public.membership_overview(uuid) from public, anon;
grant execute on function public.register_membership_payment(uuid, numeric, text, date, text) to authenticated;
grant execute on function public.membership_overview(uuid) to authenticated;
