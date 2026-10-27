-- Regenera la agenda del negocio demo todos los días a las 5:00 a. m. de Bogotá (10:00 UTC).
-- Solo en Supabase: si pg_cron no existe (p. ej. en las pruebas locales) no hace nada.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
    perform cron.schedule('reset-demo', '0 10 * * *', 'select public.reset_demo_appointments()');
  end if;
end;
$$;
