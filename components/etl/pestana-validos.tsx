"use client"

import * as React from "react"
import {
  ArrowCounterClockwiseIcon,
  CheckSquareIcon,
  XSquareIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CIUDADES } from "@/lib/etl/ciudades"
import { formatearFechaHora } from "@/lib/etl/fechas"
import type { Filtros } from "@/lib/etl/filtros"
import { claveRegistro } from "@/lib/etl/limpieza"
import type { CampoOrden, Registro } from "@/lib/etl/types"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import {
  Explicacion,
  fmt,
  fmtDecimal,
  SelectNativo,
  TablaPaginada,
  type Columna,
} from "./comun"

export const CAMPOS_ORDEN: { campo: CampoOrden; etiqueta: string }[] = [
  { campo: "ciudad", etiqueta: "Ciudad" },
  { campo: "fecha_hora", etiqueta: "Fecha y hora" },
  { campo: "temperatura_c", etiqueta: "Temperatura" },
  { campo: "humedad_pct", etiqueta: "Humedad" },
  { campo: "precipitacion_mm", etiqueta: "Precipitación" },
]

export const columnasRegistro: Columna<Registro>[] = [
  { id: "ciudad", encabezado: "Ciudad", celda: (r) => r.ciudad },
  {
    id: "fecha_hora",
    encabezado: "Fecha y hora (UTC)",
    celda: (r) => <span className="tabular-nums">{formatearFechaHora(r.fecha_hora)}</span>,
  },
  {
    id: "temperatura_c",
    encabezado: "Temperatura (°C)",
    numerica: true,
    celda: (r) => fmtDecimal(r.temperatura_c),
  },
  {
    id: "humedad_pct",
    encabezado: "Humedad (%)",
    numerica: true,
    celda: (r) => fmtDecimal(r.humedad_pct),
  },
  {
    id: "precipitacion_mm",
    encabezado: "Precipitación (mm)",
    numerica: true,
    celda: (r) => fmtDecimal(r.precipitacion_mm),
  },
]

function CampoFiltro({
  id,
  etiqueta,
  error,
  ...props
}: React.ComponentProps<typeof Input> & { etiqueta: string; error?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <Label htmlFor={id} className="text-[0.7rem] text-muted-foreground">
        {etiqueta}
      </Label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        {...props}
      />
      {error && (
        <span id={`${id}-error`} className="text-[0.7rem] text-destructive">
          {error}
        </span>
      )}
    </div>
  )
}

function Rango({
  id,
  titulo,
  min,
  max,
  filtros,
  setFiltros,
  errores,
  tipo = "number",
}: {
  id: string
  titulo: string
  min: keyof Filtros
  max: keyof Filtros
  filtros: Filtros
  setFiltros: PipelineEtl["setFiltros"]
  errores: PipelineEtl["erroresFiltros"]
  tipo?: "number" | "datetime-local"
}) {
  const cambiar = (campo: keyof Filtros) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setFiltros((f) => ({ ...f, [campo]: e.target.value }))
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="mb-1 text-xs font-medium">{titulo}</legend>
      <div className="grid grid-cols-2 gap-2">
        <CampoFiltro
          id={`${id}-min`}
          etiqueta={tipo === "number" ? "Mínimo" : "Desde"}
          type={tipo}
          step={tipo === "number" ? "any" : undefined}
          value={filtros[min] as string}
          onChange={cambiar(min)}
          error={errores[min as keyof typeof errores]}
        />
        <CampoFiltro
          id={`${id}-max`}
          etiqueta={tipo === "number" ? "Máximo" : "Hasta"}
          type={tipo}
          step={tipo === "number" ? "any" : undefined}
          value={filtros[max] as string}
          onChange={cambiar(max)}
          error={errores[max as keyof typeof errores]}
        />
      </div>
    </fieldset>
  )
}

