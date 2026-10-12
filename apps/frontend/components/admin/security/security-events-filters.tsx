'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
const ERROR = 'type-meta text-error';

/**
 * Filtros del visor de eventos de seguridad (T-310): tipo, rango de fechas e
 * ID de usuario, combinables. Es controlado; la página decide cuándo unos
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
      className="card-base grid grid-cols-1 items-start gap-stack p-card sm:grid-cols-2 xl:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))_auto]"
    >
      <div className={CAMPO}>
        <Label htmlFor="filtro-tipo">Tipo de evento</Label>
        <Select value={value.tipo || TODOS} onValueChange={(tipo) => cambiar({ tipo: isSecurityEventType(tipo) ? tipo : '' })}>
          <SelectTrigger id="filtro-tipo" className="w-full">
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

      <div className="flex sm:col-span-2 xl:col-span-1 xl:pt-[1.375rem]">
        <Button
          type="button"
          variant="outline"
          disabled={!hasSecurityEventsFilters(value)}
          onClick={() => onChange(SECURITY_EVENTS_NO_FILTERS)}
          className="w-full rounded-control xl:w-auto"
        >
          <X aria-hidden="true" />
          Limpiar
        </Button>
      </div>

      <p id="filtro-fechas-ayuda" className="type-meta sm:col-span-2 xl:col-span-5">
        Las fechas son días completos en hora de Guatemala e incluyen ambos extremos.
      </p>
    </form>
  );
}
