import { describe, expect, it } from "vitest"

import {
  leerJsonLimitado,
  MAX_BYTES_PETICION,
  validarLoteCarga,
  validarLoteClaves,
} from "@/lib/etl/validacion-servidor"

const ok = {
  ciudad: "Madrid",
  fecha_hora: "2026-09-01T00:00:00.000Z",
  temperatura_c: 21.5,
  humedad_pct: 40,
  precipitacion_mm: 0,
}

const error = (cuerpo: unknown) => {
  const r = validarLoteCarga(cuerpo)
  return r.ok ? null : r.error
}

describe("validación en servidor de los lotes", () => {
  it("acepta un lote correcto", () => {
    expect(validarLoteCarga({ registros: [ok] })).toEqual({ ok: true, valor: [ok] })
  })

  it("rechaza estructuras incorrectas y lotes grandes", () => {
    expect(error({})).toMatch(/array "registros"/)
    expect(error({ registros: [] })).toMatch(/vacío/)
    const grande = Array.from({ length: 501 }, (_, i) => ({
      ...ok,
      fecha_hora: new Date(Date.UTC(2026, 0, 1, i)).toISOString(),
    }))
    expect(error({ registros: grande })).toMatch(/Como máximo 500/)
  })

  it("vuelve a aplicar las reglas de calidad", () => {
    expect(error({ registros: [{ ...ok, temperatura_c: null }] })).toMatch(/valor nulo/)
    expect(error({ registros: [{ ...ok, humedad_pct: "40" }] })).toMatch(/tipo no numérico/)
    expect(error({ registros: [{ ...ok, humedad_pct: 120 }] })).toMatch(/0–100/)
    expect(error({ registros: [{ ...ok, precipitacion_mm: -1 }] })).toMatch(/negativa/)
    expect(error({ registros: [{ ...ok, ciudad: "Toledo" }] })).toMatch(/ciudad no permitida/)
    expect(error({ registros: [{ ...ok, fecha_hora: "2026-09-01T00:00" }] })).toMatch(/UTC/)
    expect(error({ registros: [{ ...ok, id: 3 }] })).toMatch(/campos no permitidos/)
    expect(error({ registros: [ok, ok] })).toMatch(/clave repetida/)
  })

  it("valida las claves de verificación", () => {
    expect(validarLoteClaves({ claves: [{ ciudad: "Bilbao", fecha_hora: ok.fecha_hora }] }).ok).toBe(true)
    expect(validarLoteClaves({ claves: [{ ciudad: "Bilbao" }] }).ok).toBe(false)
  })
})

describe("límite de tamaño de la petición", () => {
  const peticion = (cuerpo: string, cabeceras: Record<string, string> = {}) =>
    new Request("http://local/api/carga", { method: "POST", body: cuerpo, headers: cabeceras })

  it("lee JSON válido", async () => {
    expect(await leerJsonLimitado(peticion('{"a":1}'))).toEqual({ ok: true, valor: { a: 1 } })
  })

  it("rechaza cuerpos más grandes que el límite aunque no declaren Content-Length", async () => {
    const r = await leerJsonLimitado(peticion("x".repeat(MAX_BYTES_PETICION + 1)))
    expect(r).toMatchObject({ ok: false, status: 413 })
  })

  it("rechaza JSON mal formado con 400", async () => {
    const r = await leerJsonLimitado(peticion("{"))
    expect(r.ok).toBe(false)
    expect(r.ok === false && r.status).toBeUndefined()
  })
})
