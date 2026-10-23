import { describe, expect, it } from "vitest"

import { buscarCiudad } from "@/lib/etl/ciudades"
import { construirUrl, validarConfig, volumenPrevisto } from "@/lib/etl/extraccion"
import { parsearFechaHoraUtc } from "@/lib/etl/fechas"
import { limpiar } from "@/lib/etl/limpieza"
import { transformarCiudad } from "@/lib/etl/transformacion"
import {
  respuestaConDefectos,
  respuestaCorrecta,
  respuestaIncoherente,
  respuestaNoUtc,
} from "./fixtures/open-meteo"

const barcelona = buscarCiudad("barcelona")!

describe("extracción: petición y validación", () => {
  it("construye la URL con UTC, °C, mm y las tres variables", () => {
    const url = new URL(construirUrl(barcelona, "2026-09-01", "2026-09-01"))
    expect(url.origin + url.pathname).toBe(
      "https://archive-api.open-meteo.com/v1/archive"
    )
    expect(Object.fromEntries(url.searchParams)).toEqual({
      latitude: "41.3874",
      longitude: "2.1686",
      start_date: "2026-09-01",
      end_date: "2026-09-01",
      hourly: "temperature_2m,relative_humidity_2m,precipitation",
      timezone: "UTC",
      temperature_unit: "celsius",
      precipitation_unit: "mm",
    })
  })

  it("limita a 31 días y valida fechas", () => {
    const ok = { ciudadIds: ["madrid"], inicio: "2026-09-01", fin: "2026-09-30" }
    expect(validarConfig(ok)).toEqual([])
    expect(validarConfig({ ...ok, fin: "2026-10-01" })).toEqual([])
    expect(validarConfig({ ...ok, fin: "2026-10-02" })[0]).toMatch(/32 días/)
    expect(validarConfig({ ...ok, fin: "2026-08-31" })[0]).toMatch(/posterior/)
    expect(validarConfig({ ...ok, ciudadIds: [] })[0]).toMatch(/al menos una/)
    expect(validarConfig({ ...ok, inicio: "2026-02-30" })[0]).toMatch(/inicial no es válida/)
  })

  it("calcula el volumen previsto", () => {
    expect(
      volumenPrevisto({
        ciudadIds: ["madrid", "bilbao"],
        inicio: "2026-09-01",
        fin: "2026-09-30",
      })
    ).toEqual({ peticiones: 2, dias: 30, filas: 1440, valores: 4320 })
  })
})

describe("fechas", () => {
  it("interpreta las horas sin zona como UTC, independientemente de la zona local", () => {
    expect(process.env.TZ).toBe("America/New_York")
    expect(parsearFechaHoraUtc("2026-09-01T00:00")).toBe("2026-09-01T00:00:00.000Z")
    expect(parsearFechaHoraUtc("2026-09-01T23:00Z")).toBe("2026-09-01T23:00:00.000Z")
    // El formato que envía el cliente al servidor (toISOString) es idempotente.
    expect(parsearFechaHoraUtc("2026-09-01T23:00:00.000Z")).toBe("2026-09-01T23:00:00.000Z")
  })
  it("rechaza fechas imposibles, otros desplazamientos y tipos no texto", () => {
    expect(parsearFechaHoraUtc("2026-02-30T05:00")).toBeNull()
    expect(parsearFechaHoraUtc("2026-09-01T25:00")).toBeNull()
    expect(parsearFechaHoraUtc("2026-09-01T00:00+02:00")).toBeNull()
    expect(parsearFechaHoraUtc(1_756_684_800)).toBeNull()
    expect(parsearFechaHoraUtc(null)).toBeNull()
  })
})

