import type { NextRequest } from "next/server"

import { NOMBRES_CIUDADES } from "@/lib/etl/ciudades"
import { parsearFechaHoraUtc } from "@/lib/etl/fechas"
import {
  TABLA_MEDICIONES,
  clienteAdmin,
  normalizarFecha,
  respuestaSinConfigurar,
} from "@/lib/supabase/servidor"

const CAMPOS_ORDEN = [
  "ciudad",
  "fecha_hora",
  "temperatura_c",
  "humedad_pct",
  "precipitacion_mm",
  "importado_en",
]
const TAMANOS = [25, 50, 100]

export async function GET(request: NextRequest) {
  const supabase = clienteAdmin()
  if (!supabase) return respuestaSinConfigurar()

  const p = request.nextUrl.searchParams
  const ciudad = p.get("ciudad") || null
  const desde = p.get("desde") || null
  const hasta = p.get("hasta") || null
  const orden = p.get("orden") ?? "fecha_hora"
  const ascendente = p.get("dir") !== "desc"
  const tamano = Number(p.get("tamano") ?? 25)
  const pagina = Number(p.get("pagina") ?? 1)

  if (ciudad && !NOMBRES_CIUDADES.includes(ciudad)) {
    return Response.json({ error: "Ciudad no válida." }, { status: 400 })
  }
  const desdeIso = desde ? parsearFechaHoraUtc(desde) : null
  const hastaIso = hasta ? parsearFechaHoraUtc(hasta) : null
  if ((desde && !desdeIso) || (hasta && !hastaIso)) {
    return Response.json({ error: "Fechas no válidas." }, { status: 400 })
  }
  if (!CAMPOS_ORDEN.includes(orden)) {
    return Response.json({ error: "Campo de orden no válido." }, { status: 400 })
  }
  if (!TAMANOS.includes(tamano) || !Number.isInteger(pagina) || pagina < 1) {
    return Response.json({ error: "Paginación no válida." }, { status: 400 })
  }

  let consulta = supabase
    .from(TABLA_MEDICIONES)
    .select(
      "id, ciudad, fecha_hora, temperatura_c, humedad_pct, precipitacion_mm, importado_en",
      { count: "exact" }
    )
  if (ciudad) consulta = consulta.eq("ciudad", ciudad)
  if (desdeIso) consulta = consulta.gte("fecha_hora", desdeIso)
  if (hastaIso) consulta = consulta.lte("fecha_hora", hastaIso)

  // Sin ORDER BY la base de datos no garantiza ningún orden; el desempate
  // por id hace que la paginación sea estable.
  const inicio = (pagina - 1) * tamano
  const { data, error, count } = await consulta
    .order(orden, { ascending: ascendente })
    .order("id", { ascending: true })
    .range(inicio, inicio + tamano - 1)

  if (error) {
    return Response.json(
      { error: `No se pudo leer la tabla: ${error.message}` },
      { status: 502 }
    )
  }

  return Response.json({
    total: count ?? 0,
    filas: data.map((f) => ({
      ...f,
      fecha_hora: normalizarFecha(f.fecha_hora),
      importado_en: normalizarFecha(f.importado_en),
    })),
  })
}
