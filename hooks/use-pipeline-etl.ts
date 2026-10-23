"use client"

import * as React from "react"

import { CIUDADES, buscarCiudad } from "@/lib/etl/ciudades"
import {
  crearLotes,
  dividirEnLotes,
  ejecutarLotes,
  TAMANO_LOTE,
  type Lote,
} from "@/lib/etl/carga"
import {
  construirUrl,
  descargarCiudad,
  validarConfig,
} from "@/lib/etl/extraccion"
import {
  FILTROS_INICIALES,
  filtrarYOrdenar,
  interpretarFiltros,
  ORDEN_INICIAL,
  seleccionadasFueraDeFiltros,
  seleccionEfectiva,
  type Filtros,
} from "@/lib/etl/filtros"
import { claveRegistro, limpiar, type ResultadoLimpieza } from "@/lib/etl/limpieza"
import { transformarCiudad } from "@/lib/etl/transformacion"
import type {
  ConfigExtraccion,
  ExtraccionCiudad,
  FilaTransformada,
  Orden,
  Registro,
  TransformacionCiudad,
} from "@/lib/etl/types"

export const CONFIG_INICIAL: ConfigExtraccion = {
  ciudadIds: CIUDADES.map((c) => c.id),
  inicio: "2026-09-01",
  fin: "2026-09-30",
}

export type Procesado = {
  transformaciones: TransformacionCiudad[]
  filas: FilaTransformada[]
  duracionTransformacionMs: number
  limpieza: ResultadoLimpieza
  duracionLimpiezaMs: number
}

export type Verificacion =
  | { estado: "ok"; comprobadas: number; encontradas: number; faltantes: Registro[] }
  | { estado: "error"; error: string }

export type Carga = {
  registros: Registro[] // copia congelada, en el orden elegido
  lotes: Lote[]
  estado: "en_curso" | "verificando" | "terminada"
  duracionMs: number
  verificacion: Verificacion | null
}

export type EstadoSupabase = {
  configurado: boolean
  faltan: string[]
  tabla: { disponible: boolean; filas?: number; error?: string } | null
}

async function leerError(respuesta: Response): Promise<string> {
  try {
    const cuerpo = await respuesta.json()
    if (cuerpo?.error) return String(cuerpo.error)
  } catch {
    // cuerpo no JSON
  }
  return `El servidor respondió ${respuesta.status}.`
}

async function enviarLote(registros: Registro[]) {
  const respuesta = await fetch("/api/carga", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ registros }),
  })
  if (!respuesta.ok) throw new Error(await leerError(respuesta))
  const cuerpo = (await respuesta.json()) as { procesados: number }
  return { procesados: cuerpo.procesados }
}

async function verificarEnDestino(registros: Registro[]): Promise<Verificacion> {
  const encontradas = new Set<string>()
  try {
    for (const grupo of dividirEnLotes(registros, TAMANO_LOTE)) {
      const respuesta = await fetch("/api/verificar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          claves: grupo.map(({ ciudad, fecha_hora }) => ({ ciudad, fecha_hora })),
        }),
      })
      if (!respuesta.ok) throw new Error(await leerError(respuesta))
      const cuerpo = (await respuesta.json()) as { encontradas: string[] }
      cuerpo.encontradas.forEach((k) => encontradas.add(k))
    }
  } catch (e) {
    return { estado: "error", error: e instanceof Error ? e.message : String(e) }
  }
  const faltantes = registros.filter((r) => !encontradas.has(claveRegistro(r)))
  return {
    estado: "ok",
    comprobadas: registros.length,
    encontradas: registros.length - faltantes.length,
    faltantes,
  }
}

function procesar(extracciones: ExtraccionCiudad[]): Procesado | null {
  const completadas = extracciones.filter((e) => e.estado === "completada")
  if (completadas.length === 0) return null

  const t0 = performance.now()
  const transformaciones = completadas.map((e) =>
    transformarCiudad(buscarCiudad(e.ciudadId)!, e.json)
  )
  const filas = transformaciones.flatMap((t) => t.filas)
  const t1 = performance.now()
  const limpieza = limpiar(filas)
  const t2 = performance.now()

  return {
    transformaciones,
    filas,
    duracionTransformacionMs: t1 - t0,
    limpieza,
    duracionLimpiezaMs: t2 - t1,
  }
}

