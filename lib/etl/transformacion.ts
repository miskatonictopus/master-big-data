import { parsearFechaHoraUtc } from "./fechas"
import type { Ciudad, FilaTransformada, TransformacionCiudad } from "./types"

const UNIDADES_ESPERADAS: Record<string, string> = {
  temperature_2m: "°C",
  relative_humidity_2m: "%",
  precipitation: "mm",
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v)
}

/**
 * Convierte los arrays paralelos de `hourly` en una fila por hora.
 *
 * - El array `time` define las horas. Si una variable tiene otra longitud se
 *   anota un aviso y las posiciones que faltan quedan como `undefined`
 *   ("ausente"); la limpieza las rechazará. Nunca se rellenan con cero.
 * - Si la respuesta no está en UTC o las unidades no son las pedidas, la
 *   ciudad entera se marca con error: no podríamos interpretar los datos.
 */
export function transformarCiudad(
  ciudad: Ciudad,
  json: unknown
): TransformacionCiudad {
  const base = { ciudadId: ciudad.id, filas: [], avisos: [] }
  if (!esObjeto(json)) {
    return { ...base, error: "La respuesta no es un objeto JSON." }
  }
  if (json.utc_offset_seconds !== 0) {
    return {
      ...base,
      error: `La respuesta no está en UTC (utc_offset_seconds = ${String(json.utc_offset_seconds)}).`,
    }
  }
  const unidades = esObjeto(json.hourly_units) ? json.hourly_units : {}
  for (const [variable, esperada] of Object.entries(UNIDADES_ESPERADAS)) {
    if (variable in unidades && unidades[variable] !== esperada) {
      return {
        ...base,
        error: `Unidad inesperada para ${variable}: "${String(unidades[variable])}" (se esperaba "${esperada}").`,
      }
    }
  }
  const hourly = json.hourly
  if (!esObjeto(hourly) || !Array.isArray(hourly.time)) {
    return { ...base, error: "La respuesta no contiene hourly.time." }
  }

  const tiempos = hourly.time
  const avisos: string[] = []
  const series: Record<string, unknown[]> = {}
  for (const variable of Object.keys(UNIDADES_ESPERADAS)) {
    const serie = hourly[variable]
    if (!Array.isArray(serie)) {
      avisos.push(
        `Falta el array ${variable}: sus valores quedarán como ausentes.`
      )
      series[variable] = []
    } else {
      if (serie.length !== tiempos.length) {
        avisos.push(
          `Longitud incoherente: ${variable} tiene ${serie.length} valores y time tiene ${tiempos.length}.`
        )
      }
      series[variable] = serie
    }
  }

  const filas: FilaTransformada[] = tiempos.map((t, i) => ({
    ciudad: ciudad.nombre,
    fecha_hora: parsearFechaHoraUtc(t),
    fecha_original: t,
    temperatura_c: series.temperature_2m[i],
    humedad_pct: series.relative_humidity_2m[i],
    precipitacion_mm: series.precipitation[i],
    origen: { ciudadId: ciudad.id, indice: i },
  }))

  const sobrantes = Math.max(
    ...Object.values(series).map((s) => s.length - tiempos.length)
  )
  if (sobrantes > 0) {
    avisos.push(
      `Hay ${sobrantes} valores sin hora asociada en time; se ignoran porque no se pueden fechar.`
    )
  }

  return { ciudadId: ciudad.id, filas, avisos }
}
