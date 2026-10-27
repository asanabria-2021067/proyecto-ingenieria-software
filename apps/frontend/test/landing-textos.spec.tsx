import '@testing-library/jest-dom/vitest';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

/**
 * IESUC-568 (RTF 2 · 3.10): la landing se escribe con tildes, ñ y signos de
 * apertura, y siempre en tuteo. Las animaciones se reemplazan por contenedores
 * planos: aquí solo importa el texto que ve la persona.
 */

vi.mock('next/image', () => ({
  default: ({ alt }: { alt: string }) => createElement('img', { alt }),
}));
vi.mock('next/dynamic', () => ({ default: () => () => null }));
vi.mock('@/components/theme-toggle', () => ({ ThemeToggle: () => null }));
vi.mock('@/components/ui/timeline-animation', () => ({
  TimelineContent: ({ children, as = 'div' }: { children?: ReactNode; as?: string }) => createElement(as, null, children),
}));
vi.mock('@/components/ui/vertical-cut-reveal', () => ({
  VerticalCutReveal: ({ children }: { children?: ReactNode }) => createElement('span', null, children),
}));
vi.mock('@/components/ui/container-scroll-animation', () => ({
  ContainerScroll: ({ titleComponent, children }: { titleComponent?: ReactNode; children?: ReactNode }) =>
    createElement('div', null, titleComponent, children),
}));
vi.mock('gsap', () => {
  const timeline = () => new Proxy({}, { get: (_t, _p, self) => () => self });
  return { gsap: { registerPlugin: vi.fn(), to: vi.fn(), set: vi.fn(), timeline, context: () => ({ revert: vi.fn() }) } };
});
vi.mock('gsap/ScrollTrigger', () => ({ ScrollTrigger: {} }));

import Navbar from '@/components/landing/Navbar';
import CTABanner from '@/components/landing/CTABanner';
import FeaturesGrid from '@/components/landing/FeaturesGrid';
import Footer from '@/components/landing/Footer';
import FormalizaExperienceSection from '@/components/landing/FormalizaExperienceSection';
import HowItWorks from '@/components/landing/HowItWorks';
import IndividualProjectsSection from '@/components/landing/IndividualProjectsSection';
import OrganizationsSection from '@/components/landing/OrganizationsSection';
import { CinematicHero } from '@/components/ui/cinematic-landing-hero';

afterEach(cleanup);

const SECCIONES = [
  ['Navbar', Navbar],
  ['CTABanner', CTABanner],
  ['FeaturesGrid', FeaturesGrid],
  ['Footer', Footer],
  ['FormalizaExperienceSection', FormalizaExperienceSection],
  ['HowItWorks', HowItWorks],
  ['IndividualProjectsSection', IndividualProjectsSection],
  ['OrganizationsSection', OrganizationsSection],
  ['CinematicHero', CinematicHero],
] as const;

/** Formas sin tilde/ñ o en voseo que la RTF encontró (o que tenían el mismo problema). */
const PROHIBIDAS = [
  /\bSesion\b/i, /\bQue problema\b/, /\bGestion\b/, /\borganizacion\b/i, /\bautomaticamente\b/i,
  /\bcolaboracion\b/i, /\bTenes\b/, /\bPodes\b/, /\bdescubri\b/, /\bduenos\b/, /\bextension\b/i,
  /\bacademic[ao]s?\b/i, /\bpostulate\b/i, /\bPostulacion\b/, /\bNotificacion\b/, /\bSolucion\b/,
  /\bComo [Ff]unciona\b/, /\bPolitica\b/, /\bTerminos\b/, /\bcatedra\b/, /\bmultiples\b/, /\bautomaticos\b/,
  /\bimprovisacion\b/, /\bdecision\b/, /\binteres\b/, /\ba quien\b/, /\brapida\b/,
];

/** Texto visible más los nombres accesibles (alt, aria-label). */
function textoVisible(container: HTMLElement): string {
  const atributos = [...container.querySelectorAll('[alt], [aria-label]')].map(
    (el) => `${el.getAttribute('alt') ?? ''} ${el.getAttribute('aria-label') ?? ''}`,
  );
  return `${container.textContent ?? ''} ${atributos.join(' ')}`;
}

describe('RTF 3.10: ortografía y tuteo de la landing', () => {
  it.each(SECCIONES)('%s no tiene formas sin tilde, sin ñ ni voseo', (_nombre, Seccion) => {
    const { container } = render(createElement(Seccion));
    const texto = textoVisible(container);
    expect(PROHIBIDAS.filter((patron) => patron.test(texto)).map(String)).toEqual([]);
  });

  it('Navbar: «Iniciar Sesión», «La Solución», «Cómo Funciona» y «Abrir menú»', () => {
    render(createElement(Navbar));
    expect(screen.getAllByText('Iniciar Sesión').length).toBeGreaterThan(0);
    expect(screen.getAllByText('La Solución').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Cómo Funciona').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Abrir menú' })).toBeInTheDocument();
  });

  it('las anclas de navegación no cambian', () => {
    const { container } = render(createElement(Navbar));
    const hrefs = [...container.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(expect.arrayContaining(['#el-problema', '#la-solucion', '#como-funciona', '/login', '/registro']));
  });

  it('FeaturesGrid y CTABanner usan signos de apertura y tuteo', () => {
    render(createElement('div', null, createElement(FeaturesGrid), createElement(CTABanner)));
    expect(screen.getByText('¿Qué problema resolvemos?')).toBeInTheDocument();
    expect(screen.getByText('¿Tienes un proyecto o buscas uno?')).toBeInTheDocument();
  });

  it('OrganizationsSection corrige gestión, organización y automáticamente', () => {
    render(createElement(OrganizationsSection));
    expect(screen.getByText('Gestión centralizada de múltiples proyectos')).toBeInTheDocument();
    expect(screen.getByText(/incluyen automáticamente a todo el equipo/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Crear organización' })).toBeInTheDocument();
    expect(screen.getByAltText('Colaboración')).toBeInTheDocument();
  });

  it('FormalizaExperienceSection y el hero dicen «colaboración»', () => {
    render(createElement('div', null, createElement(FormalizaExperienceSection), createElement(CinematicHero)));
    expect(screen.getByText('Toda colaboración queda registrada y verificable.')).toBeInTheDocument();
    expect(screen.getByText('Colaboración universitaria, ordenada.')).toBeInTheDocument();
  });

  it('HowItWorks está en tuteo («Puedes», «descubre», «Postúlate»)', () => {
    render(createElement(HowItWorks));
    expect(screen.getByText(/Puedes crear proyectos individuales o una organización/)).toBeInTheDocument();
    expect(screen.getByText(/descubre proyectos, postula y gestiona/)).toBeInTheDocument();
    expect(screen.getByText('Postúlate')).toBeInTheDocument();
  });
});
