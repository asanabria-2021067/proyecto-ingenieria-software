import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath: string) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf-8'));
}

function readSourceFiles(): { file: string; content: string }[] {
  const dirs = ['components/projects', 'hooks', 'app'];
  const results: { file: string; content: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (/\.(ts|tsx)$/.test(entry.name) && !full.includes(`${path.sep}test${path.sep}`)) {
        results.push({ file: full, content: fs.readFileSync(full, 'utf-8') });
      }
    }
  };
  for (const dir of dirs) walk(path.join(ROOT, dir));
  return results;
}

describe('Dependencia de drag-and-drop (Tarea 39)', () => {
  const pkg = readJson('package.json');

  it('declara @dnd-kit/core como dependencia directa', () => {
    expect(pkg.dependencies['@dnd-kit/core']).toBeDefined();
  });

  it('no declara @dnd-kit/sortable ni otro framework de DnD como dependencia directa', () => {
    const prohibidas = [
      '@dnd-kit/sortable',
      '@hello-pangea/dnd',
      'react-beautiful-dnd',
      'react-dnd',
    ];
    for (const nombre of prohibidas) {
      expect(pkg.dependencies[nombre]).toBeUndefined();
      expect(pkg.devDependencies?.[nombre]).toBeUndefined();
    }
  });

  it('el lockfile corresponde a package.json (@dnd-kit/core resuelto, sin @dnd-kit/sortable)', () => {
    const lock = readJson('package-lock.json');
    const core = lock.packages['node_modules/@dnd-kit/core'];
    expect(core).toBeDefined();
    expect(core.version).toBe(pkg.dependencies['@dnd-kit/core'].replace(/^\^/, ''));
    expect(lock.packages['node_modules/@dnd-kit/sortable']).toBeUndefined();
  });

  // Los tres checks siguientes solo inspeccionan código real (líneas de
  // import/require y declaraciones), no comentarios explicativos — esta
  // misma auditoría documenta en prosa, dentro de task-board-dnd.ts, por
  // qué no se usa sorting manual, y esa prosa no debe autoinvalidarse.
  function codeLines(content: string): string {
    return content
      .split('\n')
      .filter((linea) => !linea.trim().startsWith('*') && !linea.trim().startsWith('//'))
      .join('\n');
  }

  it('ningún archivo fuente importa desde @dnd-kit/sortable', () => {
    for (const { file, content } of readSourceFiles()) {
      expect(codeLines(content), `${file} no debe importar @dnd-kit/sortable`).not.toMatch(
        /from ['"]@dnd-kit\/sortable['"]/,
      );
    }
  });

  it('ningún archivo fuente usa SortableContext, useSortable o arrayMove', () => {
    const prohibidos = /\bSortableContext\b|\buseSortable\b|\barrayMove\(/;
    for (const { file, content } of readSourceFiles()) {
      expect(codeLines(content), `${file} no debe usar sorting manual`).not.toMatch(prohibidos);
    }
  });

  it('ningún archivo fuente declara sortIndex/orderIndex/manualOrder ni beforeTaskId/afterTaskId', () => {
    const prohibidos = /[:.]\s*(sortIndex|orderIndex|manualOrder|beforeTaskId|afterTaskId)\b/;
    for (const { file, content } of readSourceFiles()) {
      expect(codeLines(content), `${file} no debe introducir orden manual`).not.toMatch(prohibidos);
    }
  });
});
