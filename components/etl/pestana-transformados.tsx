"use client"

import { WarningIcon } from "@phosphor-icons/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { buscarCiudad } from "@/lib/etl/ciudades"
import { formatearFechaHora } from "@/lib/etl/fechas"
import type { FilaTransformada, Rechazo } from "@/lib/etl/types"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { Explicacion, TablaPaginada, ValorCrudo, type Columna } from "./comun"

const claveOrigen = (f: FilaTransformada) =>
  `${f.origen.ciudadId}#${f.origen.indice}`

function columnasMedicion<T>(
  fila: (t: T) => FilaTransformada
): Columna<T>[] {
  return [
    {
      id: "temperatura_c",
      encabezado: "temperatura_c (°C)",
      numerica: true,
      celda: (t) => <ValorCrudo valor={fila(t).temperatura_c} />,
    },
    {
      id: "humedad_pct",
      encabezado: "humedad_pct (%)",
      numerica: true,
      celda: (t) => <ValorCrudo valor={fila(t).humedad_pct} />,
    },
    {
      id: "precipitacion_mm",
      encabezado: "precipitacion_mm (mm)",
      numerica: true,
      celda: (t) => <ValorCrudo valor={fila(t).precipitacion_mm} />,
    },
  ]
}

const columnasFila: Columna<FilaTransformada>[] = [
  {
    id: "origen",
    encabezado: "Posición en el array",
    celda: (f) => (
      <span className="text-muted-foreground tabular-nums">
        {f.origen.ciudadId}[{f.origen.indice}]
      </span>
    ),
  },
  { id: "ciudad", encabezado: "ciudad", celda: (f) => f.ciudad ?? <ValorCrudo valor={null} /> },
  {
    id: "fecha_original",
    encabezado: "time (original)",
    celda: (f) => <span className="font-mono">{String(f.fecha_original)}</span>,
  },
  {
    id: "fecha_hora",
    encabezado: "fecha_hora (UTC)",
    celda: (f) =>
      f.fecha_hora ? (
        <span className="font-mono">{f.fecha_hora}</span>
      ) : (
        <span className="text-destructive">no válida</span>
      ),
  },
  ...columnasMedicion((f: FilaTransformada) => f),
]

export function PestanaTransformados({ etl }: { etl: PipelineEtl }) {
  const p = etl.procesado
  if (!p) return <p className="text-muted-foreground">Aún no hay datos transformados.</p>
  const incidencias = p.transformaciones.filter((t) => t.error || t.avisos.length)
  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        Cada posición <em>i</em> de los arrays se convierte en una fila. La hora{" "}
        <code>time[i]</code> se interpreta explícitamente como UTC y se guarda en
        ISO 8601 con sufijo <code>Z</code>. Las mediciones se copian sin
        corregir: un <code>null</code> sigue siendo <code>null</code> (no 0) y
        una posición que falta aparece como <em>ausente</em>. La limpieza decide
        después qué filas son válidas.
      </Explicacion>
      {incidencias.map((t) => (
        <Alert key={t.ciudadId} variant={t.error ? "destructive" : "default"}>
          <WarningIcon />
          <AlertTitle>{buscarCiudad(t.ciudadId)?.nombre}</AlertTitle>
          <AlertDescription>
            <ul className="list-disc ps-4">
              {t.error && <li>{t.error} No se generan filas para esta ciudad.</li>}
              {t.avisos.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ))}
      <TablaPaginada
        etiqueta="Datos transformados"
        filas={p.filas}
        columnas={columnasFila}
        claveFila={claveOrigen}
        vacio="No hay filas transformadas."
      />
    </div>
  )
}

const columnasRechazo: Columna<Rechazo>[] = [
  {
    id: "tipo",
    encabezado: "Tipo",
    celda: (r) =>
      r.tipo === "duplicado" ? (
        <span className="rounded border px-1 py-0.5">Duplicado</span>
      ) : (
        <span className="rounded border border-destructive/40 px-1 py-0.5 text-destructive">
          Calidad
        </span>
      ),
  },
  { id: "ciudad", encabezado: "ciudad", celda: (r) => r.fila.ciudad ?? <ValorCrudo valor={null} /> },
  {
    id: "fecha",
    encabezado: "fecha_hora (UTC)",
    celda: (r) =>
      r.fila.fecha_hora ? (
        formatearFechaHora(r.fila.fecha_hora)
      ) : (
        <ValorCrudo valor={r.fila.fecha_original} />
      ),
  },
  ...columnasMedicion((r: Rechazo) => r.fila),
  {
    id: "motivo",
    encabezado: "Motivo del rechazo",
    className: "whitespace-normal min-w-64",
    celda: (r) => (
      <ul className="list-disc ps-4">
        {r.motivos.map((m) => (
          <li key={m}>{m}</li>
        ))}
      </ul>
    ),
  },
]

export function PestanaRechazados({ etl }: { etl: PipelineEtl }) {
  const p = etl.procesado
  if (!p) return <p className="text-muted-foreground">Aún no hay resultados de limpieza.</p>
  return (
    <div className="flex flex-col gap-3">
      <Explicacion>
        Descartes <strong>por calidad</strong> (datos que no podemos guardar) y{" "}
        <strong>duplicados</strong> por ciudad y fecha_hora (se conserva la
        primera aparición en el orden de llegada). No incluye los registros
        válidos que excluyas con los filtros: esos siguen en «Válidos» y
        pueden volver a entrar si cambias los filtros. Las temperaturas
        extremas no se descartan por umbrales.
      </Explicacion>
      <TablaPaginada
        etiqueta="Registros rechazados"
        filas={p.limpieza.rechazados}
        columnas={columnasRechazo}
        claveFila={(r) => claveOrigen(r.fila)}
        vacio="Ninguna fila ha sido rechazada en esta extracción."
      />
    </div>
  )
}
