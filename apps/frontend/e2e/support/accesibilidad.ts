import type { Page } from '@playwright/test';

/**
 * G05-C13: mediciones de accesibilidad hechas en el navegador real, sin
 * dependencias nuevas (axe-core no es dependencia directa del proyecto: P-5).
 * No sustituyen una auditoría WCAG completa; cubren lo que el calendario
 * controla y que puede medirse de forma repetible.
 */

export interface Contraste {
  texto: string;
  ratio: number;
  color: string;
  fondo: string;
}

/**
 * Contraste WCAG del texto de cada elemento que cumpla `selector`: color del
 * texto con su alfa y la opacidad acumulada de sus ancestros, sobre el fondo
 * realmente compuesto. Es lo que ve la persona, no el valor del token.
 */
export function medirContraste(page: Page, selector: string): Promise<Contraste[]> {
  return page.evaluate((sel) => {
    const lienzo = document.createElement('canvas').getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
    type Color = { r: number; g: number; b: number; a: number };
    const leer = (css: string): Color => {
      lienzo.clearRect(0, 0, 1, 1);
      lienzo.fillStyle = '#000';
      lienzo.fillStyle = css;
      lienzo.fillRect(0, 0, 1, 1);
      const d = lienzo.getImageData(0, 0, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] / 255 };
    };
    const sobre = (f: Color, b: Color, a = f.a): Color => ({ r: f.r * a + b.r * (1 - a), g: f.g * a + b.g * (1 - a), b: f.b * a + b.b * (1 - a), a: 1 });
    const luminancia = ({ r, g, b }: Color) => {
      const canal = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
      };
      return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
    };
    const hex = (c: Color) => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;
    const medir = (el: HTMLElement) => {
      const cadena: HTMLElement[] = [];
      for (let n: HTMLElement | null = el; n; n = n.parentElement) cadena.unshift(n);
      let fondo: Color = { r: 255, g: 255, b: 255, a: 1 };
      const grupos: { base: Color; opacidad: number }[] = [];
      for (const n of cadena) {
        const estilo = getComputedStyle(n);
        const opacidad = parseFloat(estilo.opacity);
        if (opacidad < 1) grupos.push({ base: fondo, opacidad });
        const propio = leer(estilo.backgroundColor);
        if (propio.a > 0) fondo = sobre(propio, fondo);
      }
      let texto = sobre(leer(getComputedStyle(el).color), fondo);
      for (const { base, opacidad } of grupos.reverse()) {
        texto = sobre(texto, base, opacidad);
        fondo = sobre(fondo, base, opacidad);
      }
      const [clara, oscura] = [luminancia(texto), luminancia(fondo)].sort((x, y) => y - x);
      return { texto: (el.textContent ?? '').trim().slice(0, 30), ratio: Math.round(((clara + 0.05) / (oscura + 0.05)) * 100) / 100, color: hex(texto), fondo: hex(fondo) };
    };
    // Solo texto que se ve: se descarta lo que es únicamente para lectores de pantalla (sr-only: caja de 1 px
    // recortada) y los elementos cuyo texto está todo en descendientes ocultos de esa forma.
    const soloParaLectores = (el: Element) => {
      const estilo = getComputedStyle(el);
      const caja = el.getBoundingClientRect();
      return estilo.position === 'absolute' && caja.width <= 1.5 && caja.height <= 1.5;
    };
    const textoVisible = (el: HTMLElement) => {
      const nodos = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = nodos.nextNode(); n; n = nodos.nextNode()) {
        if (!(n.textContent ?? '').trim()) continue;
        let oculto = false;
        for (let padre = n.parentElement; padre && padre !== el.parentElement; padre = padre.parentElement) if (soloParaLectores(padre)) oculto = true;
        if (!oculto) return true;
      }
      return false;
    };
    return [...document.querySelectorAll<HTMLElement>(sel)].filter((el) => el.getBoundingClientRect().width > 1.5 && textoVisible(el)).map(medir);
  }, selector);
}

/**
 * Espera a que terminen las animaciones y transiciones en curso (apertura de
 * diálogos, fundidos): medir contraste a mitad de un fundido da valores falsos.
 */
export async function esperarAnimaciones(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const pendientes = document.getAnimations().filter((a) => a.playState === 'running' && (a.effect?.getComputedTiming().iterations ?? 1) !== Infinity);
    await Promise.allSettled(pendientes.map((a) => a.finished));
  });
}

export interface ObjetivoPequeno {
  nombre: string;
  caja: string;
  efectiva: string;
  holguraPx: number;
  cumple: boolean;
  motivo: 'área' | 'espaciado' | 'en línea' | 'ninguno';
}

