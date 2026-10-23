import { dividirEnLotes } from "@/lib/etl/carga"
import { claveRegistro } from "@/lib/etl/limpieza"
import {
  leerJsonLimitado,
  validarLoteClaves,
} from "@/lib/etl/validacion-servidor"
import {
  TABLA_MEDICIONES,
  clienteAdmin,
  normalizarFecha,
  respuestaSinConfigurar,
} from "@/lib/supabase/servidor"

// Cada consulta va en la URL de PostgREST; 100 fechas por consulta la
// mantiene corta.
const FECHAS_POR_CONSULTA = 100

export async function POST(request: Request) {
  const supabase = clienteAdmin()
  if (!supabase) return respuestaSinConfigurar()

  const cuerpo = await leerJsonLimitado(request)
  if (!cuerpo.ok) {
    return Response.json(
      { error: cuerpo.error },
      { status: cuerpo.status ?? 400 }
    )
  }

  const claves = validarLoteClaves(cuerpo.valor)
  if (!claves.ok) return Response.json({ error: claves.error }, { status: 400 })

  const porCiudad = new Map<string, string[]>()
  for (const { ciudad, fecha_hora } of claves.valor) {
    porCiudad.set(ciudad, [...(porCiudad.get(ciudad) ?? []), fecha_hora])
  }

  const encontradas: string[] = []
  for (const [ciudad, fechas] of porCiudad) {
    for (const grupo of dividirEnLotes(fechas, FECHAS_POR_CONSULTA)) {
      const { data, error } = await supabase
        .from(TABLA_MEDICIONES)
        .select("ciudad, fecha_hora")
        .eq("ciudad", ciudad)
        .in("fecha_hora", grupo)
      if (error) {
        return Response.json(
          { error: `No se pudo verificar: ${error.message}` },
          { status: 502 }
        )
      }
      for (const fila of data) {
        encontradas.push(
          claveRegistro({
            ciudad: fila.ciudad,
            fecha_hora: normalizarFecha(fila.fecha_hora),
          })
        )
      }
    }
  }

  return Response.json({ encontradas })
}
