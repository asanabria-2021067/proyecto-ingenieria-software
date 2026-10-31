import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// RTF-3.10: los textos visibles (frontend y mensajes de error del backend) no
// deben llevar palabras comunes sin tilde. Lista corta a propósito: solo
// palabras que nunca son correctas sin tilde en un texto de interfaz.
// "aun" sin tilde solo es correcto en "aun así / aun cuando / aun con / aun si".
const PALABRAS =
  /(?<!\p{L})(sesion|contrasena|informacion|validacion|invalidas?|invalidos?|biografia|basico|aun(?!\s+(así|cuando|con|si)(?!\p{L})))(?!\p{L})/iu;

const RAIZ_FRONTEND = path.resolve(__dirname, '..');
const RAIZ_BACKEND = path.resolve(__dirname, '../../backend/src');
const CARPETAS = ['app', 'components', 'hooks', 'lib'].map((c) => path.join(RAIZ_FRONTEND, c)).concat(RAIZ_BACKEND);

const ANTES_DE_REGEX = '(,=:[!&|?{};';

// Devuelve solo los literales de texto (cadenas y texto JSX), sin comentarios,
// regex, claves, rutas ni identificadores. Un literal de una sola palabra solo
// cuenta si empieza con mayúscula ("Sesion"): en minúscula es una clave o una
// ruta. Límites conocidos del recorrido (no hay parser completo):
// - una comilla ' o " sin cierre en su línea se trata como carácter suelto, así
//   un apóstrofo en texto JSX no desincroniza el resto del archivo;
// - un "/" cuenta como regex solo tras ( , = : [ ! & | ? { } ; o return;
// - el texto JSX admite bloques {…} intermedios (se ignoran), no anidados.
export function textosVisibles(codigo: string): string[] {
  const textos: string[] = [];
  let resto = '';
  let i = 0;
  while (i < codigo.length) {
    const c = codigo[i];
    const dos = codigo.slice(i, i + 2);
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < codigo.length && codigo[j] !== c && !(c !== '`' && codigo[j] === '\n')) j += codigo[j] === '\\' ? 2 : 1;
      if (codigo[j] !== c) {
        resto += c;
        i++;
        continue;
      }
      textos.push(codigo.slice(i + 1, j).replace(/\$\{[^}]*\}/g, ' '));
      resto += codigo.slice(i, j + 1);
      i = j + 1;
    } else if (dos === '//') {
      while (i < codigo.length && codigo[i] !== '\n') i++;
    } else if (dos === '/*') {
      const fin = codigo.indexOf('*/', i + 2);
      i = fin === -1 ? codigo.length : fin + 2;
    } else if (c === '/' && (resto.trimEnd() === '' || ANTES_DE_REGEX.includes(resto.trimEnd().slice(-1)) || /\breturn$/.test(resto.trimEnd()))) {
      let j = i + 1;
      let clase = false;
      while (j < codigo.length && codigo[j] !== '\n' && (clase || codigo[j] !== '/')) {
        if (codigo[j] === '\\') j++;
        else if (codigo[j] === '[') clase = true;
        else if (codigo[j] === ']') clase = false;
        j++;
      }
      resto += '/';
      i = codigo[j] === '/' ? j + 1 : i + 1;
    } else {
      resto += c;
      i++;
    }
  }
  for (const m of resto.matchAll(/>((?:[^<>{}=;'"`]|\{[^{}]*\})*)</g)) {
    const t = m[1].replace(/\{[^{}]*\}/g, ' ');
    if (/\p{L}/u.test(t)) textos.push(t);
  }
  return textos.filter(
    (t) => (/\s/.test(t.trim()) || /^\p{Lu}\p{Ll}+$/u.test(t.trim())) && !/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i.test(t),
  );
}

function archivos(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' || e.name === '.next' ? [] : archivos(ruta);
    return /\.tsx?$/.test(e.name) && !/\.(spec|test|d)\.tsx?$/.test(e.name) ? [ruta] : [];
  });
}

const marcados = (codigo: string) => textosVisibles(codigo).filter((t) => PALABRAS.test(t));

describe('RTF-3.10 ortografía de los textos visibles', () => {
  it('el detector marca palabras sin tilde en literales y texto JSX', () => {
    expect(marcados(`const a = 'No se pudo iniciar sesion.';`)).toHaveLength(1);
    expect(marcados('const a = <p>Tu contrasena es debil</p>;')).toHaveLength(1);
    expect(marcados(`const a = \`Credenciales invalidas \${x}\`;`)).toHaveLength(1);
    expect(marcados('const a = <p>Hola {nombre}, tu sesion vencio</p>;')).toHaveLength(1);
    expect(marcados(`const a = 'Aun no hay datos';`)).toHaveLength(1);
  });

  it('marca una sola palabra con mayúscula inicial, pero no en minúscula', () => {
    expect(marcados(`const etiqueta = 'Sesion';`)).toHaveLength(1);
    expect(marcados(`const etiqueta = 'Contrasena';`)).toHaveLength(1);
    expect(marcados(`const clave = 'sesion';`)).toEqual([]);
  });

  it('"aun" sin tilde es válido en «aun así», «aun cuando», «aun con» y «aun si»', () => {
    expect(marcados(`const a = 'Aun así, guarda los cambios.';`)).toEqual([]);
    expect(marcados(`const a = 'Se envía aun cuando falte el campo.';`)).toEqual([]);
    expect(marcados(`const a = 'Aún no hay datos';`)).toEqual([]);
  });

  it('el detector ignora comentarios, regex, identificadores, claves y rutas', () => {
    const codigo = [
      '// sesion sin tilde en un comentario',
      '/* informacion sin tilde en un bloque */',
      "const clave = { contrasena: 'x', sesion: 1 };",
      "const ruta = '/auth/sesion';",
      "const e = 'sesionVersion';",
      'const r = /sesion invalida/i;',
      "const ok = 'Inicia sesión con tu contraseña';",
    ].join('\n');
    expect(marcados(codigo)).toEqual([]);
  });

  it('un apóstrofo suelto o una regex con comillas no desincronizan el recorrido', () => {
    const codigo = [
      "const r = /['\"]/g;",
      'const a = <p>No se pudo l\'ogin</p>;',
      "const b = 'Cerrar sesion ahora';",
    ].join('\n');
    expect(marcados(codigo)).toEqual(["Cerrar sesion ahora"]);
  });

  it('ningún archivo de la aplicación ni del backend tiene palabras comunes sin tilde', () => {
    const fallos: string[] = [];
    for (const archivo of CARPETAS.flatMap(archivos)) {
      for (const texto of textosVisibles(fs.readFileSync(archivo, 'utf8'))) {
        const m = texto.match(PALABRAS);
        if (m) fallos.push(`${path.relative(RAIZ_FRONTEND, archivo)}: "${m[0]}" en "${texto.trim().slice(0, 80)}"`);
      }
    }
    expect(fallos).toEqual([]);
  }, 30_000);
});
