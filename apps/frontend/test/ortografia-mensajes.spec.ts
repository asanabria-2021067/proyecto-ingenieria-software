import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// RTF-3.10: los textos visibles (frontend y mensajes de error del backend) no
// deben llevar palabras comunes sin tilde. Lista corta a proposito: solo
// palabras que nunca son correctas sin tilde en un texto de interfaz.
const PALABRAS = /\b(sesion|contrasena|informacion|validacion|aun|invalida|invalido|invalidas|invalidos)\b/i;

const RAIZ_FRONTEND = path.resolve(__dirname, '..');
const RAIZ_BACKEND = path.resolve(__dirname, '../../backend/src');
const CARPETAS = ['app', 'components', 'hooks', 'lib'].map((c) => path.join(RAIZ_FRONTEND, c)).concat(RAIZ_BACKEND);

// Devuelve solo los literales de texto (cadenas con espacios y texto JSX), sin
// comentarios, claves, rutas ni identificadores (un literal sin espacios nunca es
// un mensaje) ni consultas SQL.
export function textosVisibles(codigo: string): string[] {
  const textos: string[] = [];
  let sinComentarios = '';
  let i = 0;
  while (i < codigo.length) {
    const c = codigo[i];
    const dos = codigo.slice(i, i + 2);
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < codigo.length && codigo[j] !== c) j += codigo[j] === '\\' ? 2 : 1;
      const literal = codigo.slice(i + 1, j);
      sinComentarios += codigo.slice(i, j + 1);
      textos.push(literal.replace(/\$\{[^}]*\}/g, ' '));
      i = j + 1;
    } else if (dos === '//') {
      while (i < codigo.length && codigo[i] !== '\n') i++;
    } else if (dos === '/*') {
      const fin = codigo.indexOf('*/', i + 2);
      i = fin === -1 ? codigo.length : fin + 2;
    } else {
      sinComentarios += c;
      i++;
    }
  }
  for (const m of sinComentarios.matchAll(/>([^<>{}=;'"`]*[A-Za-z][^<>{}=;'"`]*)</g)) textos.push(m[1]);
  return textos.filter((t) => /\s/.test(t.trim()) && !/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(t));
}

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : archivos(ruta);
    return /\.tsx?$/.test(e.name) && !/\.(spec|test|d)\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

describe('RTF-3.10 ortografia de los textos visibles', () => {
  it('el detector marca palabras sin tilde en literales y texto JSX', () => {
    expect(textosVisibles(`const a = 'No se pudo iniciar sesion.';`).filter((t) => PALABRAS.test(t))).toHaveLength(1);
    expect(textosVisibles('const a = <p>Tu contrasena es debil</p>;').filter((t) => PALABRAS.test(t))).toHaveLength(1);
    expect(textosVisibles(`const a = \`Credenciales invalidas \${x}\`;`).filter((t) => PALABRAS.test(t))).toHaveLength(1);
  });

  it('el detector ignora comentarios, identificadores, claves y rutas', () => {
    const codigo = [
      '// sesion sin tilde en un comentario',
      '/* informacion sin tilde en un bloque */',
      "const clave = { contrasena: 'x', sesion: 1 };",
      "const ruta = '/auth/sesion';",
      "const e = 'sesionVersion';",
      "const ok = 'Inicia sesión con tu contraseña';",
    ].join('\n');
    expect(textosVisibles(codigo).filter((t) => PALABRAS.test(t))).toEqual([]);
  });

  it('ningun archivo de la aplicacion ni del backend tiene palabras comunes sin tilde', () => {
    const fallos: string[] = [];
    for (const archivo of CARPETAS.flatMap(archivos)) {
      for (const texto of textosVisibles(fs.readFileSync(archivo, 'utf8'))) {
        const m = texto.match(PALABRAS);
        if (m) fallos.push(`${path.relative(RAIZ_FRONTEND, archivo)}: "${m[0]}" en "${texto.trim().slice(0, 80)}"`);
      }
    }
    expect(fallos).toEqual([]);
  });
});
