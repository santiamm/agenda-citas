-- Restaurantes: cada mesa tiene capacidad y cada servicio ("Mesa para 4") un mínimo de personas.
-- Solo se ofrecen mesas donde cabe el grupo, y con "cualquiera" se asigna la más pequeña que alcance.

alter table public.resources add column capacity int check (capacity between 1 and 100); -- null = no aplica
alter table public.services add column min_party int check (min_party between 1 and 100); -- null = no aplica

-- Un recurso puede atender un servicio si está asignado (o nadie lo está) y, si aplica, el grupo cabe.
create or replace function public.resource_does_service(p_resource_id uuid, p_service_id uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select (not exists (select 1 from public.resource_services where service_id = p_service_id)
          or exists (select 1 from public.resource_services where service_id = p_service_id and resource_id = p_resource_id))
     and coalesce((select s.min_party is null or r.capacity is null or r.capacity >= s.min_party
                   from public.resources r, public.services s
                   where r.id = p_resource_id and s.id = p_service_id), false);
$$;

-- Igual que antes, pero con "cualquiera" prueba primero la mesa (o recurso) de menor capacidad.
create or replace function public.create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text,
  p_resource_id uuid default null,
  p_notes text default null,
  p_source text default 'web'
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
  v_customer uuid;
  v_saw_slot boolean := false;
begin
  if p_source not in ('web', 'bot') then
    raise exception 'INVALID_SOURCE';
  end if;
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

  select count(*) into v_active
  from public.appointments a
  where a.business_id = p_business_id
    and a.customer_phone = v_phone
    and a.status in ('pending', 'confirmed')
    and a.starts_at > now();
  if v_active >= 3 then
    raise exception 'TOO_MANY_BOOKINGS';
  end if;

  v_customer := public.upsert_customer(p_business_id, v_phone, v_name);

  for v_slot in
    select s.resource_id, s.resource_name
    from public.get_available_slots(
      p_business_id, p_service_id, (p_starts_at at time zone v_biz.timezone)::date, p_resource_id
    ) s
    join public.resources r on r.id = s.resource_id
    where s.starts_at = p_starts_at
    order by r.capacity nulls last, r.sort, r.name
  loop
    v_saw_slot := true;
    begin
      insert into public.appointments
        (business_id, service_id, resource_id, customer_id, customer_name, customer_phone, notes,
         starts_at, ends_at, source)
      values
        (p_business_id, p_service_id, v_slot.resource_id, v_customer, v_name, v_phone, v_notes,
         p_starts_at, p_starts_at + v_duration, p_source)
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

-- La plantilla de restaurante ahora crea 4 mesas con capacidad y servicios con mínimo de personas.
create or replace function private.setup_restaurant(p_business_id uuid)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_first uuid;
  v_res uuid;
  t record;
begin
  select id into v_first from public.resources where business_id = p_business_id order by created_at limit 1;
  update public.resources set capacity = 2 where id = v_first;
  for t in select * from (values ('Mesa 2', 2, 2), ('Mesa 3', 4, 3), ('Mesa 4', 6, 4)) as x(name, cap, ord) loop
    insert into public.resources (business_id, name, capacity, sort) values (p_business_id, t.name, t.cap, t.ord)
    returning id into v_res;
    insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time)
    select p_business_id, v_res, weekday, start_time, end_time
    from public.working_hours where resource_id = v_first;
  end loop;
  update public.services set min_party = case name
      when 'Mesa para 2' then 1 when 'Mesa para 4' then 3 when 'Mesa para 6 o más' then 5 end
  where business_id = p_business_id;
end;
$$;

-- Envuelve create_business para completar la plantilla de restaurante.
alter function public.create_business(text, text, text, text, text) rename to create_business_base;
revoke execute on function public.create_business_base(text, text, text, text, text) from public, anon, authenticated;

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
  v_id uuid;
begin
  v_id := public.create_business_base(p_name, p_slug, p_category, p_resource_name, p_phone);
  if p_category = 'restaurante' then
    perform private.setup_restaurant(v_id);
  end if;
  return v_id;
end;
$$;

revoke execute on function public.create_business(text, text, text, text, text) from public, anon;
grant execute on function public.create_business(text, text, text, text, text) to authenticated;

-- ---------------------------------------------------------------- restaurante de ejemplo

do $$
declare
  v_owner uuid := '00000000-0000-4000-8000-00000000d3e0';
  v_biz uuid;
  v_res uuid;
  t record;
  d int;
begin
  if not exists (select 1 from auth.users where id = v_owner) then
    return;
  end if;
  insert into public.businesses (owner_id, slug, name, category, resource_label, description, address, is_demo,
                                 slot_step_minutes, min_notice_minutes)
  values (v_owner, 'restaurante-demo', 'Restaurante El Fogón', 'restaurante', 'Mesa',
          'Restaurante de ejemplo para probar reservas de mesas. Reserva sin miedo: es de prueba.',
          'Carrera 33 # 48-20, Bucaramanga', true, 30, 60)
  returning id into v_biz;

  for t in select * from (values ('Mesa 1 (ventana)', 2, 1), ('Mesa 2', 2, 2), ('Mesa 3', 4, 3),
                                 ('Mesa 4', 4, 4), ('Mesa 5 (terraza)', 6, 5)) as x(name, cap, ord) loop
    insert into public.resources (business_id, name, capacity, sort) values (v_biz, t.name, t.cap, t.ord)
    returning id into v_res;
    -- Martes a domingo: almuerzo 12-15 y cena 18-22.
    foreach d in array array[0, 2, 3, 4, 5, 6] loop
      insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values
        (v_biz, v_res, d, '12:00', '15:00'), (v_biz, v_res, d, '18:00', '22:00');
    end loop;
  end loop;

  insert into public.services (business_id, name, description, duration_minutes, price, min_party, sort) values
    (v_biz, 'Mesa para 1 o 2', 'Ideal para parejas.', 90, 0, 1, 1),
    (v_biz, 'Mesa para 3 o 4', 'Familia o amigos.', 90, 0, 3, 2),
    (v_biz, 'Mesa para 5 o 6', 'Grupos. Se asigna la terraza.', 120, 0, 5, 3);
end;
$$;
