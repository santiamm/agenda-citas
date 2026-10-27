-- Agenda de citas multi-negocio
-- Un negocio tiene recursos (barberos, mesas, profesionales...), servicios con duración,
-- horarios semanales por recurso, bloqueos y citas. La regla más importante vive aquí,
-- en la base de datos: un recurso no puede tener dos citas activas que se crucen.

create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------- tablas

create table public.businesses (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug text not null unique
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 3 and 40),
  name text not null check (length(btrim(name)) between 2 and 80),
  category text not null default 'otro'
    check (category in ('barberia', 'peluqueria', 'restaurante', 'spa', 'consultorio', 'otro')),
  resource_label text not null default 'Profesional' check (length(resource_label) between 2 and 30),
  description text check (length(description) <= 500),
  phone text check (length(phone) <= 20),
  address text check (length(address) <= 160),
  timezone text not null default 'America/Bogota',
  currency text not null default 'COP',
  slot_step_minutes int not null default 15 check (slot_step_minutes in (5, 10, 15, 20, 30, 60)),
  min_notice_minutes int not null default 60 check (min_notice_minutes between 0 and 10080),
  max_days_ahead int not null default 30 check (max_days_ahead between 1 and 180),
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.resources (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 60),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table public.services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  name text not null check (length(btrim(name)) between 2 and 80),
  description text check (length(description) <= 300),
  duration_minutes int not null check (duration_minutes between 5 and 480),
  price numeric(12, 2) not null default 0 check (price >= 0),
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

-- weekday: 0 = domingo ... 6 = sábado (igual que extract(dow)).
-- Un recurso puede tener varios tramos el mismo día (p. ej. 9-12 y 14-19).
create table public.working_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid not null references public.resources (id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  start_time time not null,
  end_time time not null,
  check (end_time > start_time)
);

-- Bloqueos: vacaciones, festivos, almuerzo extendido. resource_id null = todo el negocio.
create table public.time_off (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  resource_id uuid references public.resources (id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  reason text check (length(reason) <= 120),
  check (ends_at > starts_at)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  service_id uuid not null references public.services (id) on delete restrict,
  resource_id uuid not null references public.resources (id) on delete restrict,
  customer_name text not null check (length(btrim(customer_name)) between 2 and 80),
  customer_phone text not null check (customer_phone ~ '^[0-9]{7,15}$'),
  notes text check (length(notes) <= 500),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show')),
  cancel_token uuid not null unique default gen_random_uuid(),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  -- La regla anti-choque: mismo recurso + rangos que se solapan = rechazado,
  -- salvo que alguna de las dos esté cancelada o marcada como "no vino".
  constraint appointments_no_overlap exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  ) where (status in ('pending', 'confirmed', 'completed'))
);

create index on public.resources (business_id);
create index on public.services (business_id);
create index on public.working_hours (resource_id, weekday);
create index on public.time_off (business_id, starts_at);
create index on public.appointments (business_id, starts_at);
create index on public.appointments (business_id, customer_phone);

-- ---------------------------------------------------------------- permisos (RLS)

create or replace function public.is_business_owner(p_business_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.businesses b
    where b.id = p_business_id and b.owner_id = (select auth.uid())
  );
$$;

alter table public.businesses enable row level security;
alter table public.resources enable row level security;
alter table public.services enable row level security;
alter table public.working_hours enable row level security;
alter table public.time_off enable row level security;
alter table public.appointments enable row level security;

-- Perfil público del negocio: cualquiera puede verlo (es la página de reservas).
create policy "negocios visibles" on public.businesses for select using (true);
create policy "dueño crea negocio" on public.businesses for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "dueño edita negocio" on public.businesses for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "dueño borra negocio" on public.businesses for delete to authenticated
  using (owner_id = (select auth.uid()));

create policy "recursos visibles" on public.resources for select
  using (is_active or public.is_business_owner(business_id));
create policy "dueño gestiona recursos" on public.resources for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create policy "servicios visibles" on public.services for select
  using (is_active or public.is_business_owner(business_id));
create policy "dueño gestiona servicios" on public.services for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

create policy "horarios visibles" on public.working_hours for select using (true);
create policy "dueño gestiona horarios" on public.working_hours for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

-- Bloqueos y citas: solo el dueño. Los clientes reservan con create_booking().
create policy "dueño gestiona bloqueos" on public.time_off for all to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));
create policy "dueño ve citas" on public.appointments for select to authenticated
  using (public.is_business_owner(business_id));
create policy "dueño actualiza citas" on public.appointments for update to authenticated
  using (public.is_business_owner(business_id)) with check (public.is_business_owner(business_id));

revoke all on all tables in schema public from anon, authenticated;
grant select on public.businesses, public.resources, public.services, public.working_hours to anon;
grant select, insert, update, delete on public.businesses, public.resources, public.services,
  public.working_hours, public.time_off to authenticated;
