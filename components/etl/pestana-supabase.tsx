"use client"

import * as React from "react"
import { ArrowClockwiseIcon, DatabaseIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CIUDADES } from "@/lib/etl/ciudades"
import { formatearFechaHora } from "@/lib/etl/fechas"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import {
  Explicacion,
  fmt,
  fmtDecimal,
  Paginacion,
  SelectNativo,
} from "./comun"
import { CAMPOS_ORDEN } from "./pestana-validos"

type FilaDestino = {
  id: number
  ciudad: string
  fecha_hora: string
  temperatura_c: number
  humedad_pct: number
  precipitacion_mm: number
  importado_en: string
}

type Consulta = {
  ciudad: string
  desde: string
  hasta: string
  orden: string
  dir: "asc" | "desc"
  pagina: number
  tamano: number
}

const CONSULTA_INICIAL: Consulta = {
  ciudad: "",
  desde: "",
  hasta: "",
  orden: "fecha_hora",
  dir: "asc",
  pagina: 1,
  tamano: 25,
}

export function PestanaSupabase({ etl }: { etl: PipelineEtl }) {
  const [consulta, setConsulta] = React.useState(CONSULTA_INICIAL)
  const [resultado, setResultado] = React.useState<{
    filas: FilaDestino[]
    total: number
    leidoEn: string
  } | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)
  const [version, setVersion] = React.useState(0)

  React.useEffect(() => {
    const control = new AbortController()
    const params = new URLSearchParams({
      orden: consulta.orden,
      dir: consulta.dir,
      pagina: String(consulta.pagina),
      tamano: String(consulta.tamano),
    })
    if (consulta.ciudad) params.set("ciudad", consulta.ciudad)
    if (consulta.desde) params.set("desde", consulta.desde)
    if (consulta.hasta) params.set("hasta", consulta.hasta)

    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCargando(true)
    fetch(`/api/mediciones?${params}`, { cache: "no-store", signal: control.signal })
      .then(async (r) => {
        const cuerpo = await r.json()
        if (!r.ok) throw new Error(cuerpo.error ?? `Error ${r.status}`)
        setResultado({ ...cuerpo, leidoEn: new Date().toISOString() })
        setError(null)
      })
      .catch((e: unknown) => {
        if (control.signal.aborted) return
        setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!control.signal.aborted) setCargando(false)
      })
    return () => control.abort()
  }, [consulta, version, etl.carga?.estado])

  const cambiar = (cambios: Partial<Consulta>) =>
    setConsulta((c) => ({ ...c, pagina: 1, ...cambios }))

  const totalPaginas = resultado ? Math.max(1, Math.ceil(resultado.total / consulta.tamano)) : 1

  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        <DatabaseIcon aria-hidden className="me-1 inline size-3.5" />
        <strong>Datos persistidos</strong>: lectura real de la tabla{" "}
        <code>mediciones_meteorologicas</code> a través del servidor. Lo que
        ves en «Válidos» o «Vista previa» son datos <strong>locales</strong>,
        en memoria del navegador, que no existen en la base de datos hasta que
        los subes. Aquí el orden lo impone la consulta (<code>ORDER BY</code>{" "}
        {consulta.orden} {consulta.dir}, id).
      </Explicacion>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
          Ciudad
          <SelectNativo value={consulta.ciudad} onChange={(e) => cambiar({ ciudad: e.target.value })}>
            <option value="">Todas</option>
            {CIUDADES.map((c) => (
              <option key={c.id} value={c.nombre}>
                {c.nombre}
              </option>
            ))}
          </SelectNativo>
        </label>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-desde" className="text-[0.7rem] text-muted-foreground">
            Desde (UTC)
          </Label>
          <Input
            id="sb-desde"
            type="datetime-local"
            value={consulta.desde}
            onChange={(e) => cambiar({ desde: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="sb-hasta" className="text-[0.7rem] text-muted-foreground">
            Hasta (UTC)
          </Label>
          <Input
            id="sb-hasta"
            type="datetime-local"
            value={consulta.hasta}
            onChange={(e) => cambiar({ hasta: e.target.value })}
          />
        </div>
        <label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
          Ordenar por
          <SelectNativo value={consulta.orden} onChange={(e) => cambiar({ orden: e.target.value })}>
            {CAMPOS_ORDEN.map((c) => (
              <option key={c.campo} value={c.campo}>
                {c.etiqueta}
              </option>
            ))}
            <option value="importado_en">Importado en</option>
          </SelectNativo>
        </label>
        <label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
          Dirección
          <SelectNativo
            value={consulta.dir}
            onChange={(e) => cambiar({ dir: e.target.value as "asc" | "desc" })}
          >
            <option value="asc">Ascendente</option>
            <option value="desc">Descendente</option>
          </SelectNativo>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={cargando}
          onClick={() => {
            setVersion((v) => v + 1)
            void etl.refrescarEstadoSupabase()
          }}
        >
          <ArrowClockwiseIcon data-icon="inline-start" className={cargando ? "animate-spin" : undefined} />
          {cargando ? "Actualizando…" : "Actualizar"}
        </Button>
      </div>

      {error && (
        <Alert variant="destructive" role="alert">
          <WarningCircleIcon />
          <AlertTitle>No se pudieron leer los datos de Supabase</AlertTitle>
          <AlertDescription>
            {error}
            {error.includes("mediciones_meteorologicas") &&
              " ¿Has aplicado la migración de supabase/migrations?"}
          </AlertDescription>
        </Alert>
      )}

      {resultado && !error && (
        <>
          <p className="text-xs text-muted-foreground">
            {fmt(resultado.total)} filas en destino con estos filtros · leído a las{" "}
            {resultado.leidoEn.slice(11, 19)} UTC
          </p>
          <div className="rounded-md border">
            <Table aria-label="Datos almacenados en Supabase">
              <TableHeader>
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead scope="col" className="text-end">id</TableHead>
                  <TableHead scope="col">Ciudad</TableHead>
                  <TableHead scope="col">Fecha y hora (UTC)</TableHead>
                  <TableHead scope="col" className="text-end">Temperatura (°C)</TableHead>
                  <TableHead scope="col" className="text-end">Humedad (%)</TableHead>
                  <TableHead scope="col" className="text-end">Precipitación (mm)</TableHead>
                  <TableHead scope="col">Importado en (UTC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resultado.filas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="h-20 text-center text-muted-foreground">
                      La tabla no tiene filas que cumplan estos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  resultado.filas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="text-end text-muted-foreground tabular-nums">{f.id}</TableCell>
                      <TableCell>{f.ciudad}</TableCell>
                      <TableCell className="tabular-nums">{formatearFechaHora(f.fecha_hora)}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmtDecimal(f.temperatura_c)}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmtDecimal(f.humedad_pct)}</TableCell>
                      <TableCell className="text-end tabular-nums">{fmtDecimal(f.precipitacion_mm)}</TableCell>
                      <TableCell className="text-muted-foreground tabular-nums">
                        {formatearFechaHora(f.importado_en)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
          <Paginacion
            pagina={consulta.pagina}
            totalPaginas={totalPaginas}
            total={resultado.total}
            tamano={consulta.tamano}
            onPagina={(pagina) => setConsulta((c) => ({ ...c, pagina }))}
            onTamano={(tamano) => cambiar({ tamano })}
          />
        </>
      )}
    </div>
  )
}
