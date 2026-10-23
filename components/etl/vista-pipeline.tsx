"use client"

import * as React from "react"
import {
  ArrowDownIcon,
  ArrowRightIcon,
  BroomIcon,
  CloudArrowDownIcon,
  DatabaseIcon,
  FunnelIcon,
  TableIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { buscarCiudad } from "@/lib/etl/ciudades"
import { resumenLotes } from "@/lib/etl/carga"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { EstadoBadge, fmt, fmtDuracion, type EstadoFase } from "./comun"

export type PestanaId =
  | "json"
  | "transformados"
  | "validos"
  | "rechazados"
  | "carga"
  | "supabase"

type Fase = {
  id: string
  titulo: string
  icono: React.ElementType
  estado: EstadoFase
  textoEstado?: string
  entrada: string
  salida: string
  explicacion: string
  duracionMs: number | null
  pestana: PestanaId
  detalle?: React.ReactNode
}

function fases(etl: PipelineEtl): Fase[] {
  const { extracciones, procesado, carga } = etl
  const completadas = extracciones.filter((e) => e.estado === "completada")
  const conError = extracciones.filter((e) => e.estado === "error")
  const procesadas = extracciones.filter(
    (e) => e.estado === "completada" || e.estado === "error"
  )
  const pendientes = extracciones.filter(
    (e) => e.estado === "pendiente" || e.estado === "en_curso"
  )
  const horasRecibidas = completadas.reduce((n, e) => {
    const t = (e.json as { hourly?: { time?: unknown[] } })?.hourly?.time
    return n + (Array.isArray(t) ? t.length : 0)
  }, 0)

  const estadoExtraccion: EstadoFase =
    extracciones.length === 0
      ? "pendiente"
      : etl.extrayendo
        ? "en_curso"
        : conError.length > 0
          ? "error"
          : "completada"

  const transformacionesError =
    procesado?.transformaciones.filter((t) => t.error) ?? []
  const avisos = procesado?.transformaciones.flatMap((t) => t.avisos) ?? []
  const estadoTransformacion: EstadoFase = !procesado
    ? "pendiente"
    : transformacionesError.length > 0
      ? "error"
      : "completada"

  const validos = procesado?.limpieza.validos.length ?? 0
  const rechazados = procesado?.limpieza.rechazados ?? []
  const duplicados = rechazados.filter((r) => r.tipo === "duplicado").length

  const estadoFiltrado: EstadoFase = !procesado
    ? "pendiente"
    : etl.efectivos.length > 0
      ? "completada"
      : "pendiente"

  const resumen = carga ? resumenLotes(carga.lotes) : null
  const verificacion = carga?.verificacion
  const estadoCarga: EstadoFase = !carga
    ? "pendiente"
    : carga.estado !== "terminada"
      ? "en_curso"
      : resumen!.lotesFallidos > 0 ||
          verificacion?.estado === "error" ||
          (verificacion?.estado === "ok" && verificacion.faltantes.length > 0)
        ? "error"
        : "completada"

  return [
    {
      id: "extraccion",
      titulo: "Extracción",
      icono: CloudArrowDownIcon,
      estado: estadoExtraccion,
      entrada: `${fmt(extracciones.length)} peticiones (ciudades)`,
      salida: `${fmt(completadas.length)} JSON · ${fmt(horasRecibidas)} horas`,
      explicacion:
        "Una petición HTTP por ciudad a la API histórica. Se guarda el JSON original sin tocar.",
      duracionMs: etl.duracionExtraccionMs,
      pestana: "json",
      detalle:
        extracciones.length > 0 ? (
          <div className="flex flex-col gap-1" aria-live="polite">
            <p>
              <span className="font-medium">Procesadas ({procesadas.length}):</span>{" "}
              {procesadas
                .map(
                  (e) =>
                    `${buscarCiudad(e.ciudadId)?.nombre}${e.estado === "error" ? " (error)" : ""}`
                )
                .join(", ") || "—"}
            </p>
            <p>
              <span className="font-medium">Pendientes ({pendientes.length}):</span>{" "}
              {pendientes
                .map(
                  (e) =>
                    `${buscarCiudad(e.ciudadId)?.nombre}${e.estado === "en_curso" ? " (descargando…)" : ""}`
                )
                .join(", ") || "—"}
            </p>
          </div>
        ) : null,
    },
    {
      id: "transformacion",
      titulo: "Transformación",
      icono: TableIcon,
      estado: estadoTransformacion,
      textoEstado:
        estadoTransformacion === "completada" && avisos.length > 0
          ? `Completada · ${avisos.length} avisos`
          : undefined,
      entrada: `${fmt(completadas.length)} JSON con arrays paralelos`,
      salida: `${fmt(procesado?.filas.length ?? 0)} filas (ciudad × hora)`,
      explicacion:
        "Los arrays time, temperatura, humedad y precipitación se combinan por posición en una fila por hora. Las horas se interpretan como UTC.",
      duracionMs: procesado?.duracionTransformacionMs ?? null,
      pestana: "transformados",
    },
    {
      id: "limpieza",
      titulo: "Limpieza",
      icono: BroomIcon,
      estado: procesado ? "completada" : "pendiente",
      entrada: `${fmt(procesado?.filas.length ?? 0)} filas`,
      salida: `${fmt(validos)} válidas · ${fmt(rechazados.length)} rechazadas${duplicados ? ` (${fmt(duplicados)} duplicadas)` : ""}`,
      explicacion:
        "Se rechazan filas sin fecha válida o con mediciones nulas, ausentes o no numéricas, humedad fuera de 0–100, precipitación negativa y duplicados.",
      duracionMs: procesado?.duracionLimpiezaMs ?? null,
      pestana: "rechazados",
    },
    {
      id: "filtrado",
      titulo: "Filtrado y selección",
      icono: FunnelIcon,
      estado: estadoFiltrado,
      textoEstado:
        procesado && etl.efectivos.length === 0
          ? "Pendiente · sin selección"
          : undefined,
      entrada: `${fmt(validos)} válidas`,
      salida: `${fmt(etl.filtrados.length)} coinciden · ${fmt(etl.efectivos.length)} seleccionadas`,
      explicacion:
        "Tú decides qué se sube: filtros → ordenación → selección. Solo cuentan las filas seleccionadas que cumplen los filtros actuales.",
      duracionMs: procesado ? etl.duracionFiltradoMs : null,
      pestana: "validos",
    },
    {
      id: "carga",
      titulo: "Carga",
      icono: DatabaseIcon,
      estado: estadoCarga,
      textoEstado:
        carga?.estado === "verificando" ? "En curso · verificando" : undefined,
      entrada: `${fmt(carga?.registros.length ?? etl.efectivos.length)} registros${carga ? " (congelados)" : ""}`,
      salida: resumen
        ? `${fmt(resumen.correctos)} procesados · ${fmt(resumen.fallidos)} fallidos${verificacion?.estado === "ok" ? ` · ${fmt(verificacion.encontradas)} verificados` : ""}`
        : "—",
      explicacion:
        "Upsert en Supabase por lotes de 500 desde el servidor. Después se comprueba que cada clave enviada existe en la tabla.",
      duracionMs: carga?.duracionMs || null,
      pestana: "carga",
    },
  ]
}

export function VistaPipeline({
  etl,
  onInspeccionar,
}: {
  etl: PipelineEtl
  onInspeccionar: (p: PestanaId) => void
}) {
  const lista = fases(etl)
  return (
    <section aria-labelledby="titulo-pipeline" className="flex flex-col gap-3">
      <h2 id="titulo-pipeline" className="font-heading text-sm font-medium">
        2. Pipeline ETL
      </h2>
      <ol className="grid gap-2 lg:grid-cols-[repeat(5,minmax(0,1fr))] lg:gap-0">
        {lista.map((f, i) => {
          const Icono = f.icono
          return (
            <li key={f.id} className="flex flex-col items-stretch lg:flex-row">
              <article
                className={cn(
                  "flex flex-1 flex-col gap-2 rounded-lg bg-card p-3 text-xs ring-1 ring-foreground/10",
                  f.estado === "en_curso" && "ring-2 ring-sky-500/50",
                  f.estado === "error" && "ring-destructive/50"
                )}
                aria-label={`Fase ${i + 1}: ${f.titulo}`}
              >
                <header className="flex items-start justify-between gap-2">
                  <h3 className="flex items-center gap-1.5 font-heading text-sm font-medium">
                    <Icono aria-hidden className="size-4 text-muted-foreground" />
                    {i + 1}. {f.titulo}
                  </h3>
                  <EstadoBadge estado={f.estado} texto={f.textoEstado} />
                </header>
                <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                  <dt className="text-muted-foreground">Entrada</dt>
                  <dd className="tabular-nums">{f.entrada}</dd>
                  <dt className="text-muted-foreground">Salida</dt>
                  <dd className="font-medium tabular-nums">{f.salida}</dd>
                  <dt className="text-muted-foreground">Duración</dt>
                  <dd className="tabular-nums">{fmtDuracion(f.duracionMs)}</dd>
                </dl>
                <p className="text-muted-foreground">{f.explicacion}</p>
                {f.detalle && (
                  <div className="rounded-md bg-muted/50 px-2 py-1.5">{f.detalle}</div>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-auto self-start"
                  onClick={() => onInspeccionar(f.pestana)}
                >
                  Inspeccionar resultados
                </Button>
              </article>
              {i < lista.length - 1 && (
                <div
                  aria-hidden
                  className="flex items-center justify-center py-0.5 text-muted-foreground lg:px-1 lg:py-0"
                >
                  <ArrowDownIcon className="size-4 lg:hidden" />
                  <ArrowRightIcon className="hidden size-4 lg:block" />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
