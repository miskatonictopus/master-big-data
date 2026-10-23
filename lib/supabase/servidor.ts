import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"

export const TABLA_MEDICIONES = "mediciones_meteorologicas"

/**
 * La URL del proyecto no es secreta; se acepta la variable pública que ya
 * usan otros clientes. La clave secreta solo se lee aquí, en servidor, y
 * nunca lleva el prefijo NEXT_PUBLIC_ (que la incrustaría en el navegador).
 */
function leerEntorno() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const clave =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  return { url, clave }
}

export function variablesQueFaltan(): string[] {
  const { url, clave } = leerEntorno()
  const faltan: string[] = []
  if (!url) faltan.push("NEXT_PUBLIC_SUPABASE_URL")
  if (!clave) faltan.push("SUPABASE_SECRET_KEY")
  return faltan
}

let cliente: SupabaseClient | null = null

export function clienteAdmin(): SupabaseClient | null {
  const { url, clave } = leerEntorno()
  if (!url || !clave) return null
  cliente ??= createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  return cliente
}

export function respuestaSinConfigurar() {
  return Response.json(
    {
      error: `Supabase no está configurado. Faltan: ${variablesQueFaltan().join(", ")}.`,
    },
    { status: 503 }
  )
}

/** Normaliza el timestamptz devuelto por Postgres ("…+00:00") a ISO con Z. */
export function normalizarFecha(valor: string): string {
  return new Date(valor).toISOString()
}
