import { NOMBRES_CIUDADES } from "./ciudades"
import { TAMANO_LOTE } from "./carga"
import { parsearFechaHoraUtc } from "./fechas"
import { claveRegistro, motivoNoNumerico } from "./limpieza"
import type { Registro } from "./types"

/** 500 registros ocupan ~70 KB en JSON; 256 KB deja margen sin abrir la puerta a abusos. */
export const MAX_BYTES_PETICION = 256 * 1024

type Resultado<T> =
  | { ok: true; valor: T }
  | { ok: false; error: string; status?: number }

function validarClave(
  item: unknown,
  i: number
): Resultado<{ ciudad: string; fecha_hora: string }> {
  if (typeof item !== "object" || item === null) {
    return { ok: false, error: `Registro ${i}: no es un objeto.` }
  }
  const { ciudad, fecha_hora } = item as Record<string, unknown>
  if (typeof ciudad !== "string" || !NOMBRES_CIUDADES.includes(ciudad)) {
    return { ok: false, error: `Registro ${i}: ciudad no permitida.` }
  }
  const iso = parsearFechaHoraUtc(fecha_hora)
  if (iso === null || iso !== fecha_hora) {
    return {
      ok: false,
      error: `Registro ${i}: fecha_hora debe ser ISO 8601 en UTC (…Z).`,
    }
  }
  return { ok: true, valor: { ciudad, fecha_hora: iso } }
}

function validarRegistro(item: unknown, i: number): Resultado<Registro> {
  const clave = validarClave(item, i)
  if (!clave.ok) return clave
  const o = item as Record<string, unknown>
  const extra = Object.keys(o).filter(
    (k) =>
      ![
        "ciudad",
        "fecha_hora",
        "temperatura_c",
        "humedad_pct",
        "precipitacion_mm",
      ].includes(k)
  )
  if (extra.length > 0) {
    return { ok: false, error: `Registro ${i}: campos no permitidos (${extra.join(", ")}).` }
  }
  for (const campo of ["temperatura_c", "humedad_pct", "precipitacion_mm"]) {
    const motivo = motivoNoNumerico(o[campo], campo)
    if (motivo) return { ok: false, error: `Registro ${i}: ${motivo}.` }
  }
  const humedad = o.humedad_pct as number
  const precipitacion = o.precipitacion_mm as number
  if (humedad < 0 || humedad > 100) {
    return { ok: false, error: `Registro ${i}: humedad_pct fuera de 0–100.` }
  }
  if (precipitacion < 0) {
    return { ok: false, error: `Registro ${i}: precipitacion_mm negativa.` }
  }
  return {
    ok: true,
    valor: {
      ...clave.valor,
      temperatura_c: o.temperatura_c as number,
      humedad_pct: humedad,
      precipitacion_mm: precipitacion,
    },
  }
}

function validarLista<T>(
  cuerpo: unknown,
  propiedad: string,
  validar: (item: unknown, i: number) => Resultado<T>,
  clave: (v: T) => string
): Resultado<T[]> {
  const lista = (cuerpo as Record<string, unknown> | null)?.[propiedad]
  if (!Array.isArray(lista)) {
    return { ok: false, error: `El cuerpo debe contener un array "${propiedad}".` }
  }
  if (lista.length === 0) {
    return { ok: false, error: `"${propiedad}" está vacío.` }
  }
  if (lista.length > TAMANO_LOTE) {
    return {
      ok: false,
      error: `Como máximo ${TAMANO_LOTE} elementos por petición (recibidos ${lista.length}).`,
    }
  }
  const valores: T[] = []
  const vistas = new Set<string>()
  for (let i = 0; i < lista.length; i++) {
    const r = validar(lista[i], i)
    if (!r.ok) return r
    const k = clave(r.valor)
    // Postgres rechaza un upsert que toca dos veces la misma fila.
    if (vistas.has(k)) {
      return { ok: false, error: `Registro ${i}: clave repetida en el lote.` }
    }
    vistas.add(k)
    valores.push(r.valor)
  }
  return { ok: true, valor: valores }
}

export function validarLoteCarga(cuerpo: unknown): Resultado<Registro[]> {
  return validarLista(cuerpo, "registros", validarRegistro, claveRegistro)
}

export function validarLoteClaves(
  cuerpo: unknown
): Resultado<{ ciudad: string; fecha_hora: string }[]> {
  return validarLista(cuerpo, "claves", validarClave, claveRegistro)
}

/**
 * Lee el cuerpo comprobando el tamaño real mientras llega, no solo la
 * cabecera Content-Length (que el cliente puede omitir o falsear).
 */
export async function leerJsonLimitado(
  request: Request
): Promise<Resultado<unknown>> {
  const demasiado = {
    ok: false as const,
    status: 413,
    error: `La petición supera el tamaño máximo (${MAX_BYTES_PETICION / 1024} KB).`,
  }
  const declarado = Number(request.headers.get("content-length") ?? 0)
  if (declarado > MAX_BYTES_PETICION) return demasiado
  if (!request.body) return { ok: false, error: "La petición no tiene cuerpo." }

  const lector = request.body.getReader()
  const trozos: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await lector.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_BYTES_PETICION) {
      await lector.cancel()
      return demasiado
    }
    trozos.push(value)
  }
  const bytes = new Uint8Array(total)
  let desplazamiento = 0
  for (const t of trozos) {
    bytes.set(t, desplazamiento)
    desplazamiento += t.byteLength
  }
  try {
    return { ok: true, valor: JSON.parse(new TextDecoder().decode(bytes)) }
  } catch {
    return { ok: false, error: "El cuerpo no es JSON válido." }
  }
}
