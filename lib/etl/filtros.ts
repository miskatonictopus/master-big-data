import { parsearFechaHoraUtc } from "./fechas"
import { claveRegistro } from "./limpieza"
import type { CampoOrden, Orden, Registro } from "./types"

/** Los filtros se guardan como texto, tal como los escribe el usuario. */
export type Filtros = {
  ciudades: string[] // vacío = todas
  desde: string // "YYYY-MM-DDTHH:mm" interpretado como UTC
  hasta: string
  temperaturaMin: string
  temperaturaMax: string
  humedadMin: string
  humedadMax: string
  precipitacionMin: string
  precipitacionMax: string
  soloLluvia: boolean
}

export const FILTROS_INICIALES: Filtros = {
  ciudades: [],
  desde: "",
  hasta: "",
  temperaturaMin: "",
  temperaturaMax: "",
  humedadMin: "",
  humedadMax: "",
  precipitacionMin: "",
  precipitacionMax: "",
  soloLluvia: false,
}

export const ORDEN_INICIAL: Orden = { campo: "fecha_hora", direccion: "asc" }

type CampoTexto = Exclude<keyof Filtros, "ciudades" | "soloLluvia">

export type FiltrosInterpretados = {
  ciudades: Set<string> | null
  desde: string | null
  hasta: string | null
  temperaturaMin: number | null
  temperaturaMax: number | null
  humedadMin: number | null
  humedadMax: number | null
  precipitacionMin: number | null
  precipitacionMax: number | null
  soloLluvia: boolean
}

/**
 * Interpreta los filtros. Un campo vacío no filtra. Un campo con un valor no
 * interpretable se devuelve en `errores` y tampoco filtra, para que el
 * usuario vea el problema en lugar de obtener un resultado silenciosamente
 * vacío.
 */
export function interpretarFiltros(f: Filtros): {
  filtros: FiltrosInterpretados
  errores: Partial<Record<CampoTexto, string>>
} {
  const errores: Partial<Record<CampoTexto, string>> = {}
  const numero = (campo: CampoTexto): number | null => {
    const texto = f[campo].trim().replace(",", ".")
    if (texto === "") return null
    const n = Number(texto)
    if (!Number.isFinite(n)) {
      errores[campo] = "Introduce un número válido."
      return null
    }
    return n
  }
  const fecha = (campo: CampoTexto): string | null => {
    if (f[campo] === "") return null
    const iso = parsearFechaHoraUtc(f[campo])
    if (iso === null) errores[campo] = "Fecha y hora no válidas."
    return iso
  }

  const filtros: FiltrosInterpretados = {
    ciudades: f.ciudades.length > 0 ? new Set(f.ciudades) : null,
    desde: fecha("desde"),
    hasta: fecha("hasta"),
    temperaturaMin: numero("temperaturaMin"),
    temperaturaMax: numero("temperaturaMax"),
    humedadMin: numero("humedadMin"),
    humedadMax: numero("humedadMax"),
    precipitacionMin: numero("precipitacionMin"),
    precipitacionMax: numero("precipitacionMax"),
    soloLluvia: f.soloLluvia,
  }

  const rangos: [CampoTexto, number | string | null, number | string | null][] =
    [
      ["hasta", filtros.desde, filtros.hasta],
      ["temperaturaMax", filtros.temperaturaMin, filtros.temperaturaMax],
      ["humedadMax", filtros.humedadMin, filtros.humedadMax],
      ["precipitacionMax", filtros.precipitacionMin, filtros.precipitacionMax],
    ]
  for (const [campo, min, max] of rangos) {
    if (min !== null && max !== null && min > max) {
      errores[campo] = "El máximo es menor que el mínimo."
    }
  }

  return { filtros, errores }
}

const dentro = (v: number, min: number | null, max: number | null) =>
  (min === null || v >= min) && (max === null || v <= max)

export function aplicarFiltros(
  registros: Registro[],
  f: FiltrosInterpretados
): Registro[] {
  return registros.filter(
    (r) =>
      (f.ciudades === null || f.ciudades.has(r.ciudad)) &&
      (f.desde === null || r.fecha_hora >= f.desde) &&
      (f.hasta === null || r.fecha_hora <= f.hasta) &&
      dentro(r.temperatura_c, f.temperaturaMin, f.temperaturaMax) &&
      dentro(r.humedad_pct, f.humedadMin, f.humedadMax) &&
      dentro(r.precipitacion_mm, f.precipitacionMin, f.precipitacionMax) &&
      (!f.soloLluvia || r.precipitacion_mm > 0)
  )
}

const comparadorCiudad = new Intl.Collator("es")

function comparar(a: Registro, b: Registro, campo: CampoOrden): number {
  if (campo === "ciudad") return comparadorCiudad.compare(a.ciudad, b.ciudad)
  if (campo === "fecha_hora") {
    return a.fecha_hora < b.fecha_hora ? -1 : a.fecha_hora > b.fecha_hora ? 1 : 0
  }
  return a[campo] - b[campo]
}

/**
 * Ordena sin modificar el array original. Los empates se resuelven siempre
 * por ciudad y fecha ascendentes para que el resultado sea determinista.
 */
export function ordenar(registros: Registro[], orden: Orden): Registro[] {
  const signo = orden.direccion === "asc" ? 1 : -1
  return [...registros].sort(
    (a, b) =>
      signo * comparar(a, b, orden.campo) ||
      comparar(a, b, "ciudad") ||
      comparar(a, b, "fecha_hora")
  )
}

/**
 * Selección efectiva: filas seleccionadas que siguen cumpliendo los filtros,
 * en el orden elegido. Es exactamente lo que se enviará a Supabase.
 */
export function seleccionEfectiva(
  ordenados: Registro[],
  seleccion: ReadonlySet<string>
): Registro[] {
  return ordenados.filter((r) => seleccion.has(claveRegistro(r)))
}

/** Cuántas claves seleccionadas existen entre los válidos pero no pasan los filtros. */
export function seleccionadasFueraDeFiltros(
  validos: Registro[],
  filtrados: Registro[],
  seleccion: ReadonlySet<string>
): number {
  const enFiltro = new Set(filtrados.map(claveRegistro))
  let n = 0
  for (const r of validos) {
    const k = claveRegistro(r)
    if (seleccion.has(k) && !enFiltro.has(k)) n++
  }
  return n
}

/**
 * Fase de filtrado y ordenación sobre el conjunto completo, midiendo su
 * duración real. La paginación se aplica después, solo para mostrar.
 */
export function filtrarYOrdenar(
  validos: Registro[],
  filtros: FiltrosInterpretados,
  orden: Orden
): { ordenados: Registro[]; duracionMs: number } {
  const t0 = performance.now()
  const ordenados = ordenar(aplicarFiltros(validos, filtros), orden)
  return { ordenados, duracionMs: performance.now() - t0 }
}
