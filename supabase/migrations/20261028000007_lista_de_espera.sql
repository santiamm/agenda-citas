-- Lista de espera: si no hay horas un día, el cliente deja sus datos y el dueño le escribe si se libera algo.

create table public.waitlist (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete set null,
  customer_id uuid references public.customers (id) on delete set null,
  customer_name text not null check (length(btrim(customer_name)) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^[0-9]{7,15}$'),
  desired_date date not null,
  notes text check (length(notes) <= 300),
  status text not null default 'waiting' check (status in ('waiting', 'contacted', 'booked', 'cancelled')),
  created_at timestamptz not null default now()
);
create index on public.waitlist (business_id, desired_date);

alter table public.waitlist enable row level security;
create policy "dueño gestiona lista de espera" on public.waitlist for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
grant select, update, delete on public.waitlist to authenticated;

-- Errores: INVALID_NAME, INVALID_PHONE, SERVICE_NOT_FOUND, INVALID_DATE, TOO_MANY_WAITS
create or replace function public.join_waitlist(
  p_business_id uuid,
  p_service_id uuid,
  p_date date,
  p_customer_name text,
  p_customer_phone text,
  p_resource_id uuid default null,
  p_notes text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_biz public.businesses;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_today date;
  v_id uuid;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_NAME';
  end if;
  if length(v_phone) < 7 or length(v_phone) > 15 then
    raise exception 'INVALID_PHONE';
  end if;
  select * into v_biz from public.businesses where id = p_business_id;
  if not found or not exists (
    select 1 from public.services where id = p_service_id and business_id = p_business_id and is_active
  ) then
    raise exception 'SERVICE_NOT_FOUND';
  end if;
  v_today := (now() at time zone v_biz.timezone)::date;
  if p_date < v_today or p_date > v_today + v_biz.max_days_ahead then
    raise exception 'INVALID_DATE';
  end if;

  -- Si ya está anotado para ese día y servicio, no se duplica.
  select id into v_id from public.waitlist
  where business_id = p_business_id and customer_phone = v_phone and service_id = p_service_id
    and desired_date = p_date and status = 'waiting';
  if v_id is not null then
    return v_id;
  end if;

  if (select count(*) from public.waitlist
      where business_id = p_business_id and customer_phone = v_phone and status = 'waiting'
        and desired_date >= v_today) >= 3 then
    raise exception 'TOO_MANY_WAITS';
  end if;

  insert into public.waitlist
    (business_id, service_id, resource_id, customer_id, customer_name, customer_phone, desired_date, notes)
  values
    (p_business_id, p_service_id, p_resource_id, public.upsert_customer(p_business_id, v_phone, v_name),
     v_name, v_phone, p_date, nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.join_waitlist(uuid, uuid, date, text, text, uuid, text) from public;
grant execute on function public.join_waitlist(uuid, uuid, date, text, text, uuid, text) to anon, authenticated;
