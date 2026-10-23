"use client"

import * as React from "react"
import {
  ArrowClockwiseIcon,
  DownloadSimpleIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { buscarCiudad } from "@/lib/etl/ciudades"
import type { ExtraccionCiudad } from "@/lib/etl/types"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { EstadoBadge, Explicacion, fmt, fmtDuracion } from "./comun"

function descargar(nombre: string, datos: unknown) {
  const blob = new Blob([JSON.stringify(datos, null, 2)], {
    type: "application/json",
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = nombre
  a.click()
  URL.revokeObjectURL(url)
}

function longitudes(json: unknown): [string, string][] {
  const hourly = (json as { hourly?: Record<string, unknown> })?.hourly
  if (!hourly || typeof hourly !== "object") return []
  return Object.entries(hourly).map(([k, v]) => [
    k,
    Array.isArray(v) ? `${fmt(v.length)} valores` : "no es un array",
  ])
}

const estadoFase = (e: ExtraccionCiudad) =>
  e.estado === "error" ? "error" : e.estado === "completada" ? "completada" : e.estado

export function PestanaJson({ etl }: { etl: PipelineEtl }) {
  const { extracciones, configExtraida } = etl
  const [elegida, setElegida] = React.useState<string | null>(null)
  const actual =
    extracciones.find((e) => e.ciudadId === elegida) ?? extracciones[0]

  if (!actual || !configExtraida) {
    return <p className="text-muted-foreground">Aún no hay extracciones.</p>
  }
  const completadas = extracciones.filter((e) => e.estado === "completada")
  const nombre = buscarCiudad(actual.ciudadId)!.nombre
  const meta = actual.json as Record<string, unknown> | undefined

  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        Respuesta tal como la devuelve Open-Meteo, sin modificar. Observa que{" "}
        <code>hourly</code> no contiene registros sino arrays paralelos: el
        elemento <em>i</em> de cada array corresponde a la hora <code>time[i]</code>.
        Las horas llegan sin zona (<code>2026-09-01T00:00</code>), pero{" "}
        <code>utc_offset_seconds: 0</code> confirma que son UTC. Los JSON se
        conservan en memoria mientras dure la sesión.
      </Explicacion>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Ciudad">
          {extracciones.map((e) => (
            <Button
              key={e.ciudadId}
              variant={e.ciudadId === actual.ciudadId ? "secondary" : "ghost"}
              size="sm"
              aria-pressed={e.ciudadId === actual.ciudadId}
              onClick={() => setElegida(e.ciudadId)}
            >
              {buscarCiudad(e.ciudadId)?.nombre}
              <EstadoBadge estado={estadoFase(e)} className="ms-1" />
            </Button>
          ))}
        </div>
        <Button
          variant="outline"
          size="sm"
          disabled={completadas.length === 0}
          onClick={() =>
            descargar(
              `open-meteo_${configExtraida.inicio}_${configExtraida.fin}.json`,
              Object.fromEntries(
                completadas.map((e) => [buscarCiudad(e.ciudadId)!.nombre, e.json])
              )
            )
          }
        >
          <DownloadSimpleIcon data-icon="inline-start" />
          Descargar todos ({completadas.length})
        </Button>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 rounded-md border p-3">
        <dt className="text-muted-foreground">Petición</dt>
        <dd className="font-mono text-[0.7rem] break-all">{actual.url}</dd>
        <dt className="text-muted-foreground">Intentos</dt>
        <dd>{actual.intentos}</dd>
        <dt className="text-muted-foreground">Duración</dt>
        <dd>{fmtDuracion(actual.duracionMs)}</dd>
        {meta && (
          <>
            <dt className="text-muted-foreground">Celda de la rejilla</dt>
            <dd className="tabular-nums">
              {String(meta.latitude)}, {String(meta.longitude)} · elevación{" "}
              {String(meta.elevation)} m
            </dd>
            <dt className="text-muted-foreground">Zona horaria</dt>
            <dd>
              {String(meta.timezone)} (utc_offset_seconds ={" "}
              {String(meta.utc_offset_seconds)})
            </dd>
            <dt className="text-muted-foreground">Arrays</dt>
            <dd>
              {longitudes(actual.json)
                .map(([k, v]) => `${k}: ${v}`)
                .join(" · ")}
            </dd>
          </>
        )}
      </dl>

      {actual.estado === "error" && (
        <Alert variant="destructive" role="alert">
          <WarningCircleIcon />
          <AlertTitle>No se pudo descargar {nombre}</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{actual.error}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={etl.extrayendo}
              onClick={() => void etl.reintentarCiudad(actual.ciudadId)}
            >
              <ArrowClockwiseIcon data-icon="inline-start" />
              Reintentar solo {nombre}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {actual.json !== undefined && (
        <div className="flex flex-col gap-2">
          <div className="flex justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                descargar(
                  `open-meteo_${actual.ciudadId}_${configExtraida.inicio}_${configExtraida.fin}.json`,
                  actual.json
                )
              }
            >
              <DownloadSimpleIcon data-icon="inline-start" />
              Descargar JSON de {nombre}
            </Button>
          </div>
          <pre
            className={cn(
              "max-h-[28rem] overflow-auto rounded-md border bg-muted/40 p-3 font-mono text-[0.7rem] leading-relaxed"
            )}
            tabIndex={0}
            aria-label={`JSON original de ${nombre}`}
          >
            {JSON.stringify(actual.json, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}