/**
 * WCAG 2.5.8 (AA) para los controles operables visibles dentro de `selector`.
 * Un control menor de 24×24 px cumple si (a) su área efectiva, sumando la
 * etiqueta asociada que también lo activa, llega a 24×24; (b) un círculo de
 * 24 px centrado en él no toca otro control ni el círculo de otro control
 * pequeño (excepción de espaciado); o (c) es un enlace dentro de un texto.
 * Las cajas se recortan por los contenedores con scroll: lo que queda bajo un
 * pie fijo no es un objetivo alcanzable.
 */
export function medirObjetivos(page: Page, selector: string): Promise<{ total: number; pequenos: ObjetivoPequeno[] }> {
  return page.evaluate((sel) => {
    const CONTROLES = 'button, a[href], [role="radio"], [role="checkbox"], [role="combobox"], [role="menuitemcheckbox"], input:not([type="hidden"]), textarea, select';
    type Caja = { l: number; t: number; r: number; b: number };
    const recortada = (el: Element): Caja => {
      const r = el.getBoundingClientRect();
      let c: Caja = { l: r.left, t: r.top, r: r.right, b: r.bottom };
      for (let n = el.parentElement; n && n !== document.body; n = n.parentElement) {
        const estilo = getComputedStyle(n);
        const q = n.getBoundingClientRect();
        if (q.width > 0 && q.height > 0 && /(auto|scroll|hidden|clip)/.test(estilo.overflowX + estilo.overflowY)) {
          c = { l: Math.max(c.l, q.left), t: Math.max(c.t, q.top), r: Math.min(c.r, q.right), b: Math.min(c.b, q.bottom) };
        }
      }
      return c;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      const estilo = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || estilo.visibility === 'hidden' || estilo.display === 'none') return false;
      if (el.closest('[aria-hidden="true"]') || (el as HTMLButtonElement).disabled) return false;
      const c = recortada(el);
      return c.r - c.l >= 1 && c.b - c.t >= 1;
    };
    const raices = [...document.querySelectorAll(sel)];
    const controles = [...new Set(raices.flatMap((r) => [...r.querySelectorAll<HTMLElement>(CONTROLES)]))].filter(visible);
    const etiquetas = (el: HTMLElement) => [...(el.id ? document.querySelectorAll(`label[for="${CSS.escape(el.id)}"]`) : []), ...(el.closest('label') ? [el.closest('label') as Element] : [])].filter(visible);
    const union = (a: Caja, b: Caja): Caja => ({ l: Math.min(a.l, b.l), t: Math.min(a.t, b.t), r: Math.max(a.r, b.r), b: Math.max(a.b, b.b) });
    const datos = controles.map((el) => {
      const c = recortada(el);
      // Solo se considera "pequeño" por su tamaño real, no por estar medio oculto tras un scroll.
      const real = el.getBoundingClientRect();
      let efectiva = c;
      for (const etiqueta of etiquetas(el)) efectiva = union(efectiva, recortada(etiqueta));
      return { el, c, ancho: real.width, alto: real.height, efAncho: efectiva.r - efectiva.l, efAlto: efectiva.b - efectiva.t, cx: (c.l + c.r) / 2, cy: (c.t + c.b) / 2 };
    });
    const pequeno = (d: (typeof datos)[number]) => d.ancho < 23.5 || d.alto < 23.5;
    const distancia = (x: number, y: number, c: Caja) => Math.hypot(Math.max(c.l - x, 0, x - c.r), Math.max(c.t - y, 0, y - c.b));
    const pequenos = datos.filter(pequeno).map((d) => {
      let holgura = Infinity;
      for (const o of datos) {
        if (o === d || o.el.contains(d.el) || d.el.contains(o.el)) continue;
        holgura = Math.min(holgura, pequeno(o) ? Math.hypot(o.cx - d.cx, o.cy - d.cy) - 24 : distancia(d.cx, d.cy, o.c) - 12);
      }
      const area = d.efAncho >= 23.5 && d.efAlto >= 23.5;
      const espaciado = holgura >= -0.5;
      const enLinea = d.el.tagName === 'A' && getComputedStyle(d.el).display === 'inline';
      const motivo: 'área' | 'espaciado' | 'en línea' | 'ninguno' = area ? 'área' : espaciado ? 'espaciado' : enLinea ? 'en línea' : 'ninguno';
      const nombre = (d.el.getAttribute('aria-label') ?? etiquetas(d.el)[0]?.textContent ?? d.el.textContent ?? '').trim().slice(0, 40);
      return { nombre, caja: `${Math.round(d.ancho)}×${Math.round(d.alto)}`, efectiva: `${Math.round(d.efAncho)}×${Math.round(d.efAlto)}`, holguraPx: Number.isFinite(holgura) ? Math.round(holgura * 10) / 10 : 999, cumple: motivo !== 'ninguno', motivo };
    });
    return { total: datos.length, pequenos };
  }, selector);
}

