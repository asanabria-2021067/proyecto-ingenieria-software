'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CARGO_LABEL, NIVEL_LABEL } from '@/lib/asociaciones/vista';
import { listAdminUsers } from '@/lib/services/admin';
import type { AsignarJuntaInput, CargoJunta, NivelPermisoJunta } from '@/lib/services/asociaciones';

const LABEL = 'mb-1 block text-sm font-semibold text-text-primary';
const SELECT =
  'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm text-text-primary focus-visible:border-primary focus-visible:outline-none';

/** Nombrar a un integrante de la junta: busca entre usuarios activos y elige cargo (el nivel por defecto sale del cargo). */
export function JuntaFormDialog({
  isPending,
  ocupados,
  onSubmit,
  onClose,
}: {
  isPending: boolean;
  /** Usuarios que ya tienen cargo en esta junta. */
  ocupados: number[];
  onSubmit: (input: AsignarJuntaInput) => void;
  onClose: () => void;
}) {
  const [busqueda, setBusqueda] = useState('');
  const [texto, setTexto] = useState('');
  const [elegido, setElegido] = useState<{ idUsuario: number; nombre: string } | null>(null);
  const [cargo, setCargo] = useState<CargoJunta>('VOCAL');
  const [nivel, setNivel] = useState<'' | NivelPermisoJunta>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setTexto(busqueda.trim()), 300);
    return () => clearTimeout(t);
  }, [busqueda]);

  const { data } = useQuery({
    queryKey: ['admin', 'usuarios', 'junta', texto],
    queryFn: () => listAdminUsers({ search: texto, estado: 'ACTIVO', limit: 8 }),
    enabled: texto.length >= 2,
  });
  const resultados = (data?.data ?? []).filter((u) => !ocupados.includes(u.idUsuario));

  return (
    <Dialog open onOpenChange={(abierto) => !abierto && onClose()}>
      <DialogContent>
        <form
          noValidate
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            if (!elegido) return setError('Busca y elige a la persona que ocupará el cargo.');
            setError(null);
            onSubmit({ idUsuario: elegido.idUsuario, cargo, ...(nivel && { nivelPermiso: nivel }) });
          }}
        >
          <DialogHeader>
            <DialogTitle>Nombrar integrante de la junta</DialogTitle>
            <DialogDescription>Solo se puede nombrar a usuarios activos. La persona recibirá un aviso.</DialogDescription>
          </DialogHeader>

          <div>
            <label htmlFor="junta-busqueda" className={LABEL}>
              Persona
            </label>
            <Input
              id="junta-busqueda"
              placeholder="Nombre o correo"
              autoComplete="off"
              value={busqueda}
              onChange={(e) => {
                setBusqueda(e.target.value);
                setElegido(null);
              }}
            />
            {elegido ? (
              <p className="type-meta mt-tight" role="status">
                Elegida: <span className="font-semibold text-text-primary">{elegido.nombre}</span>
              </p>
            ) : (
              resultados.length > 0 && (
                <ul className="mt-tight divide-y divide-outline-variant/50 rounded-md border border-outline-variant" aria-label="Resultados">
                  {resultados.map((u) => (
                    <li key={u.idUsuario}>
                      <button
                        type="button"
                        className="w-full px-inline py-tight text-left hover:bg-surface-container-low"
                        onClick={() => setElegido({ idUsuario: u.idUsuario, nombre: `${u.nombre} ${u.apellido}` })}
                      >
                        <span className="type-body block font-semibold">
                          {u.nombre} {u.apellido}
                        </span>
                        <span className="type-meta block">{u.correo}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <div className="grid grid-cols-1 gap-stack sm:grid-cols-2">
            <div>
              <label htmlFor="junta-cargo" className={LABEL}>
                Cargo
              </label>
              <select id="junta-cargo" className={SELECT} value={cargo} onChange={(e) => setCargo(e.target.value as CargoJunta)}>
                {Object.entries(CARGO_LABEL).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="junta-nivel" className={LABEL}>
                Nivel de permiso
              </label>
              <select id="junta-nivel" className={SELECT} value={nivel} onChange={(e) => setNivel(e.target.value as '' | NivelPermisoJunta)}>
                <option value="">Según el cargo</option>
                {Object.entries(NIVEL_LABEL).map(([valor, etiqueta]) => (
                  <option key={valor} value={valor}>
                    {etiqueta}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && (
            <p role="alert" className="type-meta text-error">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Guardando...' : 'Nombrar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
