-- Negocio de ejemplo: "Barbería La Esquina" (/b/barberia-demo).
-- Es un arenero: cualquiera puede reservar y ver el panel de solo lectura en /demo.
-- Sus citas se borran y se regeneran cada día para que siempre haya agenda que mostrar.

create or replace function public.reset_demo_appointments()
returns void
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_biz public.businesses;
  v_day date;
  v_res record;
  v_svc record;
  v_at timestamptz;
  v_names text[] := array['Juan Pérez', 'Camilo Rojas', 'Andrés Gómez', 'Felipe Díaz', 'Santiago Ruiz',
                          'Mateo Torres', 'Daniel Vargas', 'Sebastián Mora', 'Nicolás Castro', 'David León'];
  v_status text[] := array['confirmed', 'confirmed', 'pending', 'confirmed', 'pending'];
  i int := 0;
  h int;
begin
  select * into v_biz from public.businesses where slug = 'barberia-demo' and is_demo;
  if not found then
    return;
  end if;

  delete from public.appointments where business_id = v_biz.id;

  for d in 0..6 loop
    v_day := (now() at time zone v_biz.timezone)::date + d;
    continue when extract(dow from v_day) = 0;
    for v_res in select id from public.resources where business_id = v_biz.id order by sort loop
      foreach h in array array[9, 10, 11, 15, 16, 17] loop
        i := i + 1;
        continue when i % 3 = 0; -- deja huecos libres
        select id into v_svc from public.services
          where business_id = v_biz.id order by sort offset (i % 3) limit 1;
        v_at := (v_day + make_time(h, case when i % 2 = 0 then 0 else 30 end, 0)) at time zone v_biz.timezone;
        insert into public.appointments
          (business_id, service_id, resource_id, customer_name, customer_phone, starts_at, ends_at, status)
        select v_biz.id, s.id, v_res.id, v_names[1 + i % 10], '300000' || lpad((i % 9999)::text, 4, '0'),
               v_at, v_at + make_interval(mins => s.duration_minutes),
               case when v_at < now() then 'completed' else v_status[1 + i % 5] end
        from public.services s where s.id = v_svc.id
        on conflict do nothing;
      end loop;
    end loop;
  end loop;
end;
$$;

revoke execute on function public.reset_demo_appointments() from public, anon, authenticated;

do $$
declare
  v_owner uuid := '00000000-0000-4000-8000-00000000d3e0';
  v_biz uuid;
  v_carlos uuid;
  v_andres uuid;
  d int;
begin
  -- Dueño ficticio sin contraseña (no se puede iniciar sesión con él).
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values ('00000000-0000-0000-0000-000000000000', v_owner, 'authenticated', 'authenticated',
          'demo@agenda-citas.invalid', '', now(), '{"provider":"email","providers":["email"]}', '{}', now(), now())
  on conflict (id) do nothing;

  insert into public.businesses (owner_id, slug, name, category, resource_label, description, phone, address, is_demo)
  values (v_owner, 'barberia-demo', 'Barbería La Esquina', 'barberia', 'Barbero',
          'Negocio de ejemplo para probar la app. Reserva sin miedo: las citas se borran cada día.',
          null, 'Calle 36 # 27-50, Bucaramanga', true)
  returning id into v_biz;

  insert into public.resources (business_id, name, sort) values (v_biz, 'Carlos', 1) returning id into v_carlos;
  insert into public.resources (business_id, name, sort) values (v_biz, 'Andrés', 2) returning id into v_andres;

  -- Lunes a viernes 9-12 y 14-19 (almuerzo libre); sábado 8-14.
  for d in 1..5 loop
    insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values
      (v_biz, v_carlos, d, '09:00', '12:00'), (v_biz, v_carlos, d, '14:00', '19:00'),
      (v_biz, v_andres, d, '09:00', '12:00'), (v_biz, v_andres, d, '14:00', '19:00');
  end loop;
  insert into public.working_hours (business_id, resource_id, weekday, start_time, end_time) values
    (v_biz, v_carlos, 6, '08:00', '14:00'), (v_biz, v_andres, 6, '08:00', '14:00');

  insert into public.services (business_id, name, description, duration_minutes, price, sort) values
    (v_biz, 'Corte clásico', 'Máquina y tijera, con lavado.', 30, 20000, 1),
    (v_biz, 'Corte + barba', 'Corte completo y perfilado de barba con toalla caliente.', 45, 30000, 2),
    (v_biz, 'Arreglo de barba', 'Perfilado y afeitado.', 20, 12000, 3),
    (v_biz, 'Corte infantil', 'Para menores de 12 años.', 30, 15000, 4);

  perform public.reset_demo_appointments();
end;
$$;
