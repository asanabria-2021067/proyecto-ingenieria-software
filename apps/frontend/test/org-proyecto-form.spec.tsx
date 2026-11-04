import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import {
  cuposLibres,
  errorParticipantes,
  miembrosElegibles,
  organizacionesParaPublicar,
  participantesPayload,
  primerRolConCupo,
} from '@/lib/organizations/proyecto';
import { StepPropietario } from '@/app/dashboard/projects/mine/form/StepPropietario';
import { StepParticipantes } from '@/app/dashboard/projects/mine/form/StepParticipantes';
import { Step3 } from '@/app/dashboard/projects/mine/form/Step3';
import { newRol, type FormData } from '@/app/dashboard/projects/mine/form/types';
import type { MiembroOrganizacion, MiOrganizacion } from '@/lib/types/organizations';

const rol = (id: string, nombreRol: string, cupos: number) => ({ ...newRol(), id, nombreRol, cupos });
const roles = [rol('a', 'Desarrollo', 2), rol('b', 'Diseño', 1)];

const org = (idOrganizacion: number, extra: Partial<MiOrganizacion> = {}): MiOrganizacion => ({
  idOrganizacion,
  nombreOrganizacion: `Org ${idOrganizacion}`,
  descripcionOrganizacion: null,
  sitioWeb: null,
  logoUrl: null,
  visibilidad: 'PRIVADA',
  fechaCreacion: '2026-01-01T00:00:00.000Z',
  archivada: false,
  miRol: 'EDITOR',
  puedePublicar: true,
  totalMiembros: 3,
  totalProyectos: 0,
  ...extra,
});

const miembro = (idUsuario: number, rolOrganizacion: MiembroOrganizacion['rolOrganizacion']): MiembroOrganizacion => ({
  idUsuario,
  nombre: `Nombre${idUsuario}`,
  apellido: 'Perez',
  fotoUrl: null,
  rolOrganizacion,
  fechaIngreso: '2026-01-01T00:00:00.000Z',
});

describe('organizacionesParaPublicar', () => {
  it('incluye Propietario, Administrador y Editor; excluye Lectura y archivadas', () => {
    const lista = [
      org(1, { miRol: 'PROPIETARIO' }),
      org(2, { miRol: 'ADMINISTRADOR' }),
      org(3, { miRol: 'EDITOR' }),
      org(4, { miRol: 'LECTURA', puedePublicar: false }),
      org(5, { miRol: 'PROPIETARIO', archivada: true, puedePublicar: false }),
    ];
    expect(organizacionesParaPublicar(lista).map((o) => o.idOrganizacion)).toEqual([1, 2, 3]);
  });
});

describe('participantes', () => {
  it('los elegibles excluyen a Lectura y al lider', () => {
    const miembros = [miembro(1, 'PROPIETARIO'), miembro(2, 'EDITOR'), miembro(3, 'LECTURA'), miembro(4, 'ADMINISTRADOR')];
    expect(miembrosElegibles(miembros, 1).map((m) => m.idUsuario)).toEqual([2, 4]);
  });

  it('ocupan cupos: 6 cupos con 4 participantes dejan 2', () => {
    const seis = [rol('a', 'Dev', 6)];
    const cuatro = [2, 3, 4, 5].map((idUsuario) => ({ idUsuario, idRol: 'a' }));
    expect(cuposLibres(seis, cuatro).get('a')).toBe(2);
  });

  it('el primer rol con cupo se salta los llenos', () => {
    expect(primerRolConCupo(roles, [{ idUsuario: 9, idRol: 'a' }, { idUsuario: 8, idRol: 'a' }])).toBe('b');
    expect(primerRolConCupo(roles, [9, 8, 7].map((idUsuario, i) => ({ idUsuario, idRol: i < 2 ? 'a' : 'b' })))).toBeNull();
  });

  it('detecta rol inexistente y exceso de cupos', () => {
    expect(errorParticipantes(roles, [{ idUsuario: 2, idRol: 'zzz' }])).toMatch(/Elige un rol/);
    const exceso = [2, 3].map((idUsuario) => ({ idUsuario, idRol: 'b' }));
    expect(errorParticipantes(roles, exceso)).toContain('Diseño');
    expect(errorParticipantes(roles, [{ idUsuario: 2, idRol: 'a' }])).toBeNull();
    expect(errorParticipantes(roles, [])).toBeNull();
  });

  it('el payload manda la posicion del rol, no su id local', () => {
    expect(participantesPayload(roles, [{ idUsuario: 2, idRol: 'b' }, { idUsuario: 3, idRol: 'a' }])).toEqual([
      { idUsuario: 2, indiceRol: 1 },
      { idUsuario: 3, indiceRol: 0 },
    ]);
  });
});

