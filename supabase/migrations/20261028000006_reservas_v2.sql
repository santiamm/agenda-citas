-- Reservar ahora guarda el cliente y el origen (web o bot). El dueño puede anotar citas a mano.

drop function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, text);

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

  v_customer := public.upsert_customer(p_business_id, v_phone, v_name);

  -- Con "cualquiera" se prueba cada recurso libre; si otro gana la carrera,
  -- la restricción de la tabla lo detecta y se intenta con el siguiente.
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

-- Cita anotada por el dueño (alguien que llamó o llegó). Puede salirse del horario,
-- pero nunca cruzarse con otra cita del mismo recurso. Queda confirmada.
create or replace function public.owner_create_booking(
  p_business_id uuid,
  p_service_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_customer_name text,
  p_customer_phone text default null,
  p_notes text default null
)
returns uuid
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_duration interval;
  v_name text := btrim(coalesce(p_customer_name, ''));
  v_phone text := nullif(regexp_replace(coalesce(p_customer_phone, ''), '[^0-9]', '', 'g'), '');
  v_customer uuid;
  v_id uuid;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'FORBIDDEN';
  end if;
  if length(v_name) < 2 or length(v_name) > 80 then
    raise exception 'INVALID_NAME';
  end if;
  if v_phone is not null and (length(v_phone) < 7 or length(v_phone) > 15) then
    raise exception 'INVALID_PHONE';
  end if;
  if not exists (select 1 from public.resources where id = p_resource_id and business_id = p_business_id) then
    raise exception 'RESOURCE_NOT_FOUND';
  end if;
  select make_interval(mins => s.duration_minutes) into v_duration
  from public.services s where s.id = p_service_id and s.business_id = p_business_id;
  if v_duration is null then
    raise exception 'SERVICE_NOT_FOUND';
  end if;

  if v_phone is not null then
    v_customer := public.upsert_customer(p_business_id, v_phone, v_name);
  end if;

  begin
    insert into public.appointments
      (business_id, service_id, resource_id, customer_id, customer_name, customer_phone, notes,
       starts_at, ends_at, status, source)
    values
      (p_business_id, p_service_id, p_resource_id, v_customer, v_name, v_phone,
       nullif(btrim(coalesce(p_notes, '')), ''), p_starts_at, p_starts_at + v_duration, 'confirmed', 'owner')
    returning id into v_id;
  exception when exclusion_violation then
    raise exception 'SLOT_TAKEN';
  end;
  return v_id;
end;
$$;

revoke execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text) from public;
revoke execute on function public.owner_create_booking(uuid, uuid, uuid, timestamptz, text, text, text) from public, anon;
grant execute on function public.create_booking(uuid, uuid, timestamptz, text, text, uuid, text, text) to anon, authenticated;
grant execute on function public.owner_create_booking(uuid, uuid, uuid, timestamptz, text, text, text) to authenticated;
