import {
  TABLA_MEDICIONES,
  clienteAdmin,
  variablesQueFaltan,
} from "@/lib/supabase/servidor"

export async function GET() {
  const supabase = clienteAdmin()
  if (!supabase) {
    return Response.json({
      configurado: false,
      faltan: variablesQueFaltan(),
      tabla: null,
    })
  }
  const { error, count } = await supabase
    .from(TABLA_MEDICIONES)
    .select("id", { count: "exact", head: true })
  return Response.json({
    configurado: true,
    faltan: [],
    tabla: error
      ? { disponible: false, error: error.message || "No se pudo leer la tabla." }
      : { disponible: true, filas: count ?? 0 },
  })
}
