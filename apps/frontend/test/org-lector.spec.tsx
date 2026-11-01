import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { esLectorDeOrganizacion } from '@/lib/organizations/lector';

const lector = vi.hoisted(() => ({ valor: { soloLectura: false, organizacion: null as string | null } }));
vi.mock('@/hooks/use-lector-organizacion', () => ({ useLectorOrganizacion: () => lector.valor }));

import { OrgSoloLecturaBanner } from '@/components/organizations/org-solo-lectura-banner';

const base = {
  idUsuario: 9,
  idLider: 1,
  idsParticipantes: [2, 3],
  idsOrganizacionesProyecto: [5],
  idsMisOrganizaciones: [5, 6],
};

describe('esLectorDeOrganizacion', () => {
  it('miembro de la organizacion dueña que no participa: solo lectura', () => {
    expect(esLectorDeOrganizacion(base)).toBe(true);
  });

  it('el lider y los participantes no son lectores', () => {
    expect(esLectorDeOrganizacion({ ...base, idUsuario: 1 })).toBe(false);
    expect(esLectorDeOrganizacion({ ...base, idUsuario: 2 })).toBe(false);
  });

  it('quien no es miembro de la organizacion dueña no es lector', () => {
    expect(esLectorDeOrganizacion({ ...base, idsMisOrganizaciones: [6] })).toBe(false);
  });

  it('un proyecto personal (sin organizacion) no tiene lectores', () => {
    expect(esLectorDeOrganizacion({ ...base, idsOrganizacionesProyecto: [] })).toBe(false);
  });

  it('sin sesion o sin proyecto cargado no afirma nada', () => {
    expect(esLectorDeOrganizacion({ ...base, idUsuario: null })).toBe(false);
    expect(esLectorDeOrganizacion({ ...base, idLider: null })).toBe(false);
  });
});

describe('OrgSoloLecturaBanner', () => {
  beforeEach(() => {
    lector.valor = { soloLectura: false, organizacion: null };
  });
  afterEach(() => cleanup());

  it('no pinta nada si el usuario participa o lidera', () => {
    const { container } = render(<OrgSoloLecturaBanner proyecto={undefined} participantes={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('avisa de la solo lectura y nombra la organizacion', () => {
    lector.valor = { soloLectura: true, organizacion: 'Grupo Robotica' };
    render(<OrgSoloLecturaBanner proyecto={undefined} participantes={[]} />);
    const aviso = screen.getByRole('status');
    expect(aviso).toHaveTextContent('Solo lectura.');
    expect(aviso).toHaveTextContent('Grupo Robotica');
    expect(aviso).toHaveTextContent('sin crear ni mover tareas ni registrar horas');
  });
});