grant select, update (status, notes) on public.appointments to authenticated;

-- ---------------------------------------------------------------- horarios libres

-- Devuelve las horas en que se puede iniciar el servicio ese día, por recurso.
-- Se calcula en la zona horaria del negocio y descarta: horas pasadas o sin la
-- anticipación mínima, citas activas que se cruzan y bloqueos.
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
    select r.id as resource_id, r.name as resource_name, r.sort, gs as starts_at
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

-- ---------------------------------------------------------------- reservar (cliente sin cuenta)

-- Errores que devuelve (el front los traduce):
-- INVALID_NAME, INVALID_PHONE, INVALID_NOTES, BUSINESS_NOT_FOUND, SERVICE_NOT_FOUND,
-- TOO_MANY_BOOKINGS, SLOT_UNAVAILABLE, SLOT_TAKEN
create or replace function public.create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_resource_id uuid default null,
  p_notes text default null
)
returns table (appointment_id uuid, cancel_token uuid, starts_at timestamptz, ends_at timestamptz, resource_name text)
language plpgsql volatile security definer set search_path = ''
as $$
#variable_conflict use_variable
declare
  v_biz public.businesses;
  v_duration interval;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g');
  v_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  v_active int;
  v_slot record;
  v_id uuid;
  v_token uuid;
  v_saw_slot boolean := false;
begin
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_NAME';
  end if;
  if length(v_phone) < 7 or length(v_phone) > 15 then
    raise exception 'INVALID_PHONE';
  end if;
  if length(v_notes) > 500 then
    raise exception 'INVALID_NOTES';
  end if;

  select * into v_biz from public.businesses b where b.id = p_business_id;
  if not found then
    raise exception 'BUSINESS_NOT_FOUND';
  end if;

  select make_interval(mins => s.duration_minutes) into v_duration
  from public.services s
  where s.id = p_service_id and s.business_id = p_business_id and s.is_active;
  if v_duration is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  -- Freno básico contra reservas basura: máximo 3 citas futuras por teléfono y negocio.
  select count(*) into v_active
  from public.appointments a
  where a.business_id = p_business_id
    and a.customer_phone = v_phone
    and a.status in ('pending', 'confirmed')
    and a.starts_at > now();
  if v_active >= 3 then
    raise exception 'TOO_MANY_BOOKINGS';
  end if;

  -- Si el cliente eligió "cualquiera", se prueba cada recurso libre a esa hora.
  -- Si otra persona gana la carrera, la restricción de la tabla lo detecta
  -- (exclusion_violation) y se intenta con el siguiente.
  for v_slot in
    select s.resource_id, s.resource_name
    from public.get_available_slots(
      p_business_id, p_service_id, (p_starts_at at time zone v_biz.timezone)::date, p_resource_id
    ) s
    where s.starts_at = p_starts_at
  loop
    v_saw_slot := true;
    begin
      insert into public.appointments
        (business_id, service_id, resource_id, customer_name, customer_phone, notes, starts_at, ends_at)
      values
        (p_business_id, p_service_id, v_slot.resource_id, v_name, v_phone, v_notes, p_starts_at, p_starts_at + v_duration)
      returning id, appointments.cancel_token into v_id, v_token;

      return query select v_id, v_token, p_starts_at, p_starts_at + v_duration, v_slot.resource_name;
      return;
    exception when exclusion_violation then
      -- ocupado justo ahora: probar el siguiente recurso
    end;
  end loop;

  if v_saw_slot then
    raise exception 'SLOT_TAKEN';
  end if;
  raise exception 'SLOT_UNAVAILABLE';
end;
$$;

-- ---------------------------------------------------------------- consultar / cancelar con el enlace

