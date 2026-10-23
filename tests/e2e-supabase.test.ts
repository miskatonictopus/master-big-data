// Prueba de extremo a extremo contra la aplicación en marcha y un Supabase
// REAL (normalmente el local de `supabase start`). Solo se ejecuta si se
// define E2E_URL, p. ej.:
//
//   E2E_URL=http://localhost:3000 E2E_DB_CONTAINER=supabase_db_complete_stack npm test
//
// ¡Escribe en la tabla! No la lances contra un proyecto de producción.
// E2E_DB_CONTAINER (opcional) permite provocar un fallo real de un lote
// retirando temporalmente el permiso INSERT en la base de datos.
import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

import { CIUDADES } from "@/lib/etl/ciudades"
import { crearLotes, ejecutarLotes, resumenLotes } from "@/lib/etl/carga"
import { construirUrl, descargarCiudad } from "@/lib/etl/extraccion"
import {
  FILTROS_INICIALES,
  filtrarYOrdenar,
  interpretarFiltros,
  seleccionEfectiva,
} from "@/lib/etl/filtros"
import { claveRegistro, limpiar } from "@/lib/etl/limpieza"
import { transformarCiudad } from "@/lib/etl/transformacion"
import type { Registro } from "@/lib/etl/types"

const URL_APP = process.env.E2E_URL
const CONTENEDOR = process.env.E2E_DB_CONTAINER

function sql(consulta: string): string {
  return execFileSync(
    "docker",
    ["exec", CONTENEDOR!, "psql", "-U", "postgres", "-tAc", consulta],
    { encoding: "utf8" }
  ).trim()
}

async function enviar(registros: Registro[]) {
  const r = await fetch(`${URL_APP}/api/carga`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registros }),
  })
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo.error)
  return { procesados: cuerpo.procesados as number }
}

async function verificar(registros: Registro[]) {
  const r = await fetch(`${URL_APP}/api/verificar`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      claves: registros.map(({ ciudad, fecha_hora }) => ({ ciudad, fecha_hora })),
    }),
  })
  const cuerpo = await r.json()
  if (!r.ok) throw new Error(cuerpo.error)
  return new Set<string>(cuerpo.encontradas)
}

async function totalEnDestino(ciudad: string) {
  const r = await fetch(`${URL_APP}/api/mediciones?ciudad=${ciudad}&tamano=25`)
  return (await r.json()).total as number
}

describe.skipIf(!URL_APP)("E2E: Open-Meteo → app → Supabase", () => {
  it("carga la selección exacta, sin duplicados y recuperándose de un fallo parcial", async () => {
    // Extracción real: 2 ciudades × 31 días = 1.488 filas → 3 lotes.
    const ciudades = CIUDADES.filter((c) => ["sevilla", "valencia"].includes(c.id))
    const filas = []
    for (const c of ciudades) {
      const json = await descargarCiudad(construirUrl(c, "2026-08-01", "2026-08-31"))
      filas.push(...transformarCiudad(c, json).filas)
    }
    expect(filas).toHaveLength(2 * 31 * 24)
    const { validos } = limpiar(filas)

    // Filtros → ordenación → selección de todas las filtradas (todas las páginas).
    const { ordenados } = filtrarYOrdenar(
      validos,
      interpretarFiltros({ ...FILTROS_INICIALES, humedadMin: "0" }).filtros,
      { campo: "temperatura_c", direccion: "desc" }
    )
    const efectivos = seleccionEfectiva(ordenados, new Set(ordenados.map(claveRegistro)))
    const vistaPrevia = efectivos.map((r) => ({ ...r }))
    expect(vistaPrevia.length).toBeGreaterThan(1000)

    if (CONTENEDOR) {
      sql("delete from mediciones_meteorologicas where ciudad in ('Sevilla','Valencia')")
    }

    // Primera carga con fallo real en el lote 2.
    const enviados: Registro[] = []
    let llamada = 0
    const enviarConFallo = async (lote: Registro[]) => {
      llamada++
      if (CONTENEDOR && llamada === 2) {
        sql("revoke insert on mediciones_meteorologicas from service_role")
      }
      try {
        const r = await enviar(lote)
        enviados.push(...lote)
        return r
      } finally {
        if (CONTENEDOR && llamada === 2) {
          sql("grant insert on mediciones_meteorologicas to service_role")
        }
      }
    }
    let lotes = await ejecutarLotes(crearLotes(vistaPrevia), enviarConFallo, () => {})
    if (CONTENEDOR) {
      expect(lotes.map((l) => l.estado)).toEqual(["completado", "error", "pendiente"])
      expect(lotes[1].error).toMatch(/permission denied/)
      expect(resumenLotes(lotes).correctos).toBe(500)
      // Reintento: solo se envían el lote fallido y el pendiente.
      lotes = await ejecutarLotes(lotes, enviarConFallo, () => {})
    }
    expect(lotes.every((l) => l.estado === "completado")).toBe(true)
    expect(resumenLotes(lotes).correctos).toBe(vistaPrevia.length)

    // Lo enviado coincide exactamente con la vista previa y su orden.
    expect(enviados).toEqual(vistaPrevia)

    // Verificación en destino de todas las claves.
    const encontradas = new Set<string>()
    for (const l of crearLotes(vistaPrevia)) {
      for (const k of await verificar(l.registros)) encontradas.add(k)
    }
    expect(vistaPrevia.every((r) => encontradas.has(claveRegistro(r)))).toBe(true)

    const antes = (await totalEnDestino("Sevilla")) + (await totalEnDestino("Valencia"))
    expect(antes).toBe(vistaPrevia.length)

    // Segunda carga completa: upsert, ninguna fila nueva.
    const segunda = await ejecutarLotes(crearLotes(vistaPrevia), enviar, () => {})
    expect(segunda.every((l) => l.estado === "completado")).toBe(true)
    const despues = (await totalEnDestino("Sevilla")) + (await totalEnDestino("Valencia"))
    expect(despues).toBe(antes)
  }, 120_000)

  it("el servidor rechaza lotes inválidos aunque el cliente se salte la limpieza", async () => {
    const malo = {
      ciudad: "Sevilla",
      fecha_hora: "2026-08-01T00:00:00.000Z",
      temperatura_c: null,
      humedad_pct: 50,
      precipitacion_mm: 0,
    }
    const r = await fetch(`${URL_APP}/api/carga`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ registros: [malo] }),
    })
    expect(r.status).toBe(400)
    expect((await r.json()).error).toMatch(/valor nulo/)

    const grande = await fetch(`${URL_APP}/api/carga`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "x".repeat(300 * 1024),
    })
    expect(grande.status).toBe(413)
  })
})