describe('paso «¿A nombre de quien?»', () => {
  afterEach(() => cleanup());

  it('ofrece Personal y cada organizacion donde puedo publicar', () => {
    render(<StepPropietario organizaciones={[org(1), org(2)]} cargando={false} idOrganizacion={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /Personal/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Org 1/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Org 2/ })).toBeInTheDocument();
  });

  it('elegir una organizacion la devuelve; volver a Personal devuelve null', () => {
    const onChange = vi.fn();
    render(<StepPropietario organizaciones={[org(2)]} cargando={false} idOrganizacion={2} onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Org 2/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Personal/ }));
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('sin organizaciones explica por que y ofrece crear una', () => {
    render(<StepPropietario organizaciones={[]} cargando={false} idOrganizacion={null} onChange={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Crear una' })).toHaveAttribute('href', '/dashboard/organizaciones/nueva');
  });
});

describe('paso de participantes', () => {
  afterEach(() => cleanup());

  const miembros = [miembro(2, 'EDITOR'), miembro(3, 'ADMINISTRADOR')];

  it('marcar un miembro lo suma con el primer rol con cupo', () => {
    const onChange = vi.fn();
    render(<StepParticipantes miembros={miembros} roles={roles} participantes={[]} error={null} cargando={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sumar a Nombre2 Perez' }));
    expect(onChange).toHaveBeenCalledWith([{ idUsuario: 2, idRol: 'a' }]);
  });

  it('desmarcar lo quita', () => {
    const onChange = vi.fn();
    render(
      <StepParticipantes
        miembros={miembros}
        roles={roles}
        participantes={[{ idUsuario: 2, idRol: 'a' }]}
        error={null}
        cargando={false}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Sumar a Nombre2 Perez' }));
    expect(onChange).toHaveBeenCalledWith([]);
    expect(screen.getByRole('combobox', { name: 'Rol de proyecto de Nombre2 Perez' })).toBeInTheDocument();
  });

  it('sin roles pide definirlos primero y muestra el error recibido', () => {
    const { rerender } = render(
      <StepParticipantes miembros={miembros} roles={[]} participantes={[]} error={null} cargando={false} onChange={vi.fn()} />,
    );
    expect(screen.getByText(/Define al menos un rol/)).toBeInTheDocument();
    rerender(<StepParticipantes miembros={miembros} roles={roles} participantes={[]} error="Hay más participantes que cupos" cargando={false} onChange={vi.fn()} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Hay más participantes que cupos');
  });
});

describe('resumen del proyecto', () => {
  afterEach(() => cleanup());

  const form: FormData = {
    tituloProyecto: 'Proyecto X',
    descripcionProyecto: 'Una descripcion larga de prueba',
    tipoProyecto: 'ACADEMICO_HORAS_BECA',
    modalidadProyecto: 'VIRTUAL',
    objetivosProyecto: '',
    ubicacionProyecto: '',
    contextoAcademico: '',
    urlRecursoExterno: '',
    fechaInicio: '',
    fechaFinEstimada: '',
    fechaLimitePostulacion: '',
    roles,
  };

  it('muestra Personal por defecto', () => {
    render(<Step3 form={form} saving={false} onSubmit={vi.fn()} />);
    expect(screen.getByText('Publicado por:').parentElement).toHaveTextContent('Personal');
  });

  it('con organizacion muestra su nombre y los participantes con su rol', () => {
    render(
      <Step3
        form={form}
        saving={false}
        onSubmit={vi.fn()}
        organizacion="Grupo Robotica"
        participantes={[{ nombre: 'Ana Perez', rol: 'Desarrollo' }]}
      />,
    );
    expect(screen.getByText('Publicado por:').parentElement).toHaveTextContent('Grupo Robotica');
    expect(screen.getByText('Integrantes (1)')).toBeInTheDocument();
    expect(screen.getByText(/Ana Perez/)).toBeInTheDocument();
  });
});
