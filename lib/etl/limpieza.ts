import { formatearFechaHora } from "./fechas"
import type { FilaTransformada, Rechazo, Registro } from "./types"

export function claveRegistro(r: {
  ciudad: string
  fecha_hora: string
}): string {
  return `${r.ciudad}|${r.fecha_hora}`
}

/** Devuelve el motivo por el que un valor no es un número utilizable, o null. */
export function motivoNoNumerico(valor: unknown, campo: string): string | null {
  if (valor === undefined) return `${campo}: valor ausente`
  if (valor === null) return `${campo}: valor nulo`
  if (valor === "") return `${campo}: cadena vacía`
  if (typeof valor !== "number") {
    return `${campo}: tipo no numérico (${typeof valor} ${JSON.stringify(valor)})`
  }
  if (!Number.isFinite(valor)) return `${campo}: número no finito (${valor})`
  return null
}

export function motivosCalidad(fila: FilaTransformada): string[] {
  const motivos: string[] = []
  if (typeof fila.ciudad !== "string" || fila.ciudad.trim() === "") {
    motivos.push("ciudad: ausente")
  }
  if (fila.fecha_hora === null) {
    motivos.push(
      `fecha_hora: no es una fecha válida (${JSON.stringify(fila.fecha_original) ?? "ausente"})`
    )
  }
  const temp = motivoNoNumerico(fila.temperatura_c, "temperatura_c")
  const hum = motivoNoNumerico(fila.humedad_pct, "humedad_pct")
  const prec = motivoNoNumerico(fila.precipitacion_mm, "precipitacion_mm")
  if (temp) motivos.push(temp)
  if (hum) motivos.push(hum)
  else if ((fila.humedad_pct as number) < 0 || (fila.humedad_pct as number) > 100) {
    motivos.push(`humedad_pct: fuera de 0–100 (${fila.humedad_pct})`)
  }
  if (prec) motivos.push(prec)
  else if ((fila.precipitacion_mm as number) < 0) {
    motivos.push(`precipitacion_mm: negativa (${fila.precipitacion_mm})`)
  }
  // Las temperaturas no se filtran por umbrales: un valor extremo pero
  // físicamente posible es un dato, no un error.
  return motivos
}

export type ResultadoLimpieza = {
  validos: Registro[]
  rechazados: Rechazo[]
}

/**
 * Valida cada fila y elimina duplicados por (ciudad, fecha_hora).
 *
 * Primero se aplican las reglas de calidad y después la deduplicación sobre
 * las filas válidas, de modo que una fila defectuosa nunca desplaza a una
 * correcta. Entre duplicados válidos se conserva la PRIMERA aparición en el
 * orden de llegada (orden de ciudades extraídas y, dentro de cada ciudad,
 * orden del array `time`); las siguientes se rechazan como duplicadas.
 */
export function limpiar(filas: FilaTransformada[]): ResultadoLimpieza {
  const validos: Registro[] = []
  const rechazados: Rechazo[] = []
  const vistos = new Map<string, FilaTransformada>()

  for (const fila of filas) {
    const motivos = motivosCalidad(fila)
    if (motivos.length > 0) {
      rechazados.push({ fila, tipo: "calidad", motivos })
      continue
    }
    const registro: Registro = {
      ciudad: (fila.ciudad as string).trim(),
      fecha_hora: fila.fecha_hora as string,
      temperatura_c: fila.temperatura_c as number,
      humedad_pct: fila.humedad_pct as number,
      precipitacion_mm: fila.precipitacion_mm as number,
    }
    const clave = claveRegistro(registro)
    const original = vistos.get(clave)
    if (original) {
      rechazados.push({
        fila,
        tipo: "duplicado",
        motivos: [
          `Duplicado de ${registro.ciudad} ${formatearFechaHora(registro.fecha_hora)}: se conserva la primera aparición (posición ${original.origen.indice} de ${original.origen.ciudadId}).`,
        ],
      })
      continue
    }
    vistos.set(clave, fila)
    validos.push(registro)
  }

  return { validos, rechazados }
}
