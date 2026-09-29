import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

// HU-154 (T-215): la preferencia expandida/colapsada de la sidebar
// contextual vive solo en localStorage, con una clave fija, y nunca rompe la
// UI aunque el storage falle. El hook guarda un respaldo en memoria a nivel
// de módulo, así que cada test importa una instancia limpia.

const KEY = 'uvg-collab-project-sidebar';

async function cargarHook() {
  vi.resetModules();
  return import('@/components/projects/navigation/use-project-sidebar-collapsed');
}

describe('useProjectSidebarCollapsed', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it('usa la clave exacta uvg-collab-project-sidebar', async () => {
    const { PROJECT_SIDEBAR_STORAGE_KEY } = await cargarHook();
    expect(PROJECT_SIDEBAR_STORAGE_KEY).toBe(KEY);
  });

  it('sin preferencia guardada arranca expandida', async () => {
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it.each([
    ['collapsed', true],
    ['expanded', false],
  ])('restaura la preferencia guardada «%s»', async (valor, esperado) => {
    window.localStorage.setItem(KEY, valor);
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(esperado);
  });

  it.each(['true', '1', 'COLLAPSED', ''])('un valor corrupto («%s») cae a expandida', async (valor) => {
    window.localStorage.setItem(KEY, valor);
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it('setCollapsed escribe collapsed/expanded en la clave y actualiza el estado', async () => {
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());

    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    expect(window.localStorage.getItem(KEY)).toBe('collapsed');

    act(() => result.current.setCollapsed(false));
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('expanded');
  });

  it('toggleCollapsed alterna y persiste', async () => {
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());

    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(false);
    expect(window.localStorage.getItem(KEY)).toBe('expanded');
  });

  it('dos instancias en la misma pestaña se sincronizan (evento local)', async () => {
    const { useProjectSidebarCollapsed } = await cargarHook();
    const a = renderHook(() => useProjectSidebarCollapsed());
    const b = renderHook(() => useProjectSidebarCollapsed());

    act(() => a.result.current.setCollapsed(true));
    expect(b.result.current.collapsed).toBe(true);
  });

  it('un cambio hecho en otra pestaña (evento storage) actualiza el estado', async () => {
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);

    act(() => {
      window.localStorage.setItem(KEY, 'collapsed');
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: 'collapsed' }));
    });
    expect(result.current.collapsed).toBe(true);
  });

  it('si otra pestaña vacía el storage (key null) vuelve a expandida', async () => {
    window.localStorage.setItem(KEY, 'collapsed');
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(true);

    act(() => {
      window.localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null }));
    });
    expect(result.current.collapsed).toBe(false);
  });

  it('si localStorage lanza al leer y escribir, arranca expandida y la preferencia funciona en memoria', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());
    expect(result.current.collapsed).toBe(false);

    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
    act(() => result.current.toggleCollapsed());
    expect(result.current.collapsed).toBe(false);
  });

  it('si solo la escritura falla, el cambio se refleja igualmente en memoria', async () => {
    window.localStorage.setItem(KEY, 'expanded');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    const { useProjectSidebarCollapsed } = await cargarHook();
    const { result } = renderHook(() => useProjectSidebarCollapsed());

    act(() => result.current.setCollapsed(true));
    expect(result.current.collapsed).toBe(true);
  });

  it('el render de servidor sale siempre expandido (sin mismatch de hidratación)', async () => {
    window.localStorage.setItem(KEY, 'collapsed');
    const { useProjectSidebarCollapsed } = await cargarHook();
    function Probe() {
      const { collapsed } = useProjectSidebarCollapsed();
      return createElement('span', null, collapsed ? 'collapsed' : 'expanded');
    }
    expect(renderToString(createElement(Probe))).toContain('expanded');
  });
});
