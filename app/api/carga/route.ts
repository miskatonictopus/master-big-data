import {
  leerJsonLimitado,
  validarLoteCarga,
} from "@/lib/etl/validacion-servidor"
import {
  TABLA_MEDICIONES,
  clienteAdmin,
  respuestaSinConfigurar,
} from "@/lib/supabase/servidor"

// AVISO: este proyecto no tiene autenticación. El endpoint escribe con la
// clave secreta, así que solo debe usarse en desarrollo local. Antes de
// publicarlo hay que protegerlo (sesión de usuario, rol, etc.).
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

  const lote = validarLoteCarga(cuerpo.valor)
  if (!lote.ok) return Response.json({ error: lote.error }, { status: 400 })

  const { data, error } = await supabase
    .from(TABLA_MEDICIONES)
    .upsert(lote.valor, { onConflict: "ciudad,fecha_hora" })
    .select("ciudad, fecha_hora")

  if (error) {
    return Response.json(
      { error: `Supabase rechazó el lote: ${error.message}` },
      { status: 502 }
    )
  }

  // El upsert devuelve las filas afectadas, pero no distingue cuáles se
  // insertaron y cuáles se actualizaron, así que solo informamos del total.
  return Response.json({ procesados: data?.length ?? 0 })
}
