import { expect, vi } from 'vitest';

/**
 * T-277: cargas XSS típicas para comprobar que el contenido escrito por
 * usuarios se renderiza como texto. Cada una llama a `window.__xss()` si
 * llegara a ejecutarse. jsdom no ejecuta `<script>` insertado por innerHTML
 * ni descarga imágenes (no dispara `onerror`), así que la prueba decisiva es
 * `expectSinHtmlInyectado`: que el navegador no haya creado los elementos.
 */
export const XSS_SCRIPT = `<script>window.__xss()</script>`;
export const XSS_IMG = `<img src=x onerror="window.__xss()">`;
export const XSS_SVG = `<svg onload="window.__xss()"></svg>`;
export const XSS_IFRAME = `"><iframe src="javascript:window.__xss()"></iframe>`;

export const XSS_PAYLOADS = [XSS_SCRIPT, XSS_IMG, XSS_SVG, XSS_IFRAME] as const;

/** Todas las cargas en un solo string (cabe en los MaxLength de los DTO). */
export const XSS_COMBINADO = XSS_PAYLOADS.join(' ');

/** Instala `window.__xss` como espía; debe quedar sin llamadas. */
export function instalarCentinelaXss() {
  const centinela = vi.fn();
  (window as unknown as { __xss: () => void }).__xss = centinela;
  return centinela;
}

/** Ningún elemento creado a partir de las cargas ni atributos de evento. */
export function expectSinHtmlInyectado(root: ParentNode) {
  expect(root.querySelector('script')).toBeNull();
  expect(root.querySelector('iframe')).toBeNull();
  expect(root.querySelector('img[src="x"]')).toBeNull();
  expect(root.querySelector('[onerror], [onload]')).toBeNull();
}
