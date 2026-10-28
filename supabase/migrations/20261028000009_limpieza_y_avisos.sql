-- Limpieza de registros viejos, suscripciones a notificaciones y ajustes de avisos.

alter table public.businesses add column retention_days int check (retention_days between 30 and 3650); -- null = guardar siempre
alter table public.businesses add column notify_email boolean not null default true;
alter table public.businesses add column notify_push boolean not null default true;
alter table public.businesses add column whatsapp_phone_number_id text unique; -- para conectar el bot oficial

-- Borra citas que terminaron hace más de N días (según cada negocio), listas de espera de
-- fechas pasadas y conversaciones del bot inactivas. La corre pg_cron cada día.
create or replace function public.purge_old_records()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  delete from public.appointments a
  using public.businesses b
  where b.id = a.business_id and b.retention_days is not null
    and a.ends_at < now() - make_interval(days => b.retention_days);

  delete from public.waitlist w
  using public.businesses b
  where b.id = w.business_id and w.desired_date < (now() at time zone b.timezone)::date - 7;

  delete from private.bot_sessions where updated_at < now() - interval '2 days';
end;
$$;

-- Conversaciones del bot (estado del menú por teléfono). Solo el servidor las toca.
create table private.bot_sessions (
  business_id uuid not null references public.businesses (id) on delete cascade,
  phone text not null,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (business_id, phone)
);

-- Huella SHA-256 del secreto del servidor (variable APP_SECRET). El secreto en sí no se guarda aquí.
create table private.app_config (key text primary key, value text not null);

create or replace function private.assert_secret(p_secret text)
returns void
language plpgsql stable security definer set search_path = ''
as $$
begin
  if p_secret is null or not exists (
    select 1 from private.app_config
    where key = 'app_secret_sha256' and value = encode(sha256(convert_to(p_secret, 'UTF8')), 'hex')
  ) then
    raise exception 'FORBIDDEN';
  end if;
end;
$$;

-- Notificaciones push: cada celular donde el dueño las activó.
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "cada quien ve sus celulares" on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "cada quien borra sus celulares" on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
grant select, delete on public.push_subscriptions to authenticated;

create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;
  delete from public.push_subscriptions where endpoint = p_endpoint;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 200));
end;
$$;

-- Lo que el servidor necesita para avisarle al dueño de una cita o de alguien en lista de espera.
create or replace function public.notification_payload(p_secret text, p_kind text, p_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_biz uuid;
  v_item jsonb;
begin
  perform private.assert_secret(p_secret);
  if p_kind = 'appointment' then
    select a.business_id, jsonb_build_object(
      'customer_name', a.customer_name, 'customer_phone', a.customer_phone, 'status', a.status,
      'starts_at', a.starts_at, 'service_name', s.name, 'resource_name', r.name, 'source', a.source,
      'waiting', (select count(*) from public.waitlist w where w.business_id = a.business_id
                  and w.status = 'waiting'
                  and w.desired_date = (a.starts_at at time zone b.timezone)::date))
    into v_biz, v_item
    from public.appointments a
    join public.services s on s.id = a.service_id
    join public.resources r on r.id = a.resource_id
    join public.businesses b on b.id = a.business_id
    where a.id = p_id;
  else
    select w.business_id, jsonb_build_object(
      'customer_name', w.customer_name, 'customer_phone', w.customer_phone,
      'desired_date', w.desired_date, 'service_name', s.name)
    into v_biz, v_item
    from public.waitlist w join public.services s on s.id = w.service_id
    where w.id = p_id;
  end if;
  if v_biz is null then
    return null;
  end if;

  return (
    select jsonb_build_object(
      'business', jsonb_build_object('name', b.name, 'slug', b.slug, 'timezone', b.timezone,
                                     'notify_email', b.notify_email, 'notify_push', b.notify_push),
      'owner_email', u.email,
      'subscriptions', coalesce((select jsonb_agg(jsonb_build_object('endpoint', ps.endpoint,
                                   'p256dh', ps.p256dh, 'auth', ps.auth))
                                 from public.push_subscriptions ps where ps.user_id = b.owner_id), '[]'),
      'item', v_item)
    from public.businesses b join auth.users u on u.id = b.owner_id
    where b.id = v_biz
  );
end;
$$;

create or replace function public.drop_push_subscription(p_secret text, p_endpoint text)
returns void
language plpgsql volatile security definer set search_path = ''
as $$
begin
  perform private.assert_secret(p_secret);
  delete from public.push_subscriptions where endpoint = p_endpoint;
end;
$$;

