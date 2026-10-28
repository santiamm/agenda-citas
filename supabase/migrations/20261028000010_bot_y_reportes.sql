-- Funciones del bot de menú, reportes, permisos y tareas programadas.

-- ---------------------------------------------------------------- bot de menú

create or replace function public.bot_load_session(p_secret text, p_business_id uuid, p_phone text)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return (select state from private.bot_sessions where business_id = p_business_id and phone = p_phone
          and updated_at > now() - interval '30 minutes');
end;
$$;

create or replace function public.bot_save_session(p_secret text, p_business_id uuid, p_phone text, p_state jsonb)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  insert into private.bot_sessions (business_id, phone, state, updated_at)
  values (p_business_id, p_phone, coalesce(p_state, '{}'), now())
  on conflict (business_id, phone) do update set state = excluded.state, updated_at = now();
end;
$$;

-- Citas futuras activas de un teléfono (el bot solo las muestra a ese mismo número).
create or replace function public.bot_customer_bookings(p_secret text, p_business_id uuid, p_phone text)
returns table (cancel_token uuid, starts_at timestamptz, service_name text, resource_name text, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return query
  select a.cancel_token, a.starts_at, s.name, r.name, a.status
  from public.appointments a
  join public.services s on s.id = a.service_id
  join public.resources r on r.id = a.resource_id
  where a.business_id = p_business_id and a.customer_phone = p_phone
    and a.status in ('pending', 'confirmed') and a.starts_at > now()
  order by a.starts_at;
end;
$$;

create or replace function public.bot_customer_membership(p_secret text, p_business_id uuid, p_phone text)
returns table (plan_name text, is_paid boolean, paid_until date, visits_used int, visits_limit int, status text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  return query
  select m.plan_name, m.is_paid, m.paid_until, m.visits_used, m.visits_limit, m.status
  from private.membership_rows(p_business_id) m
  where m.customer_phone = p_phone and m.status <> 'cancelled';
end;
$$;

-- ---------------------------------------------------------------- reportes

create or replace function public.business_report(p_business_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_tz text;
begin
  if not public.is_business_owner(p_business_id) then
    raise exception 'FORBIDDEN';
  end if;
  select timezone into v_tz from public.businesses where id = p_business_id;

  return (
    with appts as (
      select a.*, s.name as service_name, s.price, r.name as resource_name,
             -- cubierta por una mensualidad pagada ese día y que incluye el servicio
             exists (
               select 1 from public.memberships m
               where m.customer_id = a.customer_id and m.status <> 'cancelled'
                 and m.paid_until >= (a.starts_at at time zone v_tz)::date
                 and (not exists (select 1 from public.plan_services ps where ps.plan_id = m.plan_id)
                      or exists (select 1 from public.plan_services ps
                                 where ps.plan_id = m.plan_id and ps.service_id = a.service_id))
             ) as covered
      from public.appointments a
      join public.services s on s.id = a.service_id
      join public.resources r on r.id = a.resource_id
      where a.business_id = p_business_id and a.starts_at >= p_from and a.starts_at < p_to
    )
    select jsonb_build_object(
      'total', (select count(*) from appts),
      'by_status', coalesce((select jsonb_object_agg(status, n) from
                     (select status, count(*) n from appts group by status) x), '{}'),
      'services_income', coalesce((select sum(price) from appts where status = 'completed' and not covered), 0),
      'membership_income', coalesce((select sum(amount) from public.membership_payments
                                     where business_id = p_business_id
                                       and paid_on >= (p_from at time zone v_tz)::date
                                       and paid_on < (p_to at time zone v_tz)::date), 0),
      'by_resource', coalesce((select jsonb_agg(x order by x.n desc) from
                       (select resource_name as name, count(*) n from appts
                        where status <> 'cancelled' group by resource_name) x), '[]'),
      'by_service', coalesce((select jsonb_agg(x order by x.n desc) from
                      (select service_name as name, count(*) n from appts
                       where status <> 'cancelled' group by service_name) x), '[]'),
      'top_customers', coalesce((select jsonb_agg(x order by x.n desc) from
                         (select customer_name as name, count(*) n from appts
                          where status in ('completed', 'confirmed') group by customer_name
                          order by count(*) desc limit 5) x), '[]'),
      'by_source', coalesce((select jsonb_object_agg(source, n) from
                     (select source, count(*) n from appts group by source) x), '{}')
    )
  );
end;
$$;

revoke execute on function public.purge_old_records() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
revoke execute on function public.business_report(uuid, timestamptz, timestamptz) from public, anon;
revoke execute on function public.notification_payload(text, text, uuid) from public;
revoke execute on function public.drop_push_subscription(text, text) from public;
revoke execute on function public.bot_load_session(text, uuid, text) from public;
revoke execute on function public.bot_save_session(text, uuid, text, jsonb) from public;
revoke execute on function public.bot_customer_bookings(text, uuid, text) from public;
revoke execute on function public.bot_customer_membership(text, uuid, text) from public;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.business_report(uuid, timestamptz, timestamptz) to authenticated;
-- Protegidas por el secreto: el servidor las llama con la clave pública.
grant execute on function public.notification_payload(text, text, uuid) to anon, authenticated;
grant execute on function public.drop_push_subscription(text, text) to anon, authenticated;
grant execute on function public.bot_load_session(text, uuid, text) to anon, authenticated;
grant execute on function public.bot_save_session(text, uuid, text, jsonb) to anon, authenticated;
grant execute on function public.bot_customer_bookings(text, uuid, text) to anon, authenticated;
grant execute on function public.bot_customer_membership(text, uuid, text) to anon, authenticated;

-- Limpieza diaria (4:00 a. m. de Bogotá) y agenda en vivo (Realtime). Solo en Supabase.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('purge-old-records', '0 9 * * *', 'select public.purge_old_records()');
  end if;
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.appointments, public.waitlist;
  end if;
end;
$$;
