-- Tabla destino del pipeline ETL de Open-Meteo.
-- Una fila por ciudad y hora (UTC). La restricción única permite hacer
-- upsert y garantiza que reintentar una carga no duplica registros.

create table if not exists public.mediciones_meteorologicas (
  id               bigint generated always as identity primary key,
  ciudad           text             not null,
  fecha_hora       timestamptz      not null,
  temperatura_c    double precision not null,
  humedad_pct      double precision not null,
  precipitacion_mm double precision not null,
  importado_en     timestamptz      not null default now(),

  constraint mediciones_ciudad_fecha_hora_key unique (ciudad, fecha_hora),
  constraint mediciones_ciudad_no_vacia check (length(btrim(ciudad)) > 0),
  -- double precision admite NaN e ±Infinity; solo aceptamos números finitos.
  -- En Postgres NaN se ordena por encima de Infinity, así que "< 'Infinity'"
  -- también lo excluye.
  constraint mediciones_temperatura_finita
    check (temperatura_c > '-Infinity' and temperatura_c < 'Infinity'),
  constraint mediciones_humedad_rango
    check (humedad_pct >= 0 and humedad_pct <= 100),
  constraint mediciones_precipitacion_no_negativa
    check (precipitacion_mm >= 0 and precipitacion_mm < 'Infinity')
);

comment on table public.mediciones_meteorologicas is
  'Mediciones horarias de Open-Meteo (archivo histórico) cargadas por el pipeline ETL.';
comment on column public.mediciones_meteorologicas.fecha_hora is
  'Inicio de la hora en UTC.';
comment on column public.mediciones_meteorologicas.importado_en is
  'Momento de la primera inserción. Un upsert posterior actualiza las mediciones, no esta columna.';

-- Consultas por intervalo de fechas sin filtrar por ciudad.
create index if not exists mediciones_fecha_hora_idx
  on public.mediciones_meteorologicas (fecha_hora);

-- RLS activado y SIN políticas: anon y authenticated no pueden leer ni
-- escribir. Solo el servidor de la aplicación accede, con la clave secreta
-- (rol service_role, que omite RLS).
alter table public.mediciones_meteorologicas enable row level security;

revoke all on table public.mediciones_meteorologicas from anon, authenticated;
grant select, insert, update on table public.mediciones_meteorologicas to service_role;
