/**
 * Evaluador mínimo de expresiones `if:` de GitHub Actions para los tests de
 * contrato de G02. Soporta el subconjunto que usan nuestros workflows:
 * literales de texto/booleanos/null, accesos `a.b.c` a un contexto dado,
 * `==`, `!=`, `!`, `&&`, `||`, paréntesis y las funciones `contains`,
 * `startsWith`. Una construcción no soportada lanza un error (el test falla)
 * en lugar de evaluarse a un valor inventado.
 */

type Value = string | number | boolean | null | undefined | Record<string, unknown>;
export type ExpressionContext = Record<string, unknown>;

const TOKEN = /\s*(\$\{\{|\}\}|==|!=|&&|\|\||!|\(|\)|,|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_.-]*|\d+)/y;

function tokenize(source: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let index = 0;
  while (index < source.trim().length || TOKEN.lastIndex < source.length) {
    const match = TOKEN.exec(source);
    if (!match) {
      if (source.slice(TOKEN.lastIndex).trim() === '') {
        break;
      }
      throw new Error(`Expresión no soportada cerca de: ${source.slice(TOKEN.lastIndex)}`);
    }
    if (match[1] !== '${{' && match[1] !== '}}') {
      tokens.push(match[1]);
    }
    index = TOKEN.lastIndex;
  }
  return tokens;
}

/** Igualdad de GitHub: texto sin distinguir mayúsculas; null/'' se comparan como tales. */
function equals(a: Value, b: Value): boolean {
  const norm = (v: Value) => (typeof v === 'string' ? v.toLowerCase() : v ?? null);
  return norm(a) === norm(b);
}

const truthy = (v: Value) => v !== null && v !== undefined && v !== '' && v !== false && v !== 0;

export function evaluateExpression(source: string, context: ExpressionContext): boolean {
  const tokens = tokenize(source);
  let position = 0;
  const peek = () => tokens[position];
  const take = (expected?: string) => {
    const token = tokens[position++];
    if (expected !== undefined && token !== expected) {
      throw new Error(`Se esperaba ${expected} y llegó ${token}`);
    }
    return token;
  };

  const lookup = (path: string): Value => {
    let current: unknown = context;
    for (const part of path.split('.')) {
      current = current && typeof current === 'object' ? (current as Record<string, unknown>)[part] : undefined;
    }
    return current as Value;
  };

  const primary = (): Value => {
    const token = take();
    if (token === '(') {
      const value = or();
      take(')');
      return value;
    }
    if (token === '!') {
      return !truthy(primary());
    }
    if (token.startsWith("'")) {
      return token.slice(1, -1).replace(/''/g, "'");
    }
    if (token === 'true' || token === 'false') {
      return token === 'true';
    }
    if (token === 'null') {
      return null;
    }
    if (/^\d+$/.test(token)) {
      return Number(token);
    }
    if (peek() === '(') {
      take('(');
      const args: Value[] = [];
      while (peek() !== ')') {
        args.push(or());
        if (peek() === ',') {
          take(',');
        }
      }
      take(')');
      const [a, b] = args.map((v) => String(v ?? '').toLowerCase());
      if (token === 'contains') {
        return a.includes(b);
      }
      if (token === 'startsWith') {
        return a.startsWith(b);
      }
      throw new Error(`Función no soportada: ${token}`);
    }
    return lookup(token);
  };

  const comparison = (): Value => {
    const left = primary();
    if (peek() === '==' || peek() === '!=') {
      const operator = take();
      const right = primary();
      return operator === '==' ? equals(left, right) : !equals(left, right);
    }
    return left;
  };

  const and = (): Value => {
    let value = comparison();
    while (peek() === '&&') {
      take();
      const right = comparison();
      value = truthy(value) ? right : value;
    }
    return value;
  };

  function or(): Value {
    let value = and();
    while (peek() === '||') {
      take();
      const right = and();
      value = truthy(value) ? value : right;
    }
    return value;
  }

  const result = or();
  if (position !== tokens.length) {
    throw new Error(`Tokens sin consumir: ${tokens.slice(position).join(' ')}`);
  }
  return truthy(result);
}
