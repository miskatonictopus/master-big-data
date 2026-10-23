"use client"

import * as React from "react"
import {
  CaretDoubleLeftIcon,
  CaretDoubleRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  SpinnerGapIcon,
  WarningCircleIcon,
} from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

const numero = new Intl.NumberFormat("es-ES")
const decimal = new Intl.NumberFormat("es-ES", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 2,
})

export const fmt = (n: number) => numero.format(n)
export const fmtDecimal = (n: number) => decimal.format(n)

export function fmtDuracion(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—"
  if (ms < 1) return "< 1 ms"
  if (ms < 1000) return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2).replace(".", ",")} s`
}

/** Muestra un valor crudo sin disfrazarlo: null, ausente y "" son distintos de 0. */
export function ValorCrudo({ valor }: { valor: unknown }) {
  if (valor === undefined) {
    return <span className="text-destructive italic">ausente</span>
  }
  if (valor === null) {
    return <span className="font-mono text-destructive">null</span>
  }
  if (typeof valor === "number") {
    return Number.isFinite(valor) ? (
      <span className="tabular-nums">{fmtDecimal(valor)}</span>
    ) : (
      <span className="font-mono text-destructive">{String(valor)}</span>
    )
  }
  return (
    <span className="font-mono text-destructive">{JSON.stringify(valor)}</span>
  )
}

export type EstadoFase = "pendiente" | "en_curso" | "completada" | "error"

const ESTADOS: Record<
  EstadoFase,
  { texto: string; icono: React.ElementType; clase: string }
> = {
  pendiente: {
    texto: "Pendiente",
    icono: CircleDashedIcon,
    clase: "border-border text-muted-foreground",
  },
  en_curso: {
    texto: "En curso",
    icono: SpinnerGapIcon,
    clase: "border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-300",
  },
  completada: {
    texto: "Completada",
    icono: CheckCircleIcon,
    clase:
      "border-emerald-600/40 bg-emerald-600/10 text-emerald-800 dark:text-emerald-300",
  },
  error: {
    texto: "Con errores",
    icono: WarningCircleIcon,
    clase: "border-destructive/40 bg-destructive/10 text-destructive",
  },
}

/** Estado con icono y texto: no depende solo del color. */
export function EstadoBadge({
  estado,
  texto,
  className,
}: {
  estado: EstadoFase
  texto?: string
  className?: string
}) {
  const { texto: base, icono: Icono, clase } = ESTADOS[estado]
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[0.7rem] font-medium whitespace-nowrap",
        clase,
        className
      )}
    >
      <Icono
        aria-hidden
        className={cn("size-3.5", estado === "en_curso" && "animate-spin")}
        weight={estado === "pendiente" ? "regular" : "bold"}
      />
      {texto ?? base}
    </span>
  )
}

export type Columna<T> = {
  id: string
  encabezado: React.ReactNode
  celda: (fila: T) => React.ReactNode
  numerica?: boolean
  className?: string
}

export const TAMANOS_PAGINA = [25, 50, 100]

export function Paginacion({
  pagina,
  totalPaginas,
  total,
  tamano,
  onPagina,
  onTamano,
}: {
  pagina: number
  totalPaginas: number
  total: number
  tamano: number
  onPagina: (p: number) => void
  onTamano?: (t: number) => void
}) {
  const desde = total === 0 ? 0 : (pagina - 1) * tamano + 1
  const hasta = Math.min(pagina * tamano, total)
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
      <p aria-live="polite">
        Filas {fmt(desde)}–{fmt(hasta)} de {fmt(total)} · página {fmt(pagina)}{" "}
        de {fmt(Math.max(totalPaginas, 1))}
      </p>
      <div className="flex items-center gap-1">
        {onTamano && (
          <label className="me-2 flex items-center gap-1">
            Filas por página
            <SelectNativo
              value={String(tamano)}
              onChange={(e) => onTamano(Number(e.target.value))}
            >
              {TAMANOS_PAGINA.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </SelectNativo>
          </label>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Primera página"
          disabled={pagina <= 1}
          onClick={() => onPagina(1)}
        >
          <CaretDoubleLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página anterior"
          disabled={pagina <= 1}
          onClick={() => onPagina(pagina - 1)}
        >
          <CaretLeftIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Página siguiente"
          disabled={pagina >= totalPaginas}
          onClick={() => onPagina(pagina + 1)}
        >
          <CaretRightIcon />
        </Button>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Última página"
          disabled={pagina >= totalPaginas}
          onClick={() => onPagina(totalPaginas)}
        >
          <CaretDoubleRightIcon />
        </Button>
      </div>
    </div>
  )
}

export function usePaginacion(total: number, tamanoInicial = 25) {
  const [pagina, setPagina] = React.useState(1)
  const [tamano, setTamano] = React.useState(tamanoInicial)
  const totalPaginas = Math.max(1, Math.ceil(total / tamano))
  // Si el conjunto encoge (p. ej. al filtrar), no quedarse en una página vacía.
  const paginaReal = Math.min(pagina, totalPaginas)
  return {
    pagina: paginaReal,
    tamano,
    totalPaginas,
    inicio: (paginaReal - 1) * tamano,
    setPagina,
    setTamano: (t: number) => {
      setTamano(t)
      setPagina(1)
    },
  }
}

/**
 * Tabla que solo pinta la página visible. Recibe el conjunto completo ya
 * filtrado y ordenado: la paginación únicamente afecta a la visualización.
 */
export function TablaPaginada<T>({
  filas,
  columnas,
  claveFila,
  vacio,
  claseFila,
  etiqueta,
}: {
  filas: T[]
  /** Como función recibe las filas visibles (útil para "seleccionar página"). */
  columnas: Columna<T>[] | ((visibles: T[]) => Columna<T>[])
  claveFila: (fila: T) => string
  vacio: React.ReactNode
  claseFila?: (fila: T) => string | undefined
  etiqueta: string
}) {
  const p = usePaginacion(filas.length)
  const visibles = filas.slice(p.inicio, p.inicio + p.tamano)
  const cols = typeof columnas === "function" ? columnas(visibles) : columnas
  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-md border">
        <Table aria-label={etiqueta}>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              {cols.map((c) => (
                <TableHead
                  key={c.id}
                  scope="col"
                  className={cn(c.numerica && "text-end", c.className)}
                >
                  {c.encabezado}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={cols.length}
                  className="h-20 text-center whitespace-normal text-muted-foreground"
                >
                  {vacio}
                </TableCell>
              </TableRow>
            ) : (
              visibles.map((fila) => (
                <TableRow key={claveFila(fila)} className={claseFila?.(fila)}>
                  {cols.map((c) => (
                    <TableCell
                      key={c.id}
                      className={cn(
                        c.numerica && "text-end tabular-nums",
                        c.className
                      )}
                    >
                      {c.celda(fila)}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <Paginacion
        pagina={p.pagina}
        totalPaginas={p.totalPaginas}
        total={filas.length}
        tamano={p.tamano}
        onPagina={p.setPagina}
        onTamano={p.setTamano}
      />
    </div>
  )
}

export function SelectNativo({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-7 rounded-md border border-input bg-input/20 px-1.5 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30 dark:bg-input/30",
        className
      )}
      {...props}
    />
  )
}

export function Explicacion({
  children,
  className,
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={cn(
        "rounded-md border-s-2 border-primary bg-muted/50 px-3 py-2 text-xs/relaxed text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  )
}