describe("transformación de arrays paralelos", () => {
  it("convierte cada posición en una fila con los valores de la misma posición", () => {
    const t = transformarCiudad(barcelona, respuestaCorrecta)
    expect(t.error).toBeUndefined()
    expect(t.avisos).toEqual([])
    expect(
      t.filas.map((f) => ({
        ciudad: f.ciudad,
        fecha_hora: f.fecha_hora,
        temperatura_c: f.temperatura_c,
        humedad_pct: f.humedad_pct,
        precipitacion_mm: f.precipitacion_mm,
      }))
    ).toEqual([
      { ciudad: "Barcelona", fecha_hora: "2026-09-01T00:00:00.000Z", temperatura_c: 24.2, humedad_pct: 77, precipitacion_mm: 0 },
      { ciudad: "Barcelona", fecha_hora: "2026-09-01T01:00:00.000Z", temperatura_c: 23.6, humedad_pct: 80, precipitacion_mm: 0.4 },
      { ciudad: "Barcelona", fecha_hora: "2026-09-01T02:00:00.000Z", temperatura_c: 23.0, humedad_pct: 81, precipitacion_mm: 0 },
    ])
  })

  it("detecta longitudes incoherentes y deja como ausentes las posiciones que faltan", () => {
    const t = transformarCiudad(barcelona, respuestaIncoherente)
    expect(t.avisos.join(" ")).toMatch(/temperature_2m tiene 2 valores y time tiene 3/)
    expect(t.avisos.join(" ")).toMatch(/relative_humidity_2m tiene 4/)
    expect(t.filas).toHaveLength(3)
    expect(t.filas[2].temperatura_c).toBeUndefined()
    const { validos, rechazados } = limpiar(t.filas)
    expect(validos).toHaveLength(2)
    expect(rechazados[0].motivos).toEqual(["temperatura_c: valor ausente"])
  })

  it("rechaza la ciudad entera si la respuesta no está en UTC", () => {
    const t = transformarCiudad(barcelona, respuestaNoUtc)
    expect(t.error).toMatch(/no está en UTC/)
    expect(t.filas).toEqual([])
  })
})

describe("limpieza", () => {
  const filas = transformarCiudad(barcelona, respuestaConDefectos).filas
  const { validos, rechazados } = limpiar(filas)
  const motivoDe = (indice: number) =>
    rechazados.find((r) => r.fila.origen.indice === indice)

  it("no convierte null ni cadenas vacías en cero", () => {
    expect(filas[1].temperatura_c).toBeNull()
    expect(motivoDe(1)?.motivos).toEqual(["temperatura_c: valor nulo"])
    expect(motivoDe(2)?.motivos).toEqual(["humedad_pct: cadena vacía"])
    expect(motivoDe(6)?.motivos[0]).toMatch(/temperatura_c: tipo no numérico/)
    expect(validos.some((r) => r.temperatura_c === 0)).toBe(false)
  })

  it("valida rangos de humedad y precipitación y fechas", () => {
    expect(motivoDe(3)?.motivos).toEqual(["precipitacion_mm: negativa (-0.1)"])
    expect(motivoDe(4)?.motivos).toEqual(["humedad_pct: fuera de 0–100 (101)"])
    expect(motivoDe(5)?.motivos[0]).toMatch(/fecha_hora: no es una fecha válida/)
  })

  it("no descarta temperaturas extremas", () => {
    expect(validos.find((r) => r.temperatura_c === -45.5)).toBeDefined()
  })

  it("elimina duplicados conservando la primera aparición válida", () => {
    const dup = motivoDe(7)!
    expect(dup.tipo).toBe("duplicado")
    expect(dup.motivos[0]).toMatch(/se conserva la primera aparición \(posición 0/)
    const conservada = validos.find((r) => r.fecha_hora === "2026-09-01T00:00:00.000Z")
    expect(conservada?.temperatura_c).toBe(20) // la de la posición 0, no la 7 (99)
  })

  it("una fila defectuosa no desplaza a una válida con la misma clave", () => {
    // La posición 1 (temperatura null) y la 9 comparten clave; se conserva la 9.
    expect(motivoDe(9)).toBeUndefined()
    expect(validos.find((r) => r.fecha_hora === "2026-09-01T01:00:00.000Z")?.temperatura_c).toBe(18)
  })

  it("cuadra los totales", () => {
    expect(validos).toHaveLength(3) // posiciones 0, 8 y 9
    expect(rechazados).toHaveLength(7)
    expect(rechazados.filter((r) => r.tipo === "calidad")).toHaveLength(6)
    expect(validos.length + rechazados.length).toBe(filas.length)
  })

  it("rechaza filas sin ciudad", () => {
    const { rechazados } = limpiar([{ ...filas[0], ciudad: null }])
    expect(rechazados[0].motivos).toEqual(["ciudad: ausente"])
  })

  it("rechaza números no finitos", () => {
    const { rechazados } = limpiar([{ ...filas[0], temperatura_c: Number.NaN }])
    expect(rechazados[0].motivos).toEqual(["temperatura_c: número no finito (NaN)"])
  })
})
