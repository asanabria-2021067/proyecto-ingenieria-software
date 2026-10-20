'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  Bell,
  Download,
  LayoutGrid,
  List,
  Moon,
  MoreVertical,
  PanelLeftClose,
  Plus,
  RotateCcw,
  Search,
  SquarePen,
  X,
  type LucideIcon,
} from 'lucide-react';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import { ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER } from '@/components/admin/admin-tabs';
import { ConfirmActionDialog } from '@/components/admin/ConfirmActionDialog';
import { REQUEST_INBOX_BUTTON, REQUEST_INBOX_BUTTON_CONSULT, REQUEST_INBOX_BUTTON_GREEN } from '@/components/admin/request-inbox-details';
import { AUTH_PRIMARY_BUTTON } from '@/components/auth/auth-split-layout';
import { CalendarFilterMenu } from '@/components/calendar/calendar-filter-menu';
import { DataTablePager } from '@/components/dashboard/data-table';
import { DASHBOARD_FILTER_TRIGGER_CLASS } from '@/components/dashboard/dashboard-search-field';
import { TimeRecordActions } from '@/components/hours/time-record-actions';
import { BOTON_CERRADO } from '@/components/projects/available-project-card';
import { PROJECT_ACTION_BUTTON_CLASS } from '@/components/projects/project-action-button';
import { Button, buttonVariants } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SEGMENTED_ITEM_CLASS, ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { BOTONES_INLINE, type FamiliaInline, type MuestraInline } from '@/lib/admin/button-catalog';
import { swalCustomClass } from '@/lib/swal';
import type { TipoEvento } from '@/lib/services/events';
import type { RegistroTiempoTareaDTO } from '@/lib/types/tasks';

/**
 * VISTA TEMPORAL — catálogo de las familias de botones de UVGenius, en vistas de
 * estudiante y de administrador. No forma parte del producto: se elimina al
 * terminar la revisión.
 *
 * Los botones que tienen componente o constante exportada se importan tal cual.
 * Los que se escriben con clases en línea salen de `lib/admin/button-catalog.ts`,
 * cuyas clases comprueba `test/button-catalog.spec.ts` contra su archivo: si una
 * vista cambia el botón, la prueba obliga a actualizar el catálogo. Cada familia
 * se muestra en claro y en oscuro (el panel oscuro envuelve el contenido en
 * `.dark`, la misma clase que `next-themes` pone en <html>).
 */

type Vista = 'Estudiante' | 'Admin' | 'Ambas' | 'Acceso';

/**
 * Los alias semánticos (`action`, `text-primary`…) se resuelven una sola vez en <html>: dentro de un
 * panel `.dark` anidado seguirían con su valor claro. El panel oscuro los vuelve a declarar con las
 * mismas fórmulas de `app/global.css` para que pinte lo mismo que el tema oscuro real.
 */
const PANEL_OSCURO =
  'dark bg-surface text-on-surface [--color-action:var(--color-inverse-surface)] [--color-on-action:var(--color-inverse-on-surface)] [--color-accent:var(--color-secondary-container)] [--color-on-accent:var(--color-on-secondary-fixed)] [--color-text-primary:var(--color-on-surface)] [--color-text-secondary:var(--color-on-surface-variant)] [--color-card:var(--color-surface-container-lowest)]';
/** Compartida = sale de un componente o constante exportada; En línea = clases escritas en su vista. */
type Origen = 'Compartida' | 'En línea';

