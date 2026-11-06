BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.seguimientos WHERE usuario_central IS NULL
  ) THEN
    RAISE EXCEPTION 'Hay seguimientos sin identidad central asociada';
  END IF;

  IF EXISTS (SELECT 1 FROM public.contactos_audit) THEN
    RAISE EXCEPTION 'contactos_audit contiene filas; migrar su identidad antes de continuar';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.usuarios u
    WHERE NOT EXISTS (
      SELECT 1 FROM public.imi_sso_vinculos v WHERE v.usuario_salud_id = u.id
    )
  ) THEN
    RAISE EXCEPTION 'Hay usuarios locales sin vínculo de origen central';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.imi_sso_vinculos v
    WHERE NOT EXISTS (
      SELECT 1 FROM public.usuarios u WHERE u.id = v.usuario_salud_id
    )
  ) THEN
    RAISE EXCEPTION 'Hay vínculos locales sin usuario de origen';
  END IF;
END
$preflight$;

ALTER TABLE public.seguimientos
  DROP CONSTRAINT IF EXISTS seguimientos_usuario_id_fkey;
ALTER TABLE public.seguimientos
  DROP COLUMN IF EXISTS usuario_id;

ALTER TABLE public.contactos_audit
  DROP CONSTRAINT IF EXISTS contactos_audit_usuario_id_fkey;
ALTER TABLE public.contactos_audit
  DROP COLUMN IF EXISTS usuario_id;

DROP TABLE public.imi_sso_vinculos;
DROP TABLE public.usuarios;

COMMIT;
