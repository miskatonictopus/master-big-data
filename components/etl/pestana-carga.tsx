"use client"

import {
  ArrowClockwiseIcon,
  CloudArrowUpIcon,
  InfoIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { resumenLotes, TAMANO_LOTE, type Lote } from "@/lib/etl/carga"
import { formatearFechaHora } from "@/lib/etl/fechas"
import { claveRegistro } from "@/lib/etl/limpieza"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import {
  EstadoBadge,
  Explicacion,
  fmt,
  fmtDuracion,
  TablaPaginada,
  type EstadoFase,
} from "./comun"
import { CAMPOS_ORDEN, columnasRegistro } from "./pestana-validos"

const estadoLote: Record<Lote["estado"], EstadoFase> = {
  pendiente: "pendiente",
  en_curso: "en_curso",
  completado: "completada",
  error: "error",
}

export function PestanaCarga({ etl }: { etl: PipelineEtl }) {
  const { carga, efectivos, estadoSupabase } = etl
  const cargando = carga !== null && carga.estado !== "terminada"
  const resumen = carga ? resumenLotes(carga.lotes) : null
  const reintentables = resumen ? resumen.lotesFallidos + resumen.lotesPendientes : 0
  const sinConfigurar = estadoSupabase && !estadoSupabase.configurado
  const ordenTexto = `${CAMPOS_ORDEN.find((c) => c.campo === etl.orden.campo)?.etiqueta} (${etl.orden.direccion === "asc" ? "ascendente" : "descendente"})`
  const filas = efectivos.map((r, i) => ({ ...r, n: i + 1 }))

  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        Este es el conjunto <strong>exacto</strong> que se enviará, en el orden
        elegido: {ordenTexto}. Ojo: una tabla de base de datos no conserva el
        orden de inserción. Para leer los datos ordenados más tarde hay que
        pedirlo siempre con <code>ORDER BY</code> (por ejemplo{" "}
        <code>order by fecha_hora, ciudad</code>). Al pulsar el botón se congela
        una copia de estas filas: cambiar después los filtros no altera la carga
        en curso.
      </Explicacion>

      {sinConfigurar && (
        <Alert variant="destructive" role="alert">
          <WarningCircleIcon />
          <AlertTitle>Supabase no está configurado</AlertTitle>
          <AlertDescription>
            Faltan las variables {estadoSupabase.faltan.join(", ")} en{" "}
            <code>.env.local</code>. Reinicia el servidor tras añadirlas. Mientras
            tanto la carga fallará y no se simulará ningún éxito.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="lg"
          disabled={cargando || efectivos.length === 0}
          onClick={() => void etl.subir()}
        >
          <CloudArrowUpIcon data-icon="inline-start" />
          {cargando
            ? "Cargando…"
            : `Subir ${fmt(efectivos.length)} registros a Supabase`}
        </Button>
        <span className="text-xs text-muted-foreground">
          {fmt(Math.ceil(efectivos.length / TAMANO_LOTE))} lotes de hasta{" "}
          {TAMANO_LOTE} · upsert por (ciudad, fecha_hora)
        </span>
      </div>

      {carga && resumen && (
        <section
          aria-label="Estado de la carga"
          className="flex flex-col gap-3 rounded-lg border p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-heading text-sm font-medium">
              Carga de {fmt(carga.registros.length)} registros congelados
            </h3>
            {carga.estado === "terminada" && reintentables > 0 && (
              <Button variant="outline" size="sm" onClick={() => void etl.reintentarCarga()}>
                <ArrowClockwiseIcon data-icon="inline-start" />
                Reintentar {reintentables} lotes fallidos o pendientes
              </Button>
            )}
          </div>

          <ol className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4" aria-live="polite">
            {carga.lotes.map((l) => (
              <li key={l.indice} className="flex flex-col gap-1 rounded-md bg-muted/40 p-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">
                    Lote {l.indice + 1} · {fmt(l.registros.length)} filas
                  </span>
                  <EstadoBadge
                    estado={estadoLote[l.estado]}
                    texto={l.estado === "completado" ? "Completado" : undefined}
                  />
                </div>
                <span className="text-[0.7rem] text-muted-foreground">
                  {l.intentos} intentos · {fmtDuracion(l.duracionMs)}
                  {l.procesados !== undefined && ` · ${fmt(l.procesados)} procesados`}
                </span>
                {l.error && <span className="text-[0.7rem] text-destructive">{l.error}</span>}
              </li>
            ))}
          </ol>

          {carga.estado === "terminada" && (
            <div className="grid gap-2 md:grid-cols-2">
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-md border p-3">
                <dt>Procesados correctamente</dt>
                <dd className="text-end font-medium tabular-nums">{fmt(resumen.correctos)}</dd>
                <dt>Fallidos</dt>
                <dd className="text-end font-medium tabular-nums">{fmt(resumen.fallidos)}</dd>
                <dt>Pendientes (no enviados)</dt>
                <dd className="text-end font-medium tabular-nums">{fmt(resumen.pendientes)}</dd>
                <dt>Duración total</dt>
                <dd className="text-end tabular-nums">{fmtDuracion(carga.duracionMs)}</dd>
                <dd className="col-span-2 mt-1 text-[0.7rem] text-muted-foreground">
                  El upsert de Supabase devuelve las filas afectadas sin indicar
                  si se insertaron o se actualizaron, así que no mostramos ese
                  desglose.
                </dd>
              </dl>
              <Verificacion etl={etl} />
            </div>
          )}
        </section>
      )}

      <TablaPaginada
        key={JSON.stringify(etl.orden)}
        etiqueta="Vista previa de la carga"
        filas={filas}
        columnas={[
          {
            id: "n",
            encabezado: "Nº envío",
            numerica: true,
            celda: (r) => <span className="text-muted-foreground">{fmt(r.n)}</span>,
          },
          ...columnasRegistro,
        ]}
        claveFila={claveRegistro}
        vacio="No hay filas seleccionadas que cumplan los filtros. Selecciónalas en la pestaña «Válidos»."
      />
    </div>
  )
}

function Verificacion({ etl }: { etl: PipelineEtl }) {
  const v = etl.carga?.verificacion
  if (!v) {
    return (
      <p className="flex items-start gap-1.5 rounded-md border p-3 text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" />
        No se ha verificado nada: ningún lote se completó.
      </p>
    )
  }
  if (v.estado === "error") {
    return (
      <Alert variant="destructive">
        <WarningCircleIcon />
        <AlertTitle>No se pudo verificar el destino</AlertTitle>
        <AlertDescription>{v.error}</AlertDescription>
      </Alert>
    )
  }
  return (
    <div className="flex flex-col gap-1 rounded-md border p-3">
      <EstadoBadge
        estado={v.faltantes.length === 0 ? "completada" : "error"}
        texto={v.faltantes.length === 0 ? "Verificación correcta" : "Faltan claves en destino"}
        className="self-start"
      />
      <p>
        Se consultaron en Supabase las {fmt(v.comprobadas)} claves (ciudad,
        fecha_hora) de los lotes completados:{" "}
        <strong>{fmt(v.encontradas)}</strong> existen en la tabla.
      </p>
      {v.faltantes.length > 0 && (
        <ul className="list-disc ps-4 text-destructive">
          {v.faltantes.slice(0, 10).map((r) => (
            <li key={claveRegistro(r)}>
              {r.ciudad} {formatearFechaHora(r.fecha_hora)}
            </li>
          ))}
          {v.faltantes.length > 10 && <li>… y {fmt(v.faltantes.length - 10)} más</li>}
        </ul>
      )}
    </div>
  )
}
