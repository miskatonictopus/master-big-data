import { describe, expect, it, vi } from "vitest"

import { crearLotes, ejecutarLotes, resumenLotes, type Lote } from "@/lib/etl/carga"
import {
  FILTROS_INICIALES,
  filtrarYOrdenar,
  interpretarFiltros,
  seleccionadasFueraDeFiltros,
  seleccionEfectiva,
  type Filtros,
} from "@/lib/etl/filtros"
import { claveRegistro } from "@/lib/etl/limpieza"
import type { Orden, Registro } from "@/lib/etl/types"

// Conjunto sintético de registros ya válidos: 3 ciudades × 48 horas.
function generar(): Registro[] {
  const ciudades = ["Madrid", "Bilbao", "Sevilla"]
  const registros: Registro[] = []
  for (const [c, ciudad] of ciudades.entries()) {
    for (let h = 0; h < 48; h++) {
      registros.push({
        ciudad,
        fecha_hora: new Date(Date.UTC(2026, 8, 1, h)).toISOString(),
        temperatura_c: 10 + c * 5 + (h % 24) / 2,
        humedad_pct: 40 + (h % 50),
        precipitacion_mm: h % 7 === 0 ? 1.2 : 0,
      })
    }
  }
  return registros
}

const validos = generar()
const filtrar = (f: Partial<Filtros>, orden: Orden = { campo: "fecha_hora", direccion: "asc" }) =>
  filtrarYOrdenar(validos, interpretarFiltros({ ...FILTROS_INICIALES, ...f }).filtros, orden).ordenados
const pagina = <T,>(filas: T[], n: number, tamano = 25) => filas.slice((n - 1) * tamano, n * tamano)

describe("filtros y ordenación antes de paginar", () => {
  it("ordena el conjunto completo y la página 1 contiene los máximos globales", () => {
    const ordenados = filtrar({}, { campo: "temperatura_c", direccion: "desc" })
    const maximo = Math.max(...validos.map((r) => r.temperatura_c))
    expect(pagina(ordenados, 1)[0].temperatura_c).toBe(maximo)
    // Todas las temperaturas de la página 1 ≥ todas las de la página 2.
    const min1 = Math.min(...pagina(ordenados, 1).map((r) => r.temperatura_c))
    const max2 = Math.max(...pagina(ordenados, 2).map((r) => r.temperatura_c))
    expect(min1).toBeGreaterThanOrEqual(max2)
  })

  it("aplica todos los filtros a la vez sobre todo el conjunto", () => {
    const r = filtrar({
      ciudades: ["Sevilla"],
      desde: "2026-09-01T06:00",
      hasta: "2026-09-02T06:00",
      soloLluvia: true,
    })
    expect(r.length).toBeGreaterThan(0)
    expect(
      r.every(
        (x) =>
          x.ciudad === "Sevilla" &&
          x.precipitacion_mm > 0 &&
          x.fecha_hora >= "2026-09-01T06:00:00.000Z" &&
          x.fecha_hora <= "2026-09-02T06:00:00.000Z"
      )
    ).toBe(true)
    // Coincide con un filtrado manual hecho por separado.
    expect(r.length).toBe(
      validos.filter(
        (x) =>
          x.ciudad === "Sevilla" &&
          x.precipitacion_mm > 0 &&
          x.fecha_hora >= "2026-09-01T06:00:00.000Z" &&
          x.fecha_hora <= "2026-09-02T06:00:00.000Z"
      ).length
    )
  })

  it("filtra por rangos de temperatura, humedad y precipitación (inclusivos)", () => {
    const r = filtrar({ temperaturaMin: "15", temperaturaMax: "20,5", humedadMin: "50", precipitacionMax: "0" })
    expect(r.every((x) => x.temperatura_c >= 15 && x.temperatura_c <= 20.5)).toBe(true)
    expect(r.every((x) => x.humedad_pct >= 50 && x.precipitacion_mm === 0)).toBe(true)
  })

  it("informa de valores no válidos sin aplicarlos", () => {
    const { errores, filtros } = interpretarFiltros({
      ...FILTROS_INICIALES,
      temperaturaMin: "abc",
      humedadMin: "80",
      humedadMax: "20",
    })
    expect(errores.temperaturaMin).toBeDefined()
    expect(errores.humedadMax).toMatch(/menor que el mínimo/)
    expect(filtros.temperaturaMin).toBeNull()
  })

  it("el orden es determinista en empates (ciudad, fecha)", () => {
    const a = filtrar({}, { campo: "precipitacion_mm", direccion: "desc" })
    const b = filtrar({}, { campo: "precipitacion_mm", direccion: "desc" })
    expect(a.map(claveRegistro)).toEqual(b.map(claveRegistro))
    expect(a[0]).toMatchObject({ ciudad: "Bilbao", precipitacion_mm: 1.2 })
  })
})

