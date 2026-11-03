-- Vinculación explícita entre una cuenta central y su cuenta individual de Salud.
-- No crea usuarios ni asigna accesos automáticamente.
CREATE TABLE IF NOT EXISTS public.imi_sso_vinculos (
  usuario_central varchar(50) PRIMARY KEY CHECK (usuario_central ~ '^[a-z][a-z0-9_.-]{2,49}$'),
  usuario_salud_id integer NOT NULL UNIQUE REFERENCES public.usuarios(id),
  activo boolean NOT NULL DEFAULT true,
  creado_en timestamptz NOT NULL DEFAULT now()
);
