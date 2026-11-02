'use client';

import { X } from 'lucide-react';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { FILTROS_ASOCIACION_INICIALES, hayFiltrosAsociacion, type FiltrosAsociacionUI } from '@/lib/asociaciones/vista';
import { AYUDA_EN_RIESGO, etiquetaSemestre, ultimosSemestres } from '@/lib/hours/semestre';
import type { Semestre } from '@/lib/services/horas-semestre';

const SELECT = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS} data-[size=default]:h-11.5`;
const CAMPO = 'flex min-w-0 flex-col gap-tight';
const TIPOS = [
  { valor: 'todos', etiqueta: 'Todas' },
  { valor: 'BECA', etiqueta: 'Beca' },
  { valor: 'EXTENSION', etiqueta: 'Extensión' },
] as const;

interface Props {
  value: FiltrosAsociacionUI;
  onChange: (value: FiltrosAsociacionUI) => void;
  /** Lo que se escribe en el buscador; `value.busqueda` es la versión ya aplicada. */
  texto: string;
  onTexto: (texto: string) => void;
  semestreActual?: Semestre;
}

export function AsociacionFiltros({ value, onChange, texto, onTexto, semestreActual }: Props) {
  const cambiar = (parcial: Partial<FiltrosAsociacionUI>) => onChange({ ...value, ...parcial });
  const semestres = semestreActual ? ultimosSemestres(semestreActual) : [];
  const limpiar = () => {
    onTexto('');
    onChange(FILTROS_ASOCIACION_INICIALES);
  };

  return (
    <form
      role="search"
      aria-label="Filtros de estudiantes de la asociación"
      onSubmit={(e) => e.preventDefault()}
      className="grid grid-cols-1 items-end gap-stack sm:grid-cols-2 xl:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))_auto]"
    >
      <div className={`${CAMPO} sm:col-span-2 xl:col-span-1`}>
        <Label htmlFor="aso-filtro-busqueda">Buscar</Label>
        <DashboardSearchField
          id="aso-filtro-busqueda"
          value={texto}
          onChange={(e) => onTexto(e.target.value)}
          placeholder="Nombre, apellido o carné"
          autoComplete="off"
          maxLength={100}
        />
      </div>

      <div className={CAMPO}>
        <Label htmlFor="aso-filtro-semestre">Semestre</Label>
        <Select value={value.semestre} onValueChange={(semestre) => cambiar({ semestre })}>
          <SelectTrigger id="aso-filtro-semestre" className={SELECT}>
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

      <div className={CAMPO}>
        <span id="aso-filtro-tipo-rotulo" className="text-sm font-medium leading-none">
          Tipo de horas
        </span>
        <ToggleGroup
          type="single"
          variant="outline"
          aria-labelledby="aso-filtro-tipo-rotulo"
          value={value.tipo}
          onValueChange={(tipo) => tipo && cambiar({ tipo: tipo as FiltrosAsociacionUI['tipo'] })}
          className="h-11.5 w-full"
        >
          {TIPOS.map((t) => (
            <ToggleGroupItem key={t.valor} value={t.valor} className="h-full flex-1 px-3">
              {t.etiqueta}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>

      <div className="flex flex-wrap items-center gap-stack sm:col-span-2 xl:col-span-1">
        <div className="flex items-center gap-tight">
          <Switch
            id="aso-filtro-riesgo"
            checked={value.enRiesgo}
            onCheckedChange={(enRiesgo) => cambiar({ enRiesgo })}
            aria-describedby="aso-filtro-riesgo-ayuda"
          />
          <Label htmlFor="aso-filtro-riesgo">En riesgo</Label>
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!hayFiltrosAsociacion(value) && texto === ''} onClick={limpiar}>
          <X aria-hidden="true" />
          Limpiar filtros
        </Button>
      </div>
      <p id="aso-filtro-riesgo-ayuda" className="type-meta sm:col-span-2 xl:col-span-4">
        {AYUDA_EN_RIESGO}
      </p>
    </form>
  );
}
