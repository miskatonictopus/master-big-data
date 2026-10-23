"use client"

import { WarningIcon } from "@phosphor-icons/react"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { fmt } from "./comun"

export function Contadores({ etl }: { etl: PipelineEtl }) {
  const rechazados = etl.procesado?.limpieza.rechazados ?? []
  const duplicados = rechazados.filter((r) => r.tipo === "duplicado").length
  const items = [
    {
      etiqueta: "Total extraído",
      valor: etl.procesado?.filas.length ?? 0,
      nota: "filas horarias transformadas",
    },
    {
      etiqueta: "Válidos",
      valor: etl.validos.length,
      nota: "superan la limpieza",
    },
    {
      etiqueta: "Rechazados",
      valor: rechazados.length,
      nota: `${fmt(rechazados.length - duplicados)} calidad · ${fmt(duplicados)} duplicados`,
    },
    {
      etiqueta: "Coinciden con los filtros",
      valor: etl.filtrados.length,
      nota: "de los válidos",
    },
    {
      etiqueta: "Seleccionados para cargar",
      valor: etl.efectivos.length,
      nota: "seleccionados y dentro de filtros",
      destacado: true,
    },
  ]
  return (
    <section aria-label="Contadores" className="flex flex-col gap-2">
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((it) => (
          <div
            key={it.etiqueta}
            className={
              it.destacado
                ? "rounded-lg bg-primary/15 p-3 ring-1 ring-primary/50"
                : "rounded-lg bg-card p-3 ring-1 ring-foreground/10"
            }
          >
            <dt className="text-xs text-muted-foreground">{it.etiqueta}</dt>
            <dd className="font-heading text-2xl font-medium tabular-nums">
              {fmt(it.valor)}
            </dd>
            <dd className="text-[0.7rem] text-muted-foreground">{it.nota}</dd>
          </div>
        ))}
      </dl>
      {etl.fueraDeFiltros > 0 && (
        <p
          role="status"
          className="flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-300"
        >
          <WarningIcon aria-hidden className="size-4" weight="bold" />
          {fmt(etl.fueraDeFiltros)} filas seleccionadas quedan fuera de los
          filtros actuales y no se subirán (siguen seleccionadas por si
          vuelves a ampliar los filtros).
        </p>
      )}
    </section>
  )
}