export function usePipelineEtl() {
  const [config, setConfig] = React.useState(CONFIG_INICIAL)
  const [configExtraida, setConfigExtraida] =
    React.useState<ConfigExtraccion | null>(null)
  const [extracciones, setExtracciones] = React.useState<ExtraccionCiudad[]>([])
  const [extrayendo, setExtrayendo] = React.useState(false)
  const [duracionExtraccionMs, setDuracionExtraccionMs] = React.useState<
    number | null
  >(null)
  const [procesado, setProcesado] = React.useState<Procesado | null>(null)

  const [filtros, setFiltros] = React.useState<Filtros>(FILTROS_INICIALES)
  const [orden, setOrden] = React.useState<Orden>(ORDEN_INICIAL)
  const [seleccion, setSeleccion] = React.useState<ReadonlySet<string>>(
    () => new Set()
  )

  const [carga, setCarga] = React.useState<Carga | null>(null)
  const [estadoSupabase, setEstadoSupabase] =
    React.useState<EstadoSupabase | null>(null)

  // Las referencias evitan dobles envíos aunque React aún no haya re-renderizado.
  const extraccionesRef = React.useRef<ExtraccionCiudad[]>([])
  const extrayendoRef = React.useRef(false)
  const cargandoRef = React.useRef(false)

  const refrescarEstadoSupabase = React.useCallback(async () => {
    try {
      const r = await fetch("/api/estado", { cache: "no-store" })
      setEstadoSupabase(await r.json())
    } catch {
      setEstadoSupabase({
        configurado: false,
        faltan: [],
        tabla: { disponible: false, error: "No se pudo consultar el servidor." },
      })
    }
  }, [])

  React.useEffect(() => {
    // Sincroniza con un sistema externo (el servidor) al montar.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refrescarEstadoSupabase()
  }, [refrescarEstadoSupabase])

  const publicarExtracciones = (lista: ExtraccionCiudad[]) => {
    extraccionesRef.current = lista
    setExtracciones(lista)
  }

  const descargarEn = async (
    lista: ExtraccionCiudad[],
    ciudadId: string
  ): Promise<ExtraccionCiudad[]> => {
    const previa = lista.find((e) => e.ciudadId === ciudadId)!
    let actual = lista.map((e) =>
      e.ciudadId === ciudadId
        ? { ...e, estado: "en_curso" as const, error: undefined }
        : e
    )
    publicarExtracciones(actual)
    const t0 = performance.now()
    let cambios: Partial<ExtraccionCiudad>
    try {
      const json = await descargarCiudad(previa.url)
      cambios = {
        estado: "completada",
        json,
        descargadoEn: new Date().toISOString(),
      }
    } catch (e) {
      // Un reintento fallido no borra un JSON válido anterior: no hay
      // ninguno, porque solo se reintentan ciudades con error.
      cambios = {
        estado: "error",
        json: undefined,
        error: e instanceof Error ? e.message : String(e),
      }
    }
    actual = actual.map((e) =>
      e.ciudadId === ciudadId
        ? {
            ...e,
            ...cambios,
            intentos: e.intentos + 1,
            duracionMs: performance.now() - t0,
          }
        : e
    )
    publicarExtracciones(actual)
    return actual
  }

  const extraer = async () => {
    if (extrayendoRef.current) return
    if (validarConfig(config).length > 0) return

    extrayendoRef.current = true
    setExtrayendo(true)
    // Orden canónico de ciudades: hace reproducible la regla de duplicados.
    const instantanea: ConfigExtraccion = {
      ...config,
      ciudadIds: CIUDADES.filter((c) => config.ciudadIds.includes(c.id)).map(
        (c) => c.id
      ),
    }
    setConfigExtraida(instantanea)
    setProcesado(null)
    setSeleccion(new Set())
    setDuracionExtraccionMs(null)

    let lista: ExtraccionCiudad[] = instantanea.ciudadIds.map((id) => ({
      ciudadId: id,
      estado: "pendiente",
      url: construirUrl(buscarCiudad(id)!, instantanea.inicio, instantanea.fin),
      intentos: 0,
    }))
    publicarExtracciones(lista)

    const t0 = performance.now()
    for (const { ciudadId } of lista) {
      lista = await descargarEn(lista, ciudadId)
    }
    setDuracionExtraccionMs(performance.now() - t0)
    setProcesado(procesar(lista))
    extrayendoRef.current = false
    setExtrayendo(false)
  }

  /**
   * Repite la descarga de una ciudad con la configuración original. El JSON
   * sustituye al anterior y todo el pipeline se recalcula desde los JSON
   * guardados, así que no pueden aparecer filas duplicadas.
   */
  const reintentarCiudad = async (ciudadId: string) => {
    if (extrayendoRef.current) return
    extrayendoRef.current = true
    setExtrayendo(true)
    const t0 = performance.now()
    const lista = await descargarEn(extraccionesRef.current, ciudadId)
    setDuracionExtraccionMs(performance.now() - t0)
    setProcesado(procesar(lista))
    extrayendoRef.current = false
    setExtrayendo(false)
  }

  // datos válidos → filtros → ordenación → selección
  const validos = React.useMemo(
    () => procesado?.limpieza.validos ?? [],
    [procesado]
  )
  const { filtros: filtrosInterpretados, errores: erroresFiltros } =
    React.useMemo(() => interpretarFiltros(filtros), [filtros])

  const filtrado = React.useMemo(
    () => filtrarYOrdenar(validos, filtrosInterpretados, orden),
    [validos, filtrosInterpretados, orden]
  )

  const efectivos = React.useMemo(
    () => seleccionEfectiva(filtrado.ordenados, seleccion),
    [filtrado.ordenados, seleccion]
  )
  const fueraDeFiltros = React.useMemo(
    () => seleccionadasFueraDeFiltros(validos, filtrado.ordenados, seleccion),
    [validos, filtrado.ordenados, seleccion]
  )

  const alternarSeleccion = (claves: string[], seleccionar: boolean) => {
    setSeleccion((previa) => {
      const nueva = new Set(previa)
      for (const k of claves) {
        if (seleccionar) nueva.add(k)
        else nueva.delete(k)
      }
      return nueva
    })
  }
  const seleccionarFiltrados = () =>
    alternarSeleccion(filtrado.ordenados.map(claveRegistro), true)
  const vaciarSeleccion = () => setSeleccion(new Set())
  const restablecerFiltros = () => {
    setFiltros(FILTROS_INICIALES)
    setOrden(ORDEN_INICIAL)
  }

  const ejecutarCarga = async (inicial: Carga) => {
    setCarga(inicial)
    const t0 = performance.now()
    const lotes = await ejecutarLotes(inicial.lotes, enviarLote, (ls) =>
      setCarga((c) => (c ? { ...c, lotes: ls } : c))
    )
    setCarga((c) => (c ? { ...c, estado: "verificando" } : c))
    const enviados = lotes
      .filter((l) => l.estado === "completado")
      .flatMap((l) => l.registros)
    const verificacion =
      enviados.length > 0 ? await verificarEnDestino(enviados) : null
    const duracion = performance.now() - t0
    setCarga((c) =>
      c
        ? {
            ...c,
            estado: "terminada",
            duracionMs: c.duracionMs + duracion,
            verificacion,
          }
        : c
    )
    cargandoRef.current = false
    void refrescarEstadoSupabase()
  }

  const subir = async () => {
    if (cargandoRef.current || efectivos.length === 0) return
    cargandoRef.current = true
    // Copia congelada: cambiar filtros o selección después no la altera.
    const registros = efectivos.map((r) => ({ ...r }))
    await ejecutarCarga({
      registros,
      lotes: crearLotes(registros),
      estado: "en_curso",
      duracionMs: 0,
      verificacion: null,
    })
  }

  const reintentarCarga = async () => {
    if (cargandoRef.current || !carga) return
    cargandoRef.current = true
    await ejecutarCarga({ ...carga, estado: "en_curso", verificacion: null })
  }

  return {
    config,
    setConfig,
    configExtraida,
    extracciones,
    extrayendo,
    duracionExtraccionMs,
    extraer,
    reintentarCiudad,
    procesado,
    validos,
    filtros,
    setFiltros,
    erroresFiltros,
    orden,
    setOrden,
    filtrados: filtrado.ordenados,
    duracionFiltradoMs: filtrado.duracionMs,
    seleccion,
    efectivos,
    fueraDeFiltros,
    alternarSeleccion,
    seleccionarFiltrados,
    vaciarSeleccion,
    restablecerFiltros,
    carga,
    subir,
    reintentarCarga,
    estadoSupabase,
    refrescarEstadoSupabase,
  }
}

export type PipelineEtl = ReturnType<typeof usePipelineEtl>
