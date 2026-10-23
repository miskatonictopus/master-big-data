"use client"

import { DownloadSimpleIcon, WarningCircleIcon } from "@phosphor-icons/react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { CIUDADES } from "@/lib/etl/ciudades"
import {
  MAX_DIAS_EXTRACCION,
  validarConfig,
  volumenPrevisto,
} from "@/lib/etl/extraccion"
import { hoyUtc } from "@/lib/etl/fechas"
import type { PipelineEtl } from "@/hooks/use-pipeline-etl"
import { fmt } from "./comun"

export function PanelConfiguracion({ etl }: { etl: PipelineEtl }) {
  const { config, setConfig, extrayendo } = etl
  const volumen = volumenPrevisto(config)
  // Validación en vivo: el botón no se habilita hasta que todo es correcto.
  const errores = validarConfig(config)

  const alternarCiudad = (id: string, marcada: boolean) =>
    setConfig((c) => ({
      ...c,
      ciudadIds: marcada
        ? [...c.ciudadIds, id]
        : c.ciudadIds.filter((x) => x !== id),
    }))

  return (
    <Card>
      <CardHeader>
        <CardTitle>1. Configuración de la extracción</CardTitle>
        <CardDescription>
          API histórica de Open-Meteo · variables horarias de temperatura a 2
          m, humedad relativa y precipitación · horas en UTC, °C y mm · máximo{" "}
          {MAX_DIAS_EXTRACCION} días por extracción.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-[1fr_auto_auto] lg:items-end">
        <fieldset className="flex flex-col gap-2" disabled={extrayendo}>
          <legend className="mb-2 text-xs font-medium">Ciudades</legend>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {CIUDADES.map((c) => (
              <Label key={c.id} className="flex items-center gap-1.5 font-normal">
                <Checkbox
                  checked={config.ciudadIds.includes(c.id)}
                  onCheckedChange={(v) => alternarCiudad(c.id, v)}
                  disabled={extrayendo}
                />
                {c.nombre}
                <span className="text-[0.65rem] text-muted-foreground tabular-nums">
                  ({c.latitud}, {c.longitud})
                </span>
              </Label>
            ))}
          </div>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="xs"
              onClick={() =>
                setConfig((c) => ({ ...c, ciudadIds: CIUDADES.map((x) => x.id) }))
              }
            >
              Todas
            </Button>
            <Button
              variant="ghost"
              size="xs"
              onClick={() => setConfig((c) => ({ ...c, ciudadIds: [] }))}
            >
              Ninguna
            </Button>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <div className="flex flex-col gap-1">
            <Label htmlFor="fecha-inicio">Fecha inicial (UTC)</Label>
            <Input
              id="fecha-inicio"
              type="date"
              value={config.inicio}
              max={hoyUtc()}
              disabled={extrayendo}
              onChange={(e) => setConfig((c) => ({ ...c, inicio: e.target.value }))}
              aria-invalid={errores.length > 0 || undefined}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor="fecha-fin">Fecha final (UTC, incluida)</Label>
            <Input
              id="fecha-fin"
              type="date"
              value={config.fin}
              max={hoyUtc()}
              disabled={extrayendo}
              onChange={(e) => setConfig((c) => ({ ...c, fin: e.target.value }))}
              aria-invalid={errores.length > 0 || undefined}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <dl
            className="grid grid-cols-4 gap-x-3 gap-y-0.5 rounded-md bg-muted/50 px-3 py-2 text-xs lg:grid-cols-2"
            aria-label="Volumen previsto"
          >
            <dt className="text-muted-foreground">Peticiones</dt>
            <dd className="text-end font-medium tabular-nums">{fmt(volumen.peticiones)}</dd>
            <dt className="text-muted-foreground">Días</dt>
            <dd className="text-end font-medium tabular-nums">{fmt(volumen.dias)}</dd>
            <dt className="text-muted-foreground">Filas horarias</dt>
            <dd className="text-end font-medium tabular-nums">{fmt(volumen.filas)}</dd>
            <dt className="text-muted-foreground">Valores</dt>
            <dd className="text-end font-medium tabular-nums">{fmt(volumen.valores)}</dd>
          </dl>
          <Button
            size="lg"
            onClick={() => void etl.extraer()}
            disabled={extrayendo || errores.length > 0}
          >
            <DownloadSimpleIcon data-icon="inline-start" />
            {extrayendo ? "Extrayendo…" : "Extraer datos"}
          </Button>
        </div>

        {errores.length > 0 && (
          <Alert variant="destructive" className="lg:col-span-3" role="alert">
            <WarningCircleIcon />
            <AlertTitle>Revisa la configuración</AlertTitle>
            <AlertDescription>
              <ul className="list-disc ps-4">
                {errores.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
        <p className="text-[0.7rem] text-muted-foreground lg:col-span-3">
          Los últimos días pueden llegar con valores nulos: el archivo histórico
          se publica con unos días de retraso. La limpieza los rechazará y lo
          verás en la pestaña «Rechazados».
        </p>
      </CardContent>
    </Card>
  )
}
