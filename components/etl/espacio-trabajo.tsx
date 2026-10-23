"use client"

import * as React from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { usePipelineEtl, type PipelineEtl } from "@/hooks/use-pipeline-etl"
import { EstadoBadge, fmt } from "./comun"
import { Contadores } from "./contadores"
import { PanelConfiguracion } from "./panel-configuracion"
import { PestanaCarga } from "./pestana-carga"
import { PestanaJson } from "./pestana-json"
import { PestanaSupabase } from "./pestana-supabase"
import { PestanaRechazados, PestanaTransformados } from "./pestana-transformados"
import { PestanaValidos } from "./pestana-validos"
import { VistaPipeline, type PestanaId } from "./vista-pipeline"

function EstadoConexion({ etl }: { etl: PipelineEtl }) {
  const e = etl.estadoSupabase
  if (!e) return <EstadoBadge estado="en_curso" texto="Comprobando Supabase…" />
  if (!e.configurado) {
    return <EstadoBadge estado="error" texto={`Supabase sin configurar (falta ${e.faltan.join(", ")})`} />
  }
  if (!e.tabla?.disponible) {
    return <EstadoBadge estado="error" texto="Supabase: tabla no disponible" />
  }
  return (
    <EstadoBadge
      estado="completada"
      texto={`Supabase conectado · ${fmt(e.tabla.filas ?? 0)} filas en destino`}
    />
  )
}

export function EspacioTrabajo() {
  const etl = usePipelineEtl()
  const [pestana, setPestana] = React.useState<PestanaId>("json")
  const zonaPestanas = React.useRef<HTMLDivElement>(null)

  const inspeccionar = (p: PestanaId) => {
    setPestana(p)
    zonaPestanas.current?.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  const rechazados = etl.procesado?.limpieza.rechazados.length ?? 0
  const pestanas: { id: PestanaId; titulo: string; contador?: number }[] = [
    { id: "json", titulo: "JSON original", contador: etl.extracciones.length },
    { id: "transformados", titulo: "Transformados", contador: etl.procesado?.filas.length },
    { id: "validos", titulo: "Válidos y selección", contador: etl.validos.length },
    { id: "rechazados", titulo: "Rechazados", contador: rechazados },
    { id: "carga", titulo: "Vista previa de la carga", contador: etl.efectivos.length },
    { id: "supabase", titulo: "Datos en Supabase" },
  ]

  return (
    <main className="mx-auto flex w-full max-w-[96rem] flex-col gap-5 px-4 py-6 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">Big Data · Práctica 1</p>
          <h1 className="font-heading text-xl font-medium">
            Pipeline ETL: Open-Meteo → Supabase
          </h1>
          <p className="max-w-3xl text-xs text-muted-foreground">
            Extrae mediciones horarias reales, observa cómo cambian en cada
            fase y decide exactamente qué registros se guardan en la base de
            datos.
          </p>
        </div>
        <EstadoConexion etl={etl} />
      </header>

      <PanelConfiguracion etl={etl} />
      <VistaPipeline etl={etl} onInspeccionar={inspeccionar} />
      <Contadores etl={etl} />

      <div ref={zonaPestanas} className="scroll-mt-4">
        <h2 className="mb-2 font-heading text-sm font-medium">3. Inspección de datos</h2>
        <Tabs value={pestana} onValueChange={(v) => setPestana(v as PestanaId)}>
          <div className="overflow-x-auto">
            <TabsList>
              {pestanas.map((p) => (
                <TabsTrigger key={p.id} value={p.id}>
                  {p.titulo}
                  {p.contador !== undefined && (
                    <span className="rounded bg-muted px-1 text-[0.65rem] tabular-nums">
                      {fmt(p.contador)}
                    </span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
          <div className="rounded-lg bg-card p-3 ring-1 ring-foreground/10 sm:p-4">
            <TabsContent value="json">
              <PestanaJson etl={etl} />
            </TabsContent>
            <TabsContent value="transformados">
              <PestanaTransformados etl={etl} />
            </TabsContent>
            <TabsContent value="validos">
              <PestanaValidos etl={etl} />
            </TabsContent>
            <TabsContent value="rechazados">
              <PestanaRechazados etl={etl} />
            </TabsContent>
            <TabsContent value="carga">
              <PestanaCarga etl={etl} />
            </TabsContent>
            <TabsContent value="supabase">
              <PestanaSupabase etl={etl} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </main>
  )
}
