-- Recordatorios automáticos: el cliente puede pedir un aviso en su celular desde la página de su
-- cita, y una tarea diaria le recuerda la cita del día siguiente. El dueño recibe un resumen.

alter table public.appointments add column reminded_at timestamptz;

-- Celulares de clientes que pidieron el recordatorio de una cita (no tienen cuenta).
create table public.appointment_push (
  appointment_id uuid not null references public.appointments (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  primary key (appointment_id, endpoint)
);
alter table public.appointment_push enable row level security; -- sin políticas: solo por funciones

-- El cliente prueba que es suyo con el enlace de la cita (cancel_token).
create or replace function public.save_booking_push(p_token uuid, p_endpoint text, p_p256dh text, p_auth text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  select id into v_id from public.appointments
  where cancel_token = p_token and status in ('pending', 'confirmed') and starts_at > now();
  if v_id is null then
    raise exception 'NOT_FOUND';
  end if;
  insert into public.appointment_push (appointment_id, endpoint, p256dh, auth)
  values (v_id, p_endpoint, p_p256dh, p_auth)
  on conflict (appointment_id, endpoint) do update set p256dh = excluded.p256dh, auth = excluded.auth;
end;
$$;

-- Citas de mañana (en la zona de cada negocio) que aún no se han recordado, con los celulares
-- del cliente que pidieron aviso.
create or replace function public.reminders_due(p_secret text)
returns table (
  appointment_id uuid, cancel_token uuid, starts_at timestamptz, timezone text,
  business_name text, service_name text, resource_name text, subscriptions jsonb
)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return query
  select a.id, a.cancel_token, a.starts_at, b.timezone, b.name, s.name, r.name,
         coalesce((select jsonb_agg(jsonb_build_object('endpoint', ap.endpoint, 'p256dh', ap.p256dh, 'auth', ap.auth))
                   from public.appointment_push ap where ap.appointment_id = a.id), '[]')
  from public.appointments a
  join public.businesses b on b.id = a.business_id
  join public.services s on s.id = a.service_id
  join public.resources r on r.id = a.resource_id
  where a.status in ('pending', 'confirmed')
    and a.reminded_at is null
    and (a.starts_at at time zone b.timezone)::date = (now() at time zone b.timezone)::date + 1
    and exists (select 1 from public.appointment_push ap where ap.appointment_id = a.id);
end;
$$;

-- Resumen para cada dueño con avisos activos: cuántas citas tiene mañana y cuántas faltan por confirmar.
create or replace function public.owner_daily_summary(p_secret text)
returns table (business_name text, slug text, total int, pending int, subscriptions jsonb)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return query
  select b.name, b.slug,
         count(a.id)::int,
         count(a.id) filter (where a.status = 'pending')::int,
         (select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
          from public.push_subscriptions ps where ps.user_id = b.owner_id)
  from public.businesses b
  join public.appointments a on a.business_id = b.id
    and a.status in ('pending', 'confirmed')
    and (a.starts_at at time zone b.timezone)::date = (now() at time zone b.timezone)::date + 1
  where b.notify_push and not b.is_demo
    and exists (select 1 from public.push_subscriptions ps where ps.user_id = b.owner_id)
  group by b.id;
end;
$$;

create or replace function public.mark_reminded(p_secret text, p_ids uuid[])
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  update public.appointments set reminded_at = now() where id = any (p_ids);
end;
$$;

create or replace function public.drop_booking_push(p_secret text, p_endpoint text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  delete from public.appointment_push where endpoint = p_endpoint;
end;
$$;

revoke execute on function public.save_booking_push(uuid, text, text, text) from public;
revoke execute on function public.reminders_due(text) from public;
revoke execute on function public.owner_daily_summary(text) from public;
revoke execute on function public.mark_reminded(text, uuid[]) from public;
revoke execute on function public.drop_booking_push(text, text) from public;
grant execute on function public.save_booking_push(uuid, text, text, text) to anon, authenticated;
grant execute on function public.reminders_due(text) to anon, authenticated;
grant execute on function public.owner_daily_summary(text) to anon, authenticated;
grant execute on function public.mark_reminded(text, uuid[]) to anon, authenticated;
grant execute on function public.drop_booking_push(text, text) to anon, authenticated;