create or replace function public.get_booking(p_token uuid)
returns table (
  appointment_id uuid, status text, starts_at timestamptz, ends_at timestamptz,
  customer_name text, service_name text, resource_name text,
  business_name text, business_slug text, business_phone text, business_address text, timezone text
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.status, a.starts_at, a.ends_at, a.customer_name, s.name, r.name,
         b.name, b.slug, b.phone, b.address, b.timezone
  from public.appointments a
  join public.services s on s.id = a.service_id
  join public.resources r on r.id = a.resource_id
  join public.businesses b on b.id = a.business_id
  where a.cancel_token = p_token;
$$;

create or replace function public.cancel_booking(p_token uuid)
returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_appt public.appointments;
begin
  select * into v_appt from public.appointments a where a.cancel_token = p_token for update;
  if not found then
    raise exception 'NOT_FOUND';
  end if;
  if v_appt.status not in ('pending', 'confirmed') then
    raise exception 'NOT_CANCELLABLE';
  end if;
  if v_appt.starts_at <= now() then
    raise exception 'ALREADY_STARTED';
  end if;
  update public.appointments set status = 'cancelled' where id = v_appt.id;
  return 'cancelled';
end;
$$;

-- ---------------------------------------------------------------- crear negocio con plantilla

-- Crea el negocio del usuario con servicios, un recurso y horario por defecto según el tipo,
-- para que pueda recibir reservas en dos minutos y luego ajustar.
create or replace function public.create_business(
  p_name text,
  p_slug text,
  p_category text,
  p_resource_name text default null,
  p_phone text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_biz uuid;
  v_res uuid;
  v_label text;
  v_open time;
  v_close time;
  v_days int[];
  d int;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  if exists (select 1 from public.businesses where slug = lower(btrim(p_slug))) then
    raise exception 'SLUG_TAKEN';
  end if;

  v_label := case p_category
    when 'barberia' then 'Barbero'
    when 'peluqueria' then 'Estilista'
    when 'restaurante' then 'Mesa'
    when 'spa' then 'Terapeuta'
    when 'consultorio' then 'Profesional'
    else 'Profesional'
  end;
  v_open := case when p_category = 'restaurante' then '12:00' else '09:00' end;
  v_close := case when p_category = 'restaurante' then '22:00' else '18:00' end;
  v_days := case when p_category in ('consultorio') then array[1,2,3,4,5] else array[1,2,3,4,5,6] end;

  insert into public.businesses (owner_id, slug, name, category, resource_label, phone)
  values (v_uid, lower(btrim(p_slug)), btrim(p_name), p_category, v_label, nullif(btrim(coalesce(p_phone, '')), ''))
  returning id into v_biz;

  insert into public.resources (business_id, name)
  values (v_biz, coalesce(nullif(btrim(coalesce(p_resource_name, '')), ''), v_label || ' 1'))
  returning id into v_res;

  foreach d in array v_days loop
    insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time)
    values (v_biz, v_res, d, v_open, v_close);
  end loop;

  insert into public.services (business_id, name, duration_minutes, price, sort)
  select v_biz, t.name, t.mins, t.price, t.ord
  from (values
    ('barberia', 'Corte clásico', 30, 20000, 1),
    ('barberia', 'Corte + barba', 45, 30000, 2),
    ('barberia', 'Arreglo de barba', 20, 12000, 3),
    ('peluqueria', 'Corte', 45, 35000, 1),
    ('peluqueria', 'Tinte', 120, 90000, 2),
    ('peluqueria', 'Peinado', 60, 45000, 3),
    ('restaurante', 'Mesa para 2', 90, 0, 1),
    ('restaurante', 'Mesa para 4', 90, 0, 2),
    ('restaurante', 'Mesa para 6 o más', 120, 0, 3),
    ('spa', 'Masaje relajante', 60, 80000, 1),
    ('spa', 'Limpieza facial', 45, 60000, 2),
    ('consultorio', 'Consulta', 30, 0, 1),
    ('consultorio', 'Control', 20, 0, 2),
    ('otro', 'Cita', 30, 0, 1)
  ) as t(cat, name, mins, price, ord)
  where t.cat = p_category or (t.cat = 'otro' and p_category not in
    ('barberia', 'peluqueria', 'restaurante', 'spa', 'consultorio'));

  return v_biz;
end;
$$;

-- ---------------------------------------------------------------- panel de ejemplo (solo lectura)

-- Para mostrar el panel a quien todavía no tiene cuenta. Solo funciona con negocios
-- marcados is_demo y oculta los teléfonos.
create or replace function public.get_demo_appointments(p_slug text, p_from timestamptz, p_to timestamptz)
returns table (
  id uuid, starts_at timestamptz, ends_at timestamptz, status text, customer_name text,
  customer_phone text, notes text, service_name text, resource_name text
)
language sql stable security definer set search_path = ''
as $$
  select a.id, a.starts_at, a.ends_at, a.status, a.customer_name,
         '300' || repeat('•', 7), a.notes, s.name, r.name
  from public.appointments a
  join public.businesses b on b.id = a.business_id and b.is_demo and b.slug = p_slug
  join public.services s on s.id = a.service_id
  join public.resources r on r.id = a.resource_id
  where a.starts_at >= p_from and a.starts_at < p_to
  order by a.starts_at;
$$;

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.get_available_slots(uuid, uuid, date, uuid) to anon, authenticated;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, text) to anon, authenticated;
grant execute on function public.get_booking(uuid) to anon, authenticated;
grant execute on function public.cancel_booking(uuid) to anon, authenticated;
grant execute on function public.get_demo_appointments(text, timestamptz, timestamptz) to anon, authenticated;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;
grant execute on function public.is_business_owner(uuid) to anon, authenticated;
