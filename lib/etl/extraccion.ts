import { buscarCiudad } from "./ciudades"
import { diasIncluidos, hoyUtc, parsearFechaUtc } from "./fechas"
import type { Ciudad, ConfigExtraccion } from "./types"

export const URL_ARCHIVO_OPEN_METEO =
  "https://archive-api.open-meteo.com/v1/archive"
export const VARIABLES_HORARIAS = [
  "temperature_2m",
  "relative_humidity_2m",
  "precipitation",
] as const
export const MAX_DIAS_EXTRACCION = 31
export const FECHA_MINIMA_ARCHIVO = "1940-01-01"

export function construirUrl(
  ciudad: Ciudad,
  inicio: string,
  fin: string
): string {
  const params = new URLSearchParams({
    latitude: String(ciudad.latitud),
    longitude: String(ciudad.longitud),
    start_date: inicio,
    end_date: fin,
    hourly: VARIABLES_HORARIAS.join(","),
    timezone: "UTC",
    temperature_unit: "celsius",
    precipitation_unit: "mm",
  })
  return `${URL_ARCHIVO_OPEN_METEO}?${params}`
}

export function validarConfig(config: ConfigExtraccion): string[] {
  const errores: string[] = []
  if (config.ciudadIds.length === 0) {
    errores.push("Selecciona al menos una ciudad.")
  }
  if (config.ciudadIds.some((id) => !buscarCiudad(id))) {
    errores.push("Hay ciudades desconocidas en la selección.")
  }
  const inicio = parsearFechaUtc(config.inicio)
  const fin = parsearFechaUtc(config.fin)
  if (inicio === null) errores.push("La fecha inicial no es válida.")
  if (fin === null) errores.push("La fecha final no es válida.")
  if (inicio !== null && fin !== null) {
    if (fin < inicio) {
      errores.push("La fecha final debe ser igual o posterior a la inicial.")
    } else {
      const dias = diasIncluidos(config.inicio, config.fin)!
      if (dias > MAX_DIAS_EXTRACCION) {
        errores.push(
          `El periodo abarca ${dias} días; el máximo por extracción es ${MAX_DIAS_EXTRACCION}.`
        )
      }
    }
    if (inicio < parsearFechaUtc(FECHA_MINIMA_ARCHIVO)!) {
      errores.push("El archivo histórico empieza el 1 de enero de 1940.")
    }
    if (fin > parsearFechaUtc(hoyUtc())!) {
      errores.push("La fecha final no puede ser posterior a hoy (UTC).")
    }
  }
  return errores
}

export function volumenPrevisto(config: ConfigExtraccion) {
  const dias = diasIncluidos(config.inicio, config.fin) ?? 0
  const ciudades = config.ciudadIds.length
  const filas = Math.max(dias, 0) * 24 * ciudades
  return {
    peticiones: ciudades,
    dias: Math.max(dias, 0),
    filas,
    valores: filas * VARIABLES_HORARIAS.length,
  }
}

/**
 * Descarga el JSON de una ciudad. Lanza un Error con un mensaje en castellano
 * si la red falla, la respuesta no es JSON o Open-Meteo devuelve un error.
 */
export async function descargarCiudad(
  url: string,
  fetchFn: typeof fetch = fetch
): Promise<unknown> {
  let respuesta: Response
  try {
    respuesta = await fetchFn(url, { signal: AbortSignal.timeout(30_000) })
  } catch (e) {
    const motivo =
      e instanceof DOMException && e.name === "TimeoutError"
        ? "tiempo de espera agotado (30 s)"
        : e instanceof Error
          ? e.message
          : String(e)
    throw new Error(`No se pudo conectar con Open-Meteo: ${motivo}`)
  }
  let cuerpo: unknown
  try {
    cuerpo = await respuesta.json()
  } catch {
    throw new Error(
      `Open-Meteo respondió ${respuesta.status} con un cuerpo que no es JSON.`
    )
  }
  const razon =
    cuerpo && typeof cuerpo === "object" && "reason" in cuerpo
      ? String((cuerpo as { reason: unknown }).reason)
      : null
  if (!respuesta.ok || (cuerpo as { error?: unknown })?.error === true) {
    throw new Error(
      `Open-Meteo respondió ${respuesta.status}${razon ? `: ${razon}` : ""}`
    )
  }
  return cuerpo
}
