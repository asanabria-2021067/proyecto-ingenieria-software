import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { PlantillaOrganizacion } from '../lib/types/organizations';

const PLANTILLAS: PlantillaOrganizacion[] = [
  { clave: 'CLUB', etiqueta: 'Club', descripcion: 'Club estudiantil para reunirnos.' },
  { clave: 'VOLUNTARIADO', etiqueta: 'Voluntariado', descripcion: 'Grupo de voluntariado.' },
  { clave: 'OTRO', etiqueta: 'Otro', descripcion: '' },
];

const crear = vi.hoisted(() => ({ mutateAsync: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('../hooks/use-organizations', () => ({
  usePlantillasOrganizacion: () => ({ data: PLANTILLAS }),
  useCrearOrganizacion: () => crear,
  useActualizarOrganizacion: () => ({ mutateAsync: vi.fn() }),
}));
vi.mock('../lib/mensajes', () => ({ aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() } }));

import { OrgForm } from '../components/organizations/org-form';
import { PlantillaSelector } from '../components/organizations/plantilla-selector';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MEJ-156: selector de plantilla', () => {
  it('ofrece «Sin plantilla» más cada plantilla con su descripción sugerida', () => {
    render(<PlantillaSelector plantillas={PLANTILLAS} value={null} onChange={vi.fn()} />);
    expect(screen.getByRole('radio', { name: /Sin plantilla/ })).toBeChecked();
    for (const nombre of [/Club/, /Voluntariado/, /Otro/]) expect(screen.getByRole('radio', { name: nombre })).not.toBeChecked();
    expect(screen.getByText('Club estudiantil para reunirnos.')).toBeInTheDocument();
    expect(screen.getByText('Grupo de voluntariado.')).toBeInTheDocument();
  });

  it('elegir una plantilla la entrega completa; volver a «Sin plantilla» entrega null', () => {
    const onChange = vi.fn();
    const { rerender } = render(<PlantillaSelector plantillas={PLANTILLAS} value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole('radio', { name: /Club/ }));
    expect(onChange).toHaveBeenLastCalledWith(PLANTILLAS[0]);
    rerender(<PlantillaSelector plantillas={PLANTILLAS} value="CLUB" onChange={onChange} />);
    expect(screen.getByRole('radio', { name: /Club/ })).toBeChecked();
    fireEvent.click(screen.getByRole('radio', { name: /Sin plantilla/ }));
    expect(onChange).toHaveBeenLastCalledWith(null);
  });
});

describe('MEJ-156: formulario de nueva organización con plantilla', () => {
  const nombre = () => screen.getByLabelText(/Nombre/);
  const descripcion = () => screen.getByLabelText('Descripción') as HTMLTextAreaElement;

  it('sugiere la descripción, la persona la edita y se envía la descripción editada', async () => {
    crear.mutateAsync.mockResolvedValue({ idOrganizacion: 5 });
    render(<OrgForm />);
    fireEvent.change(nombre(), { target: { value: 'Club de Robótica' } });
    fireEvent.click(screen.getByRole('radio', { name: /Club/ }));
    expect(descripcion().value).toBe('Club estudiantil para reunirnos.');

    fireEvent.change(descripcion(), { target: { value: 'Club estudiantil de robótica y electrónica.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));

    await waitFor(() => expect(crear.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crear.mutateAsync.mock.calls[0][0]).toMatchObject({
      nombreOrganizacion: 'Club de Robótica',
      descripcionOrganizacion: 'Club estudiantil de robótica y electrónica.',
      visibilidad: 'PRIVADA',
    });
  });

  it('cambiar de plantilla reemplaza la sugerencia anterior pero nunca pisa lo que la persona escribió', () => {
    render(<OrgForm />);
    fireEvent.click(screen.getByRole('radio', { name: /Club/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Voluntariado/ }));
    expect(descripcion().value).toBe('Grupo de voluntariado.');

    fireEvent.change(descripcion(), { target: { value: 'Mi propio texto' } });
    fireEvent.click(screen.getByRole('radio', { name: /Club/ }));
    expect(descripcion().value).toBe('Mi propio texto');
  });

  it('sin plantilla no se envía el campo plantilla', async () => {
    crear.mutateAsync.mockResolvedValue({ idOrganizacion: 5 });
    render(<OrgForm />);
    fireEvent.change(nombre(), { target: { value: 'Grupo libre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    fireEvent.click(screen.getByRole('button', { name: 'Crear organización' }));
    await waitFor(() => expect(crear.mutateAsync).toHaveBeenCalledTimes(1));
    expect(crear.mutateAsync.mock.calls[0][0]).not.toHaveProperty('plantilla');
    expect(crear.mutateAsync.mock.calls[0][0].descripcionOrganizacion).toBeUndefined();
  });
});