function Familia({
  numero,
  titulo,
  vista,
  origen,
  fuente,
  nota,
  children,
}: {
  numero: number;
  titulo: string;
  vista: Vista;
  origen: Origen;
  fuente: string;
  nota?: string;
  children: ReactNode;
}) {
  return (
    <section className="@container/familia card-base flex flex-col gap-inline" aria-labelledby={`familia-${numero}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-inline gap-y-micro">
        <h2 id={`familia-${numero}`} className="type-subtitle font-semibold">
          {String(numero).padStart(2, '0')} · {titulo}
        </h2>
        <p className="type-meta">
          {vista} · {origen}
        </p>
      </div>
      <p className="type-meta break-all font-mono">{fuente}</p>
      {nota && <p className="type-meta">{nota}</p>}
      <div className="grid grid-cols-1 gap-tight @xl/familia:grid-cols-2">
        <div className="flex flex-wrap items-center gap-tight rounded-control bg-surface-container-low p-inline">{children}</div>
        <div className={`${PANEL_OSCURO} flex flex-wrap items-center gap-tight rounded-control p-inline`}>{children}</div>
      </div>
    </section>
  );
}

/** Icono de cada botón de solo icono, el mismo que lleva en su vista. */
const ICONOS: Record<string, LucideIcon> = {
  'Cambiar tema': Moon,
  'Repetir tour de bienvenida': RotateCcw,
  Actualizar: RotateCcw,
  Notificaciones: Bell,
  'Plegar la sidebar del proyecto': PanelLeftClose,
  'Acciones del proyecto': MoreVertical,
  'Vista en tarjetas (activa)': LayoutGrid,
  'Vista en lista': List,
  'Nuevo chat': SquarePen,
  'Buscar en el chat': Search,
  'Descargar adjunto (deshabilitado)': Download,
};

function Muestra({ muestra }: { muestra: MuestraInline }) {
  const className = muestra.clases.join(' ');
  const Icono = ICONOS[muestra.etiqueta] ?? X;
  const contenido = muestra.soloIcono ? <Icono className="size-4" aria-hidden /> : muestra.etiqueta;
  const etiqueta = muestra.soloIcono ? muestra.etiqueta : undefined;
  if (muestra.variante) {
    return (
      <Button type="button" variant={muestra.variante} size={muestra.tamano} className={className} disabled={muestra.disabled} aria-label={etiqueta} title={etiqueta}>
        {contenido}
      </Button>
    );
  }
  return (
    <button type="button" className={className} disabled={muestra.disabled} aria-label={etiqueta} title={etiqueta}>
      {contenido}
    </button>
  );
}

/** Familias en línea, en el orden en que se muestran; numeradas a continuación de las compartidas. */
const FAMILIAS_INLINE: { clave: FamiliaInline; titulo: string; vista: Vista; nota?: string }[] = [
  { clave: 'barraSuperior', titulo: 'Iconos de la barra superior', vista: 'Ambas', nota: 'Tema, tour, actualizar y notificaciones: 40 px, cuadrados.' },
  { clave: 'plegado', titulo: 'Plegar y menú de acciones', vista: 'Estudiante' },
  { clave: 'accionFila', titulo: 'Acción de fila (gris a verde)', vista: 'Admin', nota: '«Ver perfil» es la referencia: «Ver detalle» y «Limpiar filtros» la reutilizan.' },
  { clave: 'grisAVerde', titulo: 'Secundario gris a verde', vista: 'Ambas', nota: 'Mismo botón con dos radios: control (admin) y xl (estudiante).' },
  { clave: 'estadoVacio', titulo: 'Estados vacíos y de error', vista: 'Ambas', nota: 'El primario de «Reintentar» se repite en una veintena de estados vacíos.' },
  { clave: 'pieDialogo', titulo: 'Pie de diálogo', vista: 'Estudiante', nota: 'Dos tamaños conviven: 40 px con radio md (xs) y 40 px con radio lg (sm).' },
  { clave: 'compactos', titulo: 'Contorno compacto', vista: 'Estudiante' },
  { clave: 'enlaces', titulo: 'Enlaces de texto', vista: 'Ambas' },
  { clave: 'chips', titulo: 'Chips de filtro', vista: 'Estudiante' },
  { clave: 'conmutadores', titulo: 'Conmutadores de vista', vista: 'Estudiante' },
  { clave: 'chat', titulo: 'Iconos del chat', vista: 'Estudiante' },
  { clave: 'cerrar', titulo: 'Cerrar y quitar', vista: 'Ambas' },
  { clave: 'formularios', titulo: 'Asistente de formulario', vista: 'Estudiante' },
  { clave: 'flotante', titulo: 'Barra flotante del chat', vista: 'Estudiante' },
  { clave: 'paginacion', titulo: 'Paginación propia', vista: 'Estudiante', nota: 'La bitácora no usa el paginador compartido (familia 10).' },
  { clave: 'pieTarjeta', titulo: 'Pie de tarjeta de proyecto (cierre solicitado)', vista: 'Ambas', nota: 'Constante local, no exportada; su hermana «cerrado» es la familia 02.' },
];

const VARIANTES = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const;
const TAMANOS = ['sm', 'default', 'lg'] as const;
const REGISTRO = { idRegistroTiempo: 1, horas: 2, fecha: '2026-10-12' } as RegistroTiempoTareaDTO;
const CONFIRMACIONES = [
  ['default', 'Aprobar'],
  ['warning', 'Revisar'],
  ['destructive', 'Rechazar'],
] as const;

export default function AdminBotonesPage() {
  const [segmento, setSegmento] = useState('semana');
  const [pagina, setPagina] = useState(2);
  const [confirmar, setConfirmar] = useState<(typeof CONFIRMACIONES)[number] | null>(null);
  const [tareas, setTareas] = useState(true);
  const [ocultos, setOcultos] = useState<Set<TipoEvento>>(new Set());

  const alternarTipo = (tipo: TipoEvento) =>
    setOcultos((previos) => {
      const siguiente = new Set(previos);
      if (!siguiente.delete(tipo)) siguiente.add(tipo);
      return siguiente;
    });

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Diagnóstico" pagina="Botones (temporal)" />
      <header className="mb-6">
        <h1 className={ADMIN_PAGE_TITLE}>Botones</h1>
        <p className="mt-tight max-w-3xl text-base text-tertiary">
          Catálogo temporal de las familias de botones de UVGenius. Las compartidas importan el componente o la constante
          real; las que se escriben en línea copian sus clases, verificadas contra su archivo. Cada familia se muestra en
          modo claro y en modo oscuro.
        </p>
      </header>

      <section className="@container/sistema card-base mb-grid flex flex-col gap-inline" aria-labelledby="sistema">
        <h2 id="sistema" className="type-subtitle font-semibold">
          Sistema: variantes y tamaños
        </h2>
        <p className="type-meta break-all font-mono">components/ui/button.tsx (Button, buttonVariants) · components/ui/spinner.tsx (Spinner)</p>
        <p className="type-meta">Seis variantes en tres tamaños, más los tamaños de icono, el estado deshabilitado, el de carga y un enlace con forma de botón.</p>
        <div className="grid grid-cols-1 gap-tight @5xl/sistema:grid-cols-2">
          {[false, true].map((oscuro) => (
            <div key={String(oscuro)} className={`flex flex-col gap-tight rounded-control p-inline ${oscuro ? PANEL_OSCURO : 'bg-surface-container-low'}`}>
              {TAMANOS.map((tamano) => (
                <div key={tamano} className="flex flex-wrap items-center gap-tight">
                  {VARIANTES.map((variante) => (
                    <Button key={variante} type="button" variant={variante} size={tamano}>
                      {variante}
                    </Button>
                  ))}
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-tight">
                {(['icon-sm', 'icon', 'icon-lg'] as const).map((tamano) => (
                  <Button key={tamano} type="button" variant="outline" size={tamano} aria-label={tamano} title={tamano}>
                    <Plus />
                  </Button>
                ))}
                <Button type="button" disabled>
                  Deshabilitado
                </Button>
                <Button type="button" disabled>
                  <Spinner />
                  Guardando…
                </Button>
                <Link href="/dashboard/admin" className={buttonVariants({ variant: 'outline' })}>
                  Enlace <ArrowRight />
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-grid lg:grid-cols-2">
        <Familia numero={1} titulo="Acción de proyecto" vista="Estudiante" origen="Compartida" fuente="components/projects/project-action-button.ts (PROJECT_ACTION_BUTTON_CLASS)">
          <Button type="button" className={PROJECT_ACTION_BUTTON_CLASS}>
            Postularme
          </Button>
        </Familia>

        <Familia
          numero={2}
          titulo="Pie de tarjeta de proyecto (cerrado)"
          vista="Ambas"
          origen="Compartida"
          fuente="components/projects/available-project-card.tsx (BOTON_CERRADO)"
          nota="Lo comparte «Revisar cierre» de la bandeja de cierres del administrador."
        >
          <Button type="button" className={BOTON_CERRADO}>
            Ver proyecto
          </Button>
        </Familia>

        <Familia numero={3} titulo="Bandeja de solicitudes" vista="Admin" origen="Compartida" fuente="components/admin/request-inbox-details.tsx (REQUEST_INBOX_BUTTON*)">
          <Button type="button" size="sm" className={`${REQUEST_INBOX_BUTTON} ${REQUEST_INBOX_BUTTON_GREEN}`}>
            Aprobar
          </Button>
          <Button type="button" size="sm" className={`${REQUEST_INBOX_BUTTON} ${REQUEST_INBOX_BUTTON_CONSULT}`}>
            Consultar
          </Button>
        </Familia>

        <Familia
          numero={4}
          titulo="Confirmación del administrador"
          vista="Admin"
          origen="Compartida"
          fuente="components/admin/ConfirmActionDialog.tsx (variant default · warning · destructive)"
          nota="Cada botón abre el diálogo real con su variante; el diálogo sigue el tema de la página."
        >
          {CONFIRMACIONES.map((c) => (
            <Button key={c[0]} type="button" variant="outline" onClick={() => setConfirmar(c)}>
              {c[1]}…
            </Button>
          ))}
        </Familia>

        <Familia numero={5} titulo="Alertas SweetAlert" vista="Ambas" origen="Compartida" fuente="lib/swal.ts (swalCustomClass.confirmButton · cancelButton)">
          <Muestra muestra={{ etiqueta: 'Confirmar', archivo: 'lib/swal.ts', clases: [swalCustomClass.confirmButton] }} />
          <Muestra muestra={{ etiqueta: 'Cancelar', archivo: 'lib/swal.ts', clases: [swalCustomClass.cancelButton] }} />
        </Familia>

        <Familia numero={6} titulo="Acceso" vista="Acceso" origen="Compartida" fuente="components/auth/auth-split-layout.tsx (AUTH_PRIMARY_BUTTON)">
          <Muestra muestra={{ etiqueta: 'Iniciar sesión', archivo: 'components/auth/auth-split-layout.tsx', clases: [AUTH_PRIMARY_BUTTON] }} />
        </Familia>

        <Familia numero={7} titulo="Selector segmentado" vista="Ambas" origen="Compartida" fuente="components/ui/toggle-group.tsx (ToggleGroup, SEGMENTED_ITEM_CLASS)">
          <ToggleGroup type="single" variant="outline" size="sm" value={segmento} onValueChange={(v) => v && setSegmento(v)} aria-label="Periodo">
            <ToggleGroupItem value="semana" className={SEGMENTED_ITEM_CLASS}>
              Semana
            </ToggleGroupItem>
            <ToggleGroupItem value="mes" className={SEGMENTED_ITEM_CLASS}>
              Mes
            </ToggleGroupItem>
          </ToggleGroup>
        </Familia>

        <Familia numero={8} titulo="Pestañas de ficha" vista="Admin" origen="Compartida" fuente="components/admin/admin-tabs.ts (ADMIN_TAB_LIST, ADMIN_TAB_TRIGGER)">
          <Tabs defaultValue="resumen" className="w-full">
            <TabsList className={ADMIN_TAB_LIST}>
              <TabsTrigger value="resumen" className={ADMIN_TAB_TRIGGER}>
                Resumen
              </TabsTrigger>
              <TabsTrigger value="miembros" className={ADMIN_TAB_TRIGGER}>
                Miembros
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </Familia>

        <Familia numero={9} titulo="Filtro desplegable" vista="Ambas" origen="Compartida" fuente="components/dashboard/dashboard-search-field.tsx (DASHBOARD_FILTER_TRIGGER_CLASS)">
          <Select defaultValue="todos">
            <SelectTrigger aria-label="Tipo" className={`${DASHBOARD_FILTER_TRIGGER_CLASS} w-48`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              <SelectItem value="acceso">Acceso</SelectItem>
            </SelectContent>
          </Select>
        </Familia>

        <Familia numero={10} titulo="Paginador de tablas" vista="Ambas" origen="Compartida" fuente="components/dashboard/data-table.tsx (DataTablePager)">
          <DataTablePager pagina={pagina} totalPaginas={5} onPagina={setPagina} label="Paginación de ejemplo" />
        </Familia>

        <Familia
          numero={11}
          titulo="Acciones de horas"
          vista="Estudiante"
          origen="Compartida"
          fuente="components/hours/time-record-actions.tsx (TimeRecordActions)"
          nota="Disponibles y deshabilitadas; las deshabilitadas explican su motivo en un tooltip."
        >
          <TimeRecordActions record={REGISTRO} puedeEditar puedeRevocar onEdit={() => {}} onRevoke={() => {}} />
          <TimeRecordActions record={REGISTRO} puedeEditar={false} puedeRevocar={false} onEdit={() => {}} onRevoke={() => {}} />
        </Familia>

        <Familia numero={12} titulo="Menú de filtros del calendario" vista="Estudiante" origen="Compartida" fuente="components/calendar/calendar-filter-menu.tsx (CalendarFilterMenu)">
          <CalendarFilterMenu
            total={7}
            mostrarTareas={tareas}
            onToggleTareas={() => setTareas((t) => !t)}
            tiposOcultos={ocultos}
            onToggleTipo={alternarTipo}
            onMostrarTodo={() => {
              setTareas(true);
              setOcultos(new Set());
            }}
          />
        </Familia>

        {FAMILIAS_INLINE.map((familia, i) => {
          const muestras = BOTONES_INLINE[familia.clave];
          return (
            <Familia
              key={familia.clave}
              numero={13 + i}
              titulo={familia.titulo}
              vista={familia.vista}
              origen="En línea"
              fuente={[...new Set(muestras.map((m) => m.archivo))].join(' · ')}
              nota={familia.nota}
            >
              {muestras.map((m) => (
                <Muestra key={m.etiqueta} muestra={m} />
              ))}
            </Familia>
          );
        })}
      </div>

      <ConfirmActionDialog
        open={confirmar !== null}
        title={`${confirmar?.[1] ?? ''} (ejemplo)`}
        description="Diálogo de muestra: confirmar no hace nada."
        actionLabel={confirmar?.[1] ?? ''}
        variant={confirmar?.[0] ?? 'default'}
        isPending={false}
        onConfirm={() => setConfirmar(null)}
        onCancel={() => setConfirmar(null)}
      />
    </div>
  );
}
