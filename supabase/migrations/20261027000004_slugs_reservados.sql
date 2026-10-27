-- Enlaces que chocarían con rutas de la app (/panel/cuenta, /demo...) o que confunden.
alter table public.businesses add constraint businesses_slug_not_reserved
  check (slug not in ('cuenta', 'demo', 'panel', 'entrar', 'admin', 'api', 'auth', 'cita', 'nuevo', 'b'));
