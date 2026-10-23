// Prueba de integración contra la API REAL de Open-Meteo (requiere red).
// Se omite con SIN_RED=1.
import { describe, expect, it } from "vitest"

import { buscarCiudad } from "@/lib/etl/ciudades"
import { construirUrl, descargarCiudad } from "@/lib/etl/extraccion"
import { limpiar } from "@/lib/etl/limpieza"
import { transformarCiudad } from "@/lib/etl/transformacion"

describe.skipIf(process.env.SIN_RED === "1")("Open-Meteo real", () => {
  it("una ciudad durante un día devuelve 24 registros horarios en UTC", async () => {
    const bilbao = buscarCiudad("bilbao")!
    const json = await descargarCiudad(construirUrl(bilbao, "2026-09-15", "2026-09-15"))
    expect(json).toMatchObject({
      utc_offset_seconds: 0,
      hourly_units: { temperature_2m: "°C", relative_humidity_2m: "%", precipitation: "mm" },
    })

    const t = transformarCiudad(bilbao, json)
    expect(t.error).toBeUndefined()
    expect(t.avisos).toEqual([])
    expect(t.filas).toHaveLength(24)
    expect(t.filas[0].fecha_hora).toBe("2026-09-15T00:00:00.000Z")
    expect(t.filas[23].fecha_hora).toBe("2026-09-15T23:00:00.000Z")

    const { validos, rechazados } = limpiar(t.filas)
    expect(validos.length + rechazados.length).toBe(24)
    expect(new Set(validos.map((r) => r.fecha_hora)).size).toBe(validos.length)
  }, 30_000)

  it("traduce los errores de la API a un mensaje legible", async () => {
    const madrid = buscarCiudad("madrid")!
    await expect(
      descargarCiudad(construirUrl(madrid, "2026-09-10", "2026-09-01"))
    ).rejects.toThrow(/Open-Meteo respondió 400/)
  }, 30_000)
})
