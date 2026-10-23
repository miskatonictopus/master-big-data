export type Ciudad = {
  id: string
  nombre: string
  latitud: number
  longitud: number
}

export type ConfigExtraccion = {
  ciudadIds: string[]
  inicio: string // YYYY-MM-DD
  fin: string // YYYY-MM-DD
}

export type EstadoExtraccion = "pendiente" | "en_curso" | "completada" | "error"

export type ExtraccionCiudad = {
  ciudadId: string
  estado: EstadoExtraccion
  url: string
  json?: unknown
  error?: string
  duracionMs?: number
  descargadoEn?: string
  intentos: number
}

/**
 * Fila resultante de convertir los arrays paralelos en registros.
 * Las mediciones se conservan tal cual llegaron (pueden ser null, cadenas,
 * o faltar): la limpieza decide si son válidas. Nunca se convierten a cero.
 */
export type FilaTransformada = {
  ciudad: string | null
  fecha_hora: string | null // ISO 8601 en UTC (sufijo Z) o null si no es válida
  fecha_original: unknown
  temperatura_c: unknown
  humedad_pct: unknown
  precipitacion_mm: unknown
  origen: { ciudadId: string; indice: number }
}

export type Registro = {
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
}

export type TipoRechazo = "calidad" | "duplicado"

export type Rechazo = {
  fila: FilaTransformada
  tipo: TipoRechazo
  motivos: string[]
}

export type TransformacionCiudad = {
  ciudadId: string
  filas: FilaTransformada[]
  avisos: string[]
  error?: string
}

export type CampoOrden =
  | "ciudad"
  | "fecha_hora"
  | "temperatura_c"
  | "humedad_pct"
  | "precipitacion_mm"

export type DireccionOrden = "asc" | "desc"

export type Orden = { campo: CampoOrden; direccion: DireccionOrden }