export function PestanaValidos({ etl }: { etl: PipelineEtl }) {
  const { filtros, setFiltros, erroresFiltros, orden, setOrden, seleccion } = etl
  if (!etl.procesado) {
    return <p className="text-muted-foreground">Aún no hay registros válidos.</p>
  }
  const ciudadesPresentes = CIUDADES.filter((c) =>
    etl.validos.some((r) => r.ciudad === c.nombre)
  )
  const alternarCiudad = (nombre: string, marcada: boolean) =>
    setFiltros((f) => ({
      ...f,
      ciudades: marcada
        ? [...f.ciudades, nombre]
        : f.ciudades.filter((c) => c !== nombre),
    }))

  const columnas = (visibles: Registro[]): Columna<Registro>[] => {
    const clavesPagina = visibles.map(claveRegistro)
    const marcadas = clavesPagina.filter((k) => seleccion.has(k)).length
    return [
      {
        id: "sel",
        encabezado: (
          <Checkbox
            aria-label="Seleccionar las filas de esta página"
            checked={marcadas > 0 && marcadas === clavesPagina.length}
            indeterminate={marcadas > 0 && marcadas < clavesPagina.length}
            disabled={clavesPagina.length === 0}
            onCheckedChange={(v) => etl.alternarSeleccion(clavesPagina, v)}
          />
        ),
        className: "w-8",
        celda: (r) => {
          const k = claveRegistro(r)
          return (
            <Checkbox
              aria-label={`Seleccionar ${r.ciudad} ${formatearFechaHora(r.fecha_hora)}`}
              checked={seleccion.has(k)}
              onCheckedChange={(v) => etl.alternarSeleccion([k], v)}
            />
          )
        },
      },
      ...columnasRegistro,
    ]
  }

  // Al cambiar filtros u orden se vuelve a la página 1.
  const claveTabla = JSON.stringify([filtros, orden])

  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        Orden de las operaciones: <strong>válidos → filtros → ordenación →
        selección → carga</strong>. Los filtros y la ordenación se aplican al
        conjunto completo antes de paginar. Cambiar los filtros no selecciona
        filas nuevas automáticamente; las filas seleccionadas que dejan de
        cumplir los filtros no se subirán. Fechas y horas en UTC.
      </Explicacion>

      <section
        aria-label="Filtros"
        className="grid gap-4 rounded-lg border p-3 md:grid-cols-2 xl:grid-cols-[auto_1.4fr_1fr_1fr_1fr]"
      >
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1 text-xs font-medium">Ciudades</legend>
          {ciudadesPresentes.map((c) => (
            <Label key={c.id} className="flex items-center gap-1.5 font-normal">
              <Checkbox
                checked={filtros.ciudades.includes(c.nombre)}
                onCheckedChange={(v) => alternarCiudad(c.nombre, v)}
              />
              {c.nombre}
            </Label>
          ))}
          <span className="text-[0.7rem] text-muted-foreground">
            {filtros.ciudades.length === 0 ? "Sin marcar = todas" : `${filtros.ciudades.length} marcadas`}
          </span>
        </fieldset>
        <Rango
          id="fecha"
          titulo="Fecha y hora (UTC)"
          tipo="datetime-local"
          min="desde"
          max="hasta"
          filtros={filtros}
          setFiltros={setFiltros}
          errores={erroresFiltros}
        />
        <Rango
          id="temp"
          titulo="Temperatura (°C)"
          min="temperaturaMin"
          max="temperaturaMax"
          filtros={filtros}
          setFiltros={setFiltros}
          errores={erroresFiltros}
        />
        <Rango
          id="hum"
          titulo="Humedad (%)"
          min="humedadMin"
          max="humedadMax"
          filtros={filtros}
          setFiltros={setFiltros}
          errores={erroresFiltros}
        />
        <div className="flex flex-col gap-2">
          <Rango
            id="prec"
            titulo="Precipitación (mm)"
            min="precipitacionMin"
            max="precipitacionMax"
            filtros={filtros}
            setFiltros={setFiltros}
            errores={erroresFiltros}
          />
          <Label className="flex items-center gap-1.5 font-normal">
            <Checkbox
              checked={filtros.soloLluvia}
              onCheckedChange={(v) => setFiltros((f) => ({ ...f, soloLluvia: v }))}
            />
            Solo registros con lluvia (precipitación &gt; 0)
          </Label>
        </div>
      </section>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
            Ordenar por
            <SelectNativo
              value={orden.campo}
              onChange={(e) =>
                setOrden((o) => ({ ...o, campo: e.target.value as CampoOrden }))
              }
            >
              {CAMPOS_ORDEN.map((c) => (
                <option key={c.campo} value={c.campo}>
                  {c.etiqueta}
                </option>
              ))}
            </SelectNativo>
          </label>
          <label className="flex flex-col gap-1 text-[0.7rem] text-muted-foreground">
            Dirección
            <SelectNativo
              value={orden.direccion}
              onChange={(e) =>
                setOrden((o) => ({ ...o, direccion: e.target.value as "asc" | "desc" }))
              }
            >
              <option value="asc">Ascendente</option>
              <option value="desc">Descendente</option>
            </SelectNativo>
          </label>
          <Button variant="ghost" size="sm" onClick={etl.restablecerFiltros}>
            <ArrowCounterClockwiseIcon data-icon="inline-start" />
            Restablecer filtros
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs" aria-live="polite">
            <strong className="tabular-nums">{fmt(etl.filtrados.length)}</strong> coinciden ·{" "}
            <strong className="tabular-nums">{fmt(etl.efectivos.length)}</strong> seleccionadas para cargar
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={etl.filtrados.length === 0}
            onClick={etl.seleccionarFiltrados}
          >
            <CheckSquareIcon data-icon="inline-start" />
            Seleccionar las {fmt(etl.filtrados.length)} filas filtradas
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={seleccion.size === 0}
            onClick={etl.vaciarSeleccion}
          >
            <XSquareIcon data-icon="inline-start" />
            Vaciar selección
          </Button>
        </div>
      </div>

      <TablaPaginada
        key={claveTabla}
        etiqueta="Registros válidos filtrados y ordenados"
        filas={etl.filtrados}
        columnas={columnas}
        claveFila={claveRegistro}
        claseFila={(r) => cn(seleccion.has(claveRegistro(r)) && "bg-primary/10")}
        vacio="Ningún registro válido cumple los filtros actuales."
      />
    </div>
  )
}
