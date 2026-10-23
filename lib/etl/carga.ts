import type { Registro } from "./types"

export const TAMANO_LOTE = 500

export type EstadoLote = "pendiente" | "en_curso" | "completado" | "error"

export type Lote = {
  indice: number
  registros: Registro[]
  estado: EstadoLote
  procesados?: number
  error?: string
  duracionMs?: number
  intentos: number
}

export function dividirEnLotes<T>(items: T[], tamano = TAMANO_LOTE): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < items.length; i += tamano) {
    lotes.push(items.slice(i, i + tamano))
  }
  return lotes
}

export function crearLotes(registros: Registro[]): Lote[] {
  return dividirEnLotes(registros).map((r, indice) => ({
    indice,
    registros: r,
    estado: "pendiente",
    intentos: 0,
  }))
}

export type EnviarLote = (registros: Registro[]) => Promise<{ procesados: number }>

/**
 * Envía en orden los lotes que no están completados. Se detiene en el
 * primer fallo: los lotes anteriores conservan su estado y los siguientes
 * quedan pendientes, así un reintento retoma exactamente donde se quedó.
 * Como el destino hace upsert por (ciudad, fecha_hora), reenviar un lote
 * nunca duplica filas.
 */
export async function ejecutarLotes(
  lotes: Lote[],
  enviar: EnviarLote,
  alCambiar: (lotes: Lote[]) => void,
  ahora: () => number = () => performance.now()
): Promise<Lote[]> {
  let actual = lotes.map((l) =>
    l.estado === "completado" ? l : { ...l, estado: "pendiente" as const }
  )
  const actualizar = (indice: number, cambios: Partial<Lote>) => {
    actual = actual.map((l) => (l.indice === indice ? { ...l, ...cambios } : l))
    alCambiar(actual)
  }

  for (const lote of actual) {
    if (lote.estado === "completado") continue
    const inicio = ahora()
    actualizar(lote.indice, {
      estado: "en_curso",
      error: undefined,
      intentos: lote.intentos + 1,
    })
    try {
      const { procesados } = await enviar(lote.registros)
      actualizar(lote.indice, {
        estado: "completado",
        procesados,
        duracionMs: ahora() - inicio,
      })
    } catch (e) {
      actualizar(lote.indice, {
        estado: "error",
        error: e instanceof Error ? e.message : String(e),
        duracionMs: ahora() - inicio,
      })
      break
    }
  }
  return actual
}

export function resumenLotes(lotes: Lote[]) {
  const completados = lotes.filter((l) => l.estado === "completado")
  const fallidos = lotes.filter((l) => l.estado === "error")
  const pendientes = lotes.filter((l) => l.estado === "pendiente")
  const suma = (ls: Lote[]) => ls.reduce((n, l) => n + l.registros.length, 0)
  return {
    total: suma(lotes),
    correctos: completados.reduce((n, l) => n + (l.procesados ?? 0), 0),
    enviadosCorrectos: suma(completados),
    fallidos: suma(fallidos),
    pendientes: suma(pendientes),
    lotesFallidos: fallidos.length,
    lotesPendientes: pendientes.length,
  }
}
