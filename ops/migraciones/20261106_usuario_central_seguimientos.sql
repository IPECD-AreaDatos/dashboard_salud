BEGIN;
SET LOCAL lock_timeout = '5s';

ALTER TABLE public.seguimientos
  ADD COLUMN IF NOT EXISTS usuario_central varchar(100);

UPDATE public.seguimientos s
SET usuario_central = lower(btrim(u.username))
FROM public.usuarios u
WHERE s.usuario_id = u.id
  AND s.usuario_central IS DISTINCT FROM lower(btrim(u.username));

COMMIT;
