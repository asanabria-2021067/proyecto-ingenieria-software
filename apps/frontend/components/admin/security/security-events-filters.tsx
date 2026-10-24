'use client';

import { X } from 'lucide-react';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  SECURITY_EVENT_LABEL,
  SECURITY_EVENTS_NO_FILTERS,
  hasSecurityEventsFilters,
  type SecurityEventsFilterErrors,
  type SecurityEventsFilterValue,
} from '@/lib/admin/security-events';
import { SECURITY_EVENT_TYPES, isSecurityEventType, type SecurityEventType } from '@/lib/types/admin-security';

const TODOS = '__todos__';
const CAMPO = 'flex min-w-0 flex-col gap-tight';
// Los cuatro controles comparten la clase de los filtros del dashboard: 46 px de alto y el mismo
// borde, radio, fondo y foco que el buscador y los selects de Mis Tareas o Mis Proyectos.
const CONTROL = DASHBOARD_FILTER_TRIGGER_CLASS;
// El disparador del select trae su alto en una variante (`data-[size=default]:h-9`) que gana a
// una clase simple: se iguala con la misma variante.
const SELECT = `w-full ${CONTROL} data-[size=default]:h-11.5`;
// Mismo botón compacto que «Ver perfil» en Gestión de Usuarios; el realce solo aplica cuando está activo.
const LIMPIAR =
  'flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-surface-container-high px-3 py-1.5 text-xs font-bold text-on-surface motion-control motion-focus enabled:hover:bg-primary enabled:hover:text-on-primary disabled:cursor-not-allowed disabled:opacity-50';
const ERROR = 'type-meta text-error';

/**
 * Filtros del visor de eventos de seguridad (T-310): tipo, rango de fechas e
 * ID de usuario, combinables, sobre el fondo de la página (sin tarjeta). Es controlado; la página decide cuándo unos
 * filtros son válidos y se convierten en consulta.
 */
export function SecurityEventsFilters({
  value,
  errors,
  onChange,
  tipos = SECURITY_EVENT_TYPES,
}: {
  value: SecurityEventsFilterValue;
  errors: SecurityEventsFilterErrors;
  onChange: (value: SecurityEventsFilterValue) => void;
  /** Tipos que ofrece el backend; por defecto, el catálogo completo. */
  tipos?: readonly SecurityEventType[];
}) {
  const cambiar = (parcial: Partial<SecurityEventsFilterValue>) => onChange({ ...value, ...parcial });

  return (
    <form
      role="search"
      aria-label="Filtros de eventos de seguridad"
      onSubmit={(event) => event.preventDefault()}
      className="grid grid-cols-1 items-start gap-stack sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]"
    >
      {/* Sobre los campos y siempre montado (deshabilitado sin filtros), para que la rejilla no salte. */}
      <div className="flex justify-end sm:col-span-2 xl:col-span-4">
        <button
          type="button"
          disabled={!hasSecurityEventsFilters(value)}
          onClick={() => onChange(SECURITY_EVENTS_NO_FILTERS)}
          className={LIMPIAR}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          Limpiar filtros
        </button>
      </div>

      <div className={CAMPO}>
        <Label htmlFor="filtro-tipo">Tipo de evento</Label>
        <Select value={value.tipo || TODOS} onValueChange={(tipo) => cambiar({ tipo: isSecurityEventType(tipo) ? tipo : '' })}>
          <SelectTrigger id="filtro-tipo" className={SELECT}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todos los tipos</SelectItem>
            {tipos.map((tipo) => (
              <SelectItem key={tipo} value={tipo}>
                {SECURITY_EVENT_LABEL[tipo]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className={CAMPO}>
        <Label htmlFor="filtro-desde">Desde</Label>
        <Input
          id="filtro-desde"
          type="date"
          className={CONTROL}
          value={value.desde}
          max={value.hasta || undefined}
          onChange={(event) => cambiar({ desde: event.target.value })}
          aria-invalid={errors.desde ? true : undefined}
          aria-describedby={errors.desde ? 'filtro-desde-error' : 'filtro-fechas-ayuda'}
        />
        {errors.desde && (
          <p id="filtro-desde-error" role="alert" className={ERROR}>
            {errors.desde}
          </p>
        )}
      </div>

      <div className={CAMPO}>
        <Label htmlFor="filtro-hasta">Hasta</Label>
        <Input
          id="filtro-hasta"
          type="date"
          className={CONTROL}
          value={value.hasta}
          min={value.desde || undefined}
          onChange={(event) => cambiar({ hasta: event.target.value })}
          aria-invalid={errors.hasta ? true : undefined}
          aria-describedby={errors.hasta ? 'filtro-hasta-error' : 'filtro-fechas-ayuda'}
        />
        {errors.hasta && (
          <p id="filtro-hasta-error" role="alert" className={ERROR}>
            {errors.hasta}
          </p>
        )}
      </div>

      <div className={CAMPO}>
        <Label htmlFor="filtro-usuario">ID de usuario</Label>
        <Input
          id="filtro-usuario"
          type="text"
          className={CONTROL}
          inputMode="numeric"
          autoComplete="off"
          placeholder="Actor o cuenta afectada"
          value={value.idUsuario}
          onChange={(event) => cambiar({ idUsuario: event.target.value })}
          aria-invalid={errors.idUsuario ? true : undefined}
          aria-describedby={errors.idUsuario ? 'filtro-usuario-error' : undefined}
        />
        {errors.idUsuario && (
          <p id="filtro-usuario-error" role="alert" className={ERROR}>
            {errors.idUsuario}
          </p>
        )}
      </div>

      <p id="filtro-fechas-ayuda" className="type-meta sm:col-span-2 xl:col-span-4">
        Las fechas son días completos en hora de Guatemala e incluyen ambos extremos.
      </p>
    </form>
  );
}
