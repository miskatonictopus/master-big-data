# Pipeline ETL: Open-Meteo → Supabase

Práctica 1 de Big Data. Aplicación web para ejecutar y **ver** un primer
pipeline ETL: extraer datos horarios de la API histórica de Open-Meteo,
transformarlos, limpiarlos, filtrarlos/seleccionarlos y cargarlos en Supabase.

Stack: Next.js 16 (App Router) · TypeScript · Tailwind 4 · shadcn/ui (Base UI) ·
supabase-js · Vitest.

## Instalación

```bash
npm install
```

## Configuración de Supabase

1. **Crea la tabla.** Ejecuta
   `supabase/migrations/20261023120000_mediciones_meteorologicas.sql` en el
   *SQL Editor* de tu proyecto (o `supabase db push` si usas la CLI enlazada).
2. **Variables de entorno.** Copia `.env.example` a `.env.local` y rellena:

   | Variable                   | Dónde                                   | Uso                       |
   | -------------------------- | --------------------------------------- | ------------------------- |
   | `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → API                  | URL del proyecto          |
   | `SUPABASE_SECRET_KEY`      | Project Settings → API Keys (`sb_secret_…`, o la `service_role` antigua) | **Solo servidor**: lectura y escritura |

   Reinicia `npm run dev` tras cambiarlas. Sin la clave secreta la app
   funciona hasta la vista previa, pero la carga devuelve un error explícito
   (no se simula ningún éxito).

## Ejecución

```bash
npm run dev        # http://localhost:3000
npm test           # pruebas unitarias + integración con Open-Meteo real
npm run typecheck
npm run build
```

## El pipeline

| Fase | Qué ocurre |
| --- | --- |
| **1. Extracción** | Una petición por ciudad a `archive-api.open-meteo.com/v1/archive` con `timezone=UTC`, °C y mm (máx. 31 días). Se guarda el JSON original en memoria y se puede descargar. Si una ciudad falla, se reintenta solo esa. |
| **2. Transformación** | Los arrays paralelos de `hourly` se combinan por posición: una fila por ciudad y hora. La hora (`2026-09-01T00:00`, sin zona) se interpreta **explícitamente como UTC**. Se comprueba que los arrays tengan la misma longitud; los huecos quedan como *ausentes*, nunca como 0. |
| **3. Limpieza** | Se rechaza cada fila sin ciudad, sin fecha válida o con alguna medición nula, ausente, vacía, no numérica o no finita; humedad fuera de 0–100; precipitación negativa. **No** se filtran temperaturas extremas. Después se eliminan duplicados por (ciudad, fecha_hora) conservando la **primera aparición** en el orden de llegada; una fila defectuosa nunca desplaza a una válida. Cada rechazo guarda su motivo. |
| **4. Filtrado y selección** | Sobre los válidos: filtros → ordenación → selección. La paginación solo afecta a la vista. Solo se suben las filas seleccionadas que **siguen cumpliendo** los filtros; las que quedan fuera se cuentan aparte. Cambiar filtros no selecciona filas nuevas. |
| **5. Carga** | Se congela una copia de la selección, en su orden. Se envía al servidor en lotes de ≤ 500, que la **vuelve a validar** y hace `upsert` por (ciudad, fecha_hora): reintentar nunca duplica. Se detiene en el primer lote fallido y permite reintentar los fallidos/pendientes. Al final se comprueba que cada clave enviada existe en destino. |

La base de datos **no conserva el orden de inserción**: para leer ordenado
hay que usar `ORDER BY` (la pestaña «Datos en Supabase» lo hace).

Los contadores distinguen: total extraído · válidos · rechazados · coinciden
con los filtros · seleccionados para cargar.

## Seguridad

- Toda lectura y escritura en Supabase ocurre en rutas de servidor
  (`app/api/*`) con `lib/supabase/servidor.ts` (marcado `server-only`). La
  clave secreta nunca lleva prefijo `NEXT_PUBLIC_` ni llega al navegador.
- El servidor valida cada lote (estructura, reglas de calidad, ciudades
  permitidas, claves repetidas, ≤ 500 registros, cuerpo ≤ 256 KB).
- La tabla tiene RLS activado y **ninguna política**: `anon` y
  `authenticated` no pueden leer ni escribir.
- ⚠️ **El proyecto no tiene autenticación.** Las rutas `/api/carga`,
  `/api/verificar` y `/api/mediciones` están abiertas para desarrollo local.
  Antes de publicar la app hay que protegerlas (inicio de sesión + control
  de rol).

## Pruebas

- `tests/transformacion-limpieza.test.ts` y
  `tests/filtros-seleccion-carga.test.ts`: lógica del pipeline con fixtures
  controlados (`tests/fixtures/`), que nunca se mezclan con datos reales.
- `tests/validacion-servidor.test.ts`: validación y límite de tamaño.
- `tests/integracion-open-meteo.test.ts`: API real (omitir con `SIN_RED=1`).
- `tests/e2e-supabase.test.ts`: opcional, contra la app en marcha y un
  Supabase **de pruebas** (escribe en la tabla). Solo corre con
  `E2E_URL=http://localhost:3000`.
