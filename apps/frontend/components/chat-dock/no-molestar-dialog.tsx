'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useNoMolestar, useUpdateNoMolestar } from '@/hooks/use-chat';
import type { ConfigNoMolestar } from '@/lib/types/chat';

const DIAS = [
  { valor: 1, nombre: 'Lunes' },
  { valor: 2, nombre: 'Martes' },
  { valor: 3, nombre: 'Miércoles' },
  { valor: 4, nombre: 'Jueves' },
  { valor: 5, nombre: 'Viernes' },
  { valor: 6, nombre: 'Sábado' },
  { valor: 0, nombre: 'Domingo' },
];

const ZONAS = [
  'America/Guatemala',
  'America/Mexico_City',
  'America/Bogota',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/Madrid',
  'UTC',
];

const POR_DEFECTO: ConfigNoMolestar = {
  activo: false,
  horaInicio: '22:00',
  horaFin: '07:00',
  diasSemana: [0, 1, 2, 3, 4, 5, 6],
  zona: 'America/Guatemala',
};

interface NoMolestarDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function NoMolestarDialog({ open, onOpenChange }: NoMolestarDialogProps) {
  const { config, isLoading } = useNoMolestar();
  const guardar = useUpdateNoMolestar();
  // Borrador local: hasta que el usuario edita, se muestra lo guardado.
  const [borrador, setBorrador] = useState<ConfigNoMolestar | null>(null);
  const form = borrador ?? config ?? POR_DEFECTO;
  const setForm = (cambio: (f: ConfigNoMolestar) => ConfigNoMolestar) => setBorrador(cambio(form));

  const invalido = form.horaInicio === form.horaFin || !form.horaInicio || !form.horaFin;
  const zonas = ZONAS.includes(form.zona) ? ZONAS : [form.zona, ...ZONAS];

  const toggleDia = (dia: number, marcado: boolean) =>
    setForm((f) => ({
      ...f,
      diasSemana: marcado ? [...f.diasSemana, dia] : f.diasSemana.filter((d) => d !== dia),
    }));

  const handleGuardar = () => {
    guardar.mutate(form, {
      onSuccess: () => {
        toast.success('Preferencia de no molestar guardada');
        onOpenChange(false);
      },
      onError: () => toast.error('No se pudo guardar la preferencia'),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>No molestar</DialogTitle>
          <DialogDescription>
            Durante este horario el chat no cuenta mensajes sin leer en el icono de Mensajes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <Label htmlFor="no-molestar-activo">Activar no molestar</Label>
            <Switch
              id="no-molestar-activo"
              checked={form.activo}
              disabled={isLoading}
              onCheckedChange={(activo) => setForm((f) => ({ ...f, activo }))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="no-molestar-inicio">Desde</Label>
              <Input
                id="no-molestar-inicio"
                type="time"
                value={form.horaInicio}
                onChange={(e) => setForm((f) => ({ ...f, horaInicio: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="no-molestar-fin">Hasta</Label>
              <Input
                id="no-molestar-fin"
                type="time"
                value={form.horaFin}
                onChange={(e) => setForm((f) => ({ ...f, horaFin: e.target.value }))}
              />
            </div>
          </div>
          <p className="text-xs text-text-secondary">
            Si la hora final es menor que la inicial, el horario cruza la medianoche y cuenta el día en que empieza.
          </p>

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-on-surface">Días</legend>
            <div className="grid grid-cols-2 gap-2">
              {DIAS.map((d) => (
                <div key={d.valor} className="flex items-center gap-2">
                  <Checkbox
                    id={`no-molestar-dia-${d.valor}`}
                    checked={form.diasSemana.includes(d.valor)}
                    onCheckedChange={(v) => toggleDia(d.valor, v === true)}
                  />
                  <Label htmlFor={`no-molestar-dia-${d.valor}`} className="font-normal">
                    {d.nombre}
                  </Label>
                </div>
              ))}
            </div>
          </fieldset>

          <div className="space-y-1">
            <Label htmlFor="no-molestar-zona">Zona horaria</Label>
            <select
              id="no-molestar-zona"
              value={form.zona}
              onChange={(e) => setForm((f) => ({ ...f, zona: e.target.value }))}
              className="h-9 w-full rounded-control border border-outline-variant bg-surface-container-lowest px-3 text-sm text-on-surface"
            >
              {zonas.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>
          </div>

          {invalido && (
            <p role="alert" className="text-xs text-destructive">
              La hora de inicio y la de fin deben ser distintas.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleGuardar} disabled={invalido || guardar.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