export interface Semantica {
  h1: number;
  saltosDeEncabezado: string[];
  sinNombre: string[];
  ariaInvalido: string[];
  gruposSinNombre: number;
  hoyMarcado: number;
}

/** Estructura y nombres accesibles dentro de `selector` (la página del calendario o un diálogo). */
export function medirSemantica(page: Page, selector: string): Promise<Semantica> {
  return page.evaluate((sel) => {
    const raiz = document.querySelector(sel) as HTMLElement;
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && !el.closest('[aria-hidden="true"]');
    };
    const texto = (el: Element | null) => (el?.textContent ?? '').trim();
    const nombre = (el: Element): string => {
      const porIds = (el.getAttribute('aria-labelledby') ?? '').split(' ').filter(Boolean).map((id) => texto(document.getElementById(id))).join(' ').trim();
      if (porIds) return porIds;
      const propio = el.getAttribute('aria-label')?.trim();
      if (propio) return propio;
      const id = el.getAttribute('id');
      const etiqueta = id ? texto(document.querySelector(`label[for="${CSS.escape(id)}"]`)) : '';
      if (etiqueta) return etiqueta;
      if (el.closest('label')) return texto(el.closest('label'));
      return texto(el) || (el.getAttribute('placeholder') ?? '') || (el.getAttribute('title') ?? '');
    };
    const niveles = [...raiz.querySelectorAll('h1, h2, h3, h4, h5, h6')].filter((h) => getComputedStyle(h).display !== 'none').map((h) => Number(h.tagName[1]));
    const saltos: string[] = [];
    niveles.forEach((nivel, i) => {
      if (i > 0 && nivel > niveles[i - 1] + 1) saltos.push(`h${niveles[i - 1]}→h${nivel}`);
    });
    const controles = [...raiz.querySelectorAll('button, a[href], input:not([type="hidden"]), textarea, select, [role="radio"], [role="checkbox"], [role="combobox"]')].filter(visible).filter((el) => el.getAttribute('aria-hidden') !== 'true');
    const sinNombre = controles.filter((el) => nombre(el).length === 0).map((el) => el.outerHTML.slice(0, 90));
    const ariaInvalido = [
      ...[...raiz.querySelectorAll('button[aria-required]:not([role])')].map((el) => `aria-required en <button>: ${texto(el).slice(0, 30)}`),
      ...[...raiz.querySelectorAll('span[aria-label]:not([role]), div[aria-label]:not([role])')].filter(visible).map((el) => `aria-label sin rol: ${el.getAttribute('aria-label')}`),
      ...[...raiz.querySelectorAll('[aria-labelledby], [aria-describedby], [aria-controls]')]
        .flatMap((el) => ['aria-labelledby', 'aria-describedby', 'aria-controls'].flatMap((atributo) => (el.getAttribute(atributo) ?? '').split(' ').filter(Boolean).map((id) => ({ el, atributo, id }))))
        // aria-controls de un desplegable cerrado apunta a contenido que aún no está montado: no es un error.
        .filter(({ el, atributo, id }) => !document.getElementById(id) && !(atributo === 'aria-controls' && el.getAttribute('aria-expanded') === 'false'))
        // components/ui/form (compartido) siempre referencia la descripción del campo aunque no se dibuje; el
        // mensaje de error, que es lo que importa, usa otro id y sí debe existir. No es de este PR.
        .filter(({ id }) => !id.endsWith('-form-item-description'))
        .map(({ atributo, id }) => `${atributo} → #${id} no existe`),
    ];
    const grupos = [...raiz.querySelectorAll('[role="radiogroup"], [role="group"], [role="dialog"], [role="alertdialog"]'), ...(raiz.matches('[role="dialog"]') ? [raiz] : [])].filter(visible);
    return {
      h1: document.querySelectorAll('h1').length,
      saltosDeEncabezado: saltos,
      sinNombre,
      ariaInvalido,
      gruposSinNombre: grupos.filter((g) => nombre(g).length === 0 || (g.getAttribute('aria-label') === null && g.getAttribute('aria-labelledby') === null)).length,
      hoyMarcado: raiz.querySelectorAll('[aria-current="date"]').length,
    };
  }, selector);
}
