'use client';

import { X } from 'lucide-react';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AYUDA_EN_RIESGO, etiquetaSemestre, ultimosSemestres, type FiltrosUI } from '@/lib/hours/semestre';
import type { Carrera } from '@/lib/services/catalogs';
import type { AsociacionResumen, Semestre } from '@/lib/services/horas-semestre';

export const HORAS_FILTROS_INICIALES: FiltrosUI = {
  semestre: 'actual',
  idCarrera: '',
  idAsociacion: '',
  enRiesgo: false,
};

const TODOS = '__todos__';
const SELECT = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS} data-[size=default]:h-11.5`;
const CAMPO = 'flex min-w-0 flex-col gap-tight';

interface Props {
  value: FiltrosUI;
  onChange: (value: FiltrosUI) => void;
  carreras: Carrera[];
  asociaciones: AsociacionResumen[];
  semestreActual?: Semestre;
  /** El coordinador no consulta asociaciones: sin esa lista no hay filtro por asociación. */
  conAsociaciones?: boolean;
}

export function HorasCentralFiltros({ value, onChange, carreras, asociaciones, semestreActual, conAsociaciones = true }: Props) {
  const cambiar = (parcial: Partial<FiltrosUI>) => onChange({ ...value, ...parcial });
  const semestres = semestreActual ? ultimosSemestres(semestreActual) : [];
  const asociacion = asociaciones.find((a) => String(a.idAsociacion) === value.idAsociacion);
  const idsDeAsociacion = asociacion?.carreras.map((c) => c.carrera.idCarrera);
  const carrerasVisibles = idsDeAsociacion ? carreras.filter((c) => idsDeAsociacion.includes(c.idCarrera)) : carreras;
  const hayFiltros = value.semestre !== 'actual' || value.idCarrera || value.idAsociacion || value.enRiesgo;

  return (
    <form
      role="search"
      aria-label="Filtros de horas por semestre"
      onSubmit={(e) => e.preventDefault()}
      className="grid grid-cols-1 items-end gap-stack sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto]"
    >
      <div className={CAMPO}>
        <Label htmlFor="horas-filtro-semestre">Semestre</Label>
        <Select value={value.semestre} onValueChange={(semestre) => cambiar({ semestre })}>
          <SelectTrigger id="horas-filtro-semestre" className={SELECT}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actual">Semestre actual</SelectItem>
            {semestres.map((s) => (
              <SelectItem key={`${s.anio}-${s.periodo}`} value={`${s.anio}-${s.periodo}`}>
                {etiquetaSemestre(s)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {conAsociaciones && (
        <div className={CAMPO}>
          <Label htmlFor="horas-filtro-asociacion">Asociación</Label>
          <Select
            value={value.idAsociacion || TODOS}
            onValueChange={(v) => cambiar({ idAsociacion: v === TODOS ? '' : v, idCarrera: '' })}
          >
            <SelectTrigger id="horas-filtro-asociacion" className={SELECT}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={TODOS}>Todas las asociaciones</SelectItem>
              {asociaciones
                .filter((a) => !a.archivada)
                .map((a) => (
                  <SelectItem key={a.idAsociacion} value={String(a.idAsociacion)}>
                    {a.nombre}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className={CAMPO}>
        <Label htmlFor="horas-filtro-carrera">Carrera</Label>
        <Select value={value.idCarrera || TODOS} onValueChange={(v) => cambiar({ idCarrera: v === TODOS ? '' : v })}>
          <SelectTrigger id="horas-filtro-carrera" className={SELECT}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas las carreras</SelectItem>
            {carrerasVisibles.map((c) => (
              <SelectItem key={c.idCarrera} value={String(c.idCarrera)}>
                {c.nombreCarrera}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex flex-wrap items-center gap-stack sm:col-span-2 xl:col-span-1">
        <div className="flex items-center gap-tight">
          <Switch
            id="horas-filtro-riesgo"
            checked={value.enRiesgo}
            onCheckedChange={(enRiesgo) => cambiar({ enRiesgo })}
            aria-describedby="horas-filtro-riesgo-ayuda"
          />
          <Label htmlFor="horas-filtro-riesgo">En riesgo</Label>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!hayFiltros} onClick={() => onChange(HORAS_FILTROS_INICIALES)}>
          <X aria-hidden="true" />
          Limpiar filtros
        </Button>
      </div>
      <p id="horas-filtro-riesgo-ayuda" className="type-meta sm:col-span-2 xl:col-span-4">
        {AYUDA_EN_RIESGO}
      </p>
    </form>
  );
}