describe("selección entre páginas", () => {
  const ordenados = filtrar({}, { campo: "fecha_hora", direccion: "desc" })
  const p1 = pagina(ordenados, 1)
  const p4 = pagina(ordenados, 4)
  const seleccion = new Set([...p1.slice(0, 3), ...p4.slice(0, 2)].map(claveRegistro))

  it("la selección de varias páginas se conserva y sigue el orden elegido", () => {
    const efectivos = seleccionEfectiva(ordenados, seleccion)
    expect(efectivos).toHaveLength(5)
    expect(efectivos.map(claveRegistro)).toEqual(
      [...p1.slice(0, 3), ...p4.slice(0, 2)].map(claveRegistro)
    )
  })

  it("seleccionar todas las filtradas incluye las de otras páginas", () => {
    const filtrados = filtrar({ ciudades: ["Madrid"] })
    const todas = new Set(filtrados.map(claveRegistro))
    expect(seleccionEfectiva(filtrados, todas)).toHaveLength(48)
  })

  it("las filas seleccionadas que dejan de cumplir los filtros no se suben y se cuentan", () => {
    const soloMadrid = filtrar({ ciudades: ["Madrid"] }, { campo: "fecha_hora", direccion: "desc" })
    const efectivos = seleccionEfectiva(soloMadrid, seleccion)
    expect(efectivos.every((r) => r.ciudad === "Madrid")).toBe(true)
    expect(seleccionadasFueraDeFiltros(validos, soloMadrid, seleccion)).toBe(
      seleccion.size - efectivos.length
    )
  })

  it("cambiar los filtros no añade filas nuevas a la selección", () => {
    const antes = seleccionEfectiva(filtrar({ ciudades: ["Madrid"] }), seleccion).length
    const despues = seleccionEfectiva(filtrar({}), seleccion).length
    expect(despues).toBe(seleccion.size)
    expect(despues).toBeGreaterThanOrEqual(antes)
  })
})

/**
 * Simulación en memoria de una tabla con UNIQUE (ciudad, fecha_hora) y
 * upsert. Sirve para probar la lógica de lotes; NO sustituye la prueba de
 * integración contra Supabase.
 */
function tablaSimulada() {
  const filas = new Map<string, Registro>()
  return {
    filas,
    upsert: async (lote: Registro[]) => {
      for (const r of lote) filas.set(claveRegistro(r), r)
      return { procesados: lote.length }
    },
  }
}

describe("carga por lotes", () => {
  const registros = filtrar({}, { campo: "temperatura_c", direccion: "asc" }) // 144 filas
  const muchos = Array.from({ length: 1234 }, (_, i) => ({
    ...registros[0],
    fecha_hora: new Date(Date.UTC(2020, 0, 1, i)).toISOString(),
  }))

  it("divide en lotes de 500 como máximo", () => {
    expect(crearLotes(muchos).map((l) => l.registros.length)).toEqual([500, 500, 234])
  })

  it("envía exactamente la vista previa, en el mismo orden", async () => {
    const enviados: Registro[] = []
    await ejecutarLotes(crearLotes(muchos), async (l) => {
      enviados.push(...l)
      return { procesados: l.length }
    }, () => {})
    expect(enviados).toEqual(muchos)
  })

  it("una segunda carga no duplica filas (upsert por clave)", async () => {
    const tabla = tablaSimulada()
    await ejecutarLotes(crearLotes(registros), tabla.upsert, () => {})
    await ejecutarLotes(crearLotes(registros), tabla.upsert, () => {})
    expect(tabla.filas.size).toBe(registros.length)
  })

  it("ante un fallo parcial conserva los lotes anteriores y reintenta solo lo pendiente", async () => {
    const tabla = tablaSimulada()
    const enviar = vi
      .fn()
      .mockImplementationOnce(tabla.upsert)
      .mockRejectedValueOnce(new Error("Supabase rechazó el lote: timeout"))
      .mockImplementation(tabla.upsert)
    const estados: Lote["estado"][][] = []
    const tras1 = await ejecutarLotes(crearLotes(muchos), enviar, (ls) =>
      estados.push(ls.map((l) => l.estado))
    )
    expect(tras1.map((l) => l.estado)).toEqual(["completado", "error", "pendiente"])
    expect(tras1[1].error).toMatch(/timeout/)
    expect(resumenLotes(tras1)).toMatchObject({ correctos: 500, fallidos: 500, pendientes: 234 })
    expect(estados).toContainEqual(["completado", "en_curso", "pendiente"])

    const tras2 = await ejecutarLotes(tras1, enviar, () => {})
    expect(tras2.map((l) => l.estado)).toEqual(["completado", "completado", "completado"])
    expect(tras2.map((l) => l.intentos)).toEqual([1, 2, 1])
    // 4 llamadas: lote 1, lote 2 (falla), lote 2 (reintento), lote 3.
    expect(enviar).toHaveBeenCalledTimes(4)
    expect(enviar.mock.calls[2][0]).toBe(tras1[1].registros)
    expect(tabla.filas.size).toBe(muchos.length)
  })

  it("la copia congelada no cambia aunque cambie el conjunto original", async () => {
    const origen = registros.slice(0, 10)
    const congelados = origen.map((r) => ({ ...r }))
    const lotes = crearLotes(congelados)
    origen.length = 0 // p. ej. el usuario cambia los filtros durante la carga
    const enviados: Registro[] = []
    await ejecutarLotes(lotes, async (l) => {
      enviados.push(...l)
      return { procesados: l.length }
    }, () => {})
    expect(enviados).toHaveLength(10)
  })
})
