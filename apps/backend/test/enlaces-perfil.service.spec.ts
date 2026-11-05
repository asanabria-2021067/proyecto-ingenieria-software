import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { EnlacesPerfilService, normalizarEnlace, tipoDeEnlace } from '../src/perfil-portafolio/enlaces-perfil.service';

function build() {
  const prisma = {
    usuario: { findFirst: vi.fn().mockResolvedValue({ idUsuario: 2 }) },
    enlacePerfil: {
      findMany: vi.fn().mockResolvedValue([
        { idEnlace: 1, url: 'https://github.com/ana' },
        { idEnlace: 2, url: 'https://ana.dev/' },
      ]),
      deleteMany: vi.fn().mockReturnValue('borrar'),
      createMany: vi.fn().mockReturnValue('crear'),
    },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  const preview = { preview: vi.fn() };
  return { prisma, preview, service: new EnlacesPerfilService(prisma as never, preview as never) };
}

describe('normalizarEnlace (SSRF y esquema)', () => {
  it('acepta https con dominio publico', () => {
    expect(normalizarEnlace(' https://github.com/ana ')).toBe('https://github.com/ana');
    expect(normalizarEnlace('https://www.behance.net/ana')).toBe('https://www.behance.net/ana');
  });

  it.each([
    'http://github.com/ana',
    'ftp://ana.dev',
    'javascript:alert(1)',
    'data:text/html,hola',
    'https://user:pass@ana.dev',
    'https://ana.dev:8443',
    'https://localhost',
    'https://intranet',
    'https://127.0.0.1',
    'https://169.254.169.254/latest',
    'https://[::1]/',
    'https://10.0.0.5',
    'no es una url',
    `https://ana.dev/${'a'.repeat(2100)}`,
  ])('rechaza %s', (url) => {
    expect(() => normalizarEnlace(url)).toThrow(BadRequestException);
  });
});

describe('tipoDeEnlace', () => {
  it('reconoce GitHub, LinkedIn y Behance (tambien subdominios) y deja el resto como sitio propio', () => {
    expect(tipoDeEnlace('https://github.com/ana')).toBe('GITHUB');
    expect(tipoDeEnlace('https://www.linkedin.com/in/ana')).toBe('LINKEDIN');
    expect(tipoDeEnlace('https://behance.net/ana')).toBe('BEHANCE');
    expect(tipoDeEnlace('https://evilgithub.com/ana')).toBe('SITIO');
    expect(tipoDeEnlace('https://ana.dev')).toBe('SITIO');
  });
});

describe('EnlacesPerfilService', () => {
  it('listar usa la vista previa del chat y no falla si una no se puede generar', async () => {
    const { preview, service } = build();
    preview.preview.mockResolvedValueOnce({ url: 'https://github.com/ana', titulo: 'ana', descripcion: null, sitio: 'GitHub' });
    preview.preview.mockRejectedValueOnce(new Error('no'));
    await expect(service.listar(1, 2)).resolves.toEqual([
      { idEnlace: 1, url: 'https://github.com/ana', tipo: 'GITHUB', titulo: 'ana', sitio: 'GitHub' },
      { idEnlace: 2, url: 'https://ana.dev/', tipo: 'SITIO', titulo: null, sitio: 'ana.dev' },
    ]);
  });

  it('listar respeta la privacidad del directorio', async () => {
    const { prisma, service } = build();
    prisma.usuario.findFirst.mockResolvedValue(null);
    await expect(service.listar(1, 2)).rejects.toThrow('no encontrado');
  });

  it('reemplazar limita a 5 enlaces y no escribe si alguno es invalido', async () => {
    const { prisma, service } = build();
    const seis = Array.from({ length: 6 }, (_, i) => `https://sitio${i}.dev`);
    await expect(service.reemplazar(7, seis)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.reemplazar(7, ['https://ana.dev', 'http://mala.dev'])).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('reemplazar escribe solo para el usuario recibido, normalizado y sin repetidos', async () => {
    const { prisma, preview, service } = build();
    preview.preview.mockResolvedValue(null);
    await service.reemplazar(7, ['https://github.com/ana', 'https://github.com/ana', 'https://ana.dev']);
    expect(prisma.enlacePerfil.deleteMany).toHaveBeenCalledWith({ where: { idUsuario: 7 } });
    expect(prisma.enlacePerfil.createMany).toHaveBeenCalledWith({
      data: [
        { idUsuario: 7, url: 'https://github.com/ana', orden: 0 },
        { idUsuario: 7, url: 'https://ana.dev/', orden: 1 },
      ],
    });
  });
});
