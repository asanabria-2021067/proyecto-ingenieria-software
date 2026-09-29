import '@testing-library/jest-dom/vitest';
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { normalizeUrlInput, safeExternalHref } from '../lib/security/safe-url';
import { SafeExternalLink } from '../components/profile/safe-external-link';

const perfilUsuario = vi.hoisted(() => ({
  idUsuario: 5,
  nombre: 'Ana',
  apellido: 'Pérez',
  correo: 'ana@uvg.edu.gt',
  estado: 'ACTIVO',
  fotoUrl: null,
  roles: [],
  habilidades: [],
  intereses: [],
  cualidades: [],
  experiencias: [],
  perfil: {
    biografia: '',
    carne: '20001',
    semestre: 3,
    disponibilidadHorasSemana: 10,
    carrera: { nombreCarrera: 'Sistemas' },
    // Datos heredados de antes de la validación del backend (G07-C08).
    enlacePortafolio: 'javascript:alert(document.cookie)',
    githubUrl: 'https://github.com/ana',
    linkedinUrl: 'data:text/html,<script>alert(1)</script>',
    urlCv: 'vbscript:msgbox(1)',
  },
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock('../hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: perfilUsuario, isLoading: false }),
  isAdminUser: () => false,
}));
vi.mock('../lib/services/users', () => ({ getDashboardStats: () => new Promise(() => undefined) }));
vi.mock('../lib/services/admin', () => ({ getAdminUserDetail: () => new Promise(() => undefined) }));

import PerfilPage from '../app/dashboard/perfil/page';

/**
 * G07-C09 · OWASP25-C027. Los enlaces de perfil solo son clicables con una
 * URL http(s); un valor heredado peligroso se muestra como texto inerte. Los
 * formularios recortan espacios y no envían cadenas en blanco.
 */

afterEach(() => cleanup());

describe('safeExternalHref', () => {
  it.each([
    ['https://github.com/ana', 'https://github.com/ana'],
    ['http://portafolio.example/ana?x=1#y', 'http://portafolio.example/ana?x=1#y'],
    ['HTTPS://LinkedIn.com/in/ana', 'https://linkedin.com/in/ana'],
  ])('%s es clicable', (value, href) => {
    expect(safeExternalHref(value)).toBe(href);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' javascript:alert(1)',
    'java\tscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'ftp://archivos.example/cv.pdf',
    'https-app://abrir',
    'github.com/ana',
    '//github.com/ana',
    'https://',
    '​https://github.com/ana',
    '',
    null,
    undefined,
  ])('%j no produce href', (value) => {
    expect(safeExternalHref(value as string | null | undefined)).toBeNull();
  });
});

describe('SafeExternalLink', () => {
  it('http(s) → enlace en pestaña nueva sin opener', () => {
    render(<SafeExternalLink url="https://github.com/ana">GitHub</SafeExternalLink>);
    const link = screen.getByRole('link', { name: 'GitHub' });
    expect(link).toHaveAttribute('href', 'https://github.com/ana');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:msgbox(1)', 'github.com/ana'])(
    'dato heredado %j → texto inerte, ningún href en el documento',
    (url) => {
      const { container } = render(<SafeExternalLink url={url}>Portafolio</SafeExternalLink>);
      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.getByText('Portafolio')).toBeInTheDocument();
      expect(container.querySelector('[href]')).toBeNull();
    },
  );
});

describe('página de perfil con datos heredados', () => {
  it('solo el enlace http(s) es clicable; javascript:, data: y vbscript: quedan como texto inerte', () => {
    const { container } = render(createElement(PerfilPage));

    expect(screen.getByRole('link', { name: /GitHub/ })).toHaveAttribute('href', 'https://github.com/ana');
    for (const etiqueta of [/Portafolio/, /LinkedIn/, /CV/]) {
      expect(screen.queryByRole('link', { name: etiqueta })).toBeNull();
    }
    const hrefs = [...container.querySelectorAll('[href]')].map((element) => element.getAttribute('href') ?? '');
    expect(hrefs.filter((href) => /^\s*(javascript|data|vbscript):/i.test(href))).toEqual([]);
  });
});

describe('normalizeUrlInput', () => {
  it('recorta espacios y manda undefined para un campo vacío o en blanco', () => {
    expect(normalizeUrlInput('  https://github.com/ana  ')).toBe('https://github.com/ana');
    expect(normalizeUrlInput('')).toBeUndefined();
    expect(normalizeUrlInput('   ')).toBeUndefined();
    expect(normalizeUrlInput(null)).toBeUndefined();
    expect(normalizeUrlInput(undefined)).toBeUndefined();
  });
});
