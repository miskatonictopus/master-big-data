const PATRON_FECHA_HORA =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?(Z|\+00:00)?$/
const PATRON_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/

/**
 * Interpreta una fecha y hora de Open-Meteo como UTC de forma explícita.
 *
 * Open-Meteo devuelve "2026-09-01T00:00" sin zona horaria. `new Date()` con
 * esa cadena la interpretaría en la zona local del navegador, así que la
 * descomponemos y construimos el instante con Date.UTC. Se rechazan fechas
 * imposibles (p. ej. 2026-02-30) y cualquier desplazamiento distinto de UTC.
 */
export function parsearFechaHoraUtc(valor: unknown): string | null {
  if (typeof valor !== "string") return null
  const m = PATRON_FECHA_HORA.exec(valor.trim())
  if (!m) return null
  const [anio, mes, dia, hora, minuto, segundo, milis] = m
    .slice(1, 8)
    .map((p, i) => (p === undefined ? 0 : i === 6 ? Number(p.padEnd(3, "0")) : Number(p)))
  const ms = Date.UTC(anio, mes - 1, dia, hora, minuto, segundo, milis)
  const d = new Date(ms)
  if (
    d.getUTCFullYear() !== anio ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia ||
    d.getUTCHours() !== hora ||
    d.getUTCMinutes() !== minuto
  ) {
    return null
  }
  return d.toISOString()
}

/** Convierte "YYYY-MM-DD" en milisegundos UTC a las 00:00, o null si no es válida. */
export function parsearFechaUtc(valor: string): number | null {
  const m = PATRON_FECHA.exec(valor)
  if (!m) return null
  const [anio, mes, dia] = m.slice(1, 4).map(Number)
  const ms = Date.UTC(anio, mes - 1, dia)
  const d = new Date(ms)
  if (d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null
  return ms
}

export function hoyUtc(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Número de días incluidos en el intervalo [inicio, fin]. */
export function diasIncluidos(inicio: string, fin: string): number | null {
  const a = parsearFechaUtc(inicio)
  const b = parsearFechaUtc(fin)
  if (a === null || b === null) return null
  return Math.round((b - a) / 86_400_000) + 1
}

/** "2026-09-01T00:00:00.000Z" → "2026-09-01 00:00 UTC" */
export function formatearFechaHora(iso: string): string {
  return `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`
}
