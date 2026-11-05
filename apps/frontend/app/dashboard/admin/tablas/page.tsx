'use client';

import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { AlertCircle, ArrowDown, ArrowUp, ArrowUpDown, Download, Eye, X } from 'lucide-react';
import { toast } from 'sonner';
import { AdminBreadcrumb } from '@/components/admin/admin-breadcrumb';
import { ADMIN_PAGE, ADMIN_PAGE_LEAD, ADMIN_PAGE_TITLE } from '@/components/admin/admin-page';
import {
  DATA_TABLE_CARD,
  DATA_TABLE_HEAD_ROW,
  DATA_TABLE_HEAD_TEXT,
  DATA_TABLE_ROW_BORDER,
  DATA_TABLE_ROW_HOVER,
  DataTablePager,
} from '@/components/dashboard/data-table';
import { DASHBOARD_FILTER_TRIGGER_CLASS, DashboardSearchField } from '@/components/dashboard/dashboard-search-field';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { Button } from '@/components/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageTitle } from '@/components/ui/page-title';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton, SkeletonRegion } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { downloadBlob } from '@/lib/download-file';
import {
  getTablaCsv,
  getTablaPagina,
  getTablaRegistro,
  getTablas,
  type TablaConsulta,
  type TablaFila,
  type TablaMeta,
} from '@/lib/services/admin-sistema';

const TODOS = '__todos__';
const LIMITE = 20;
const FECHA_ISO = /^\d{4}-\d{2}-\d{2}T/;
const SELECT = `w-full ${DASHBOARD_FILTER_TRIGGER_CLASS} data-[size=default]:h-11.5`;

const etiquetaColumna = (columna: string): string => {
  const texto = columna.replace(/([A-Z])/g, ' $1').toLowerCase();
  return texto.charAt(0).toUpperCase() + texto.slice(1);
};

function formatearValor(valor: TablaFila[string]): string {
  if (valor === null || valor === undefined || valor === '') return '—';
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No';
  if (typeof valor === 'string' && FECHA_ISO.test(valor)) {
    return new Intl.DateTimeFormat('es-GT', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Guatemala' }).format(
      new Date(valor),
    );
  }
  return String(valor);
}

function DetalleRegistro({ entidad, meta, id, onClose }: { entidad: string; meta: TablaMeta; id: string | null; onClose: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['adminTablaRegistro', entidad, id],
    queryFn: () => getTablaRegistro(entidad, id as string),
    enabled: id !== null,
    retry: false,
  });
  return (
    <Sheet open={id !== null} onOpenChange={(abierto) => !abierto && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 border-l border-outline-variant bg-surface p-0 sm:max-w-[460px] lg:max-w-[520px]"
      >
        <SheetHeader className="shrink-0 border-b border-outline-variant bg-surface-container-lowest px-stack py-stack">
          <SheetTitle>
            Detalle: {meta.etiqueta} n.º {id}
          </SheetTitle>
          <SheetDescription>Solo lectura. Aquí se muestran los datos completos del registro.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-stack py-stack">
          {isLoading ? (
            <SkeletonRegion className="flex flex-col gap-stack" label="Cargando el registro">
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
              <Skeleton className="h-5 w-full" />
            </SkeletonRegion>
          ) : isError || !data ? (
            <p role="alert" className="type-body text-text-secondary">
              No se pudo cargar el registro.
            </p>
          ) : (
            <dl>
              {meta.columnas.map((columna) => (
                <div
                  key={columna}
                  className="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-inline border-b border-outline-variant/50 py-tight last:border-b-0 sm:grid-cols-[minmax(0,10rem)_minmax(0,1fr)]"
                >
                  <dt className="type-meta font-semibold">{etiquetaColumna(columna)}</dt>
                  <dd className="type-body min-w-0 break-words text-text-primary">{formatearValor(data[columna])}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function TablaEntidad({ meta }: { meta: TablaMeta }) {
  // `borrador` es lo que se escribe; `aplicada`, la consulta que se envía al pulsar «Aplicar».
  const [borrador, setBorrador] = useState<{ q: string; filtros: Record<string, string> }>({ q: '', filtros: {} });
  const [aplicada, setAplicada] = useState(borrador);
  const [orden, setOrden] = useState<{ columna: string; dir: 'asc' | 'desc' } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [seleccion, setSeleccion] = useState<string | null>(null);
  const [exportando, setExportando] = useState(false);

  const consulta: TablaConsulta = {
    q: aplicada.q,
    filtros: aplicada.filtros,
    orden: orden?.columna,
    dir: orden?.dir,
    pagina,
    limite: LIMITE,
  };
  const { data, isLoading, isError, error, isPlaceholderData, refetch } = useQuery({
    queryKey: ['adminTabla', meta.clave, consulta],
    queryFn: () => getTablaPagina(meta.clave, consulta),
    placeholderData: keepPreviousData,
    retry: false,
  });

  const hayFiltros = aplicada.q !== '' || Object.values(aplicada.filtros).some((v) => v !== '');
  const totalPaginas = data ? Math.max(1, Math.ceil(data.total / data.limite)) : 1;
  const idDe = (fila: TablaFila) => String(fila[meta.columnas[0]]);

  const aplicar = (siguiente: typeof borrador) => {
    setBorrador(siguiente);
    setAplicada(siguiente);
    setPagina(1);
  };

  const ordenarPor = (columna: string) => {
    setOrden((actual) => (actual?.columna === columna && actual.dir === 'asc' ? { columna, dir: 'desc' } : { columna, dir: 'asc' }));
    setPagina(1);
  };

  const exportar = async () => {
    setExportando(true);
    try {
      downloadBlob(await getTablaCsv(meta.clave, consulta), `${meta.clave}.csv`);
    } catch (e) {
      toast.error(getApiErrorMessage(e, 'admin', 'No se pudo exportar el CSV.'));
    } finally {
      setExportando(false);
    }
  };

  const fijarFiltro = (columna: string, valor: string) =>
    setBorrador((b) => ({ ...b, filtros: { ...b.filtros, [columna]: valor } }));

  return (
    <div className="flex flex-col gap-stack">
      <form
        role="search"
        aria-label={`Filtros de ${meta.etiqueta}`}
        onSubmit={(e) => {
          e.preventDefault();
          aplicar(borrador);
        }}
        className="grid grid-cols-1 items-end gap-stack sm:grid-cols-2 xl:grid-cols-4"
      >
        {meta.busqueda && (
          <div className="flex min-w-0 flex-col gap-tight sm:col-span-2">
            <Label htmlFor="tabla-busqueda">Buscar</Label>
            <DashboardSearchField
              id="tabla-busqueda"
              placeholder={`Buscar en ${meta.etiqueta.toLowerCase()}`}
              value={borrador.q}
              onChange={(e) => setBorrador((b) => ({ ...b, q: e.target.value }))}
            />
          </div>
        )}
        {meta.filtros.map((filtro) => {
          const id = `tabla-filtro-${filtro.columna}`;
          const valor = borrador.filtros[filtro.columna] ?? '';
          const opciones = filtro.tipo === 'bool' ? ['true', 'false'] : filtro.valores;
          return (
            <div key={filtro.columna} className="flex min-w-0 flex-col gap-tight">
              <Label htmlFor={id}>{etiquetaColumna(filtro.columna)}</Label>
              {opciones ? (
                <Select value={valor || TODOS} onValueChange={(v) => fijarFiltro(filtro.columna, v === TODOS ? '' : v)}>
                  <SelectTrigger id={id} className={SELECT}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={TODOS}>Todos</SelectItem>
                    {opciones.map((o) => (
                      <SelectItem key={o} value={o}>
                        {filtro.tipo === 'bool' ? (o === 'true' ? 'Sí' : 'No') : o}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  id={id}
                  className={DASHBOARD_FILTER_TRIGGER_CLASS}
                  inputMode={filtro.tipo === 'int' ? 'numeric' : undefined}
                  autoComplete="off"
                  value={valor}
                  onChange={(e) => fijarFiltro(filtro.columna, e.target.value)}
                />
              )}
            </div>
          );
        })}
        <div className="flex flex-wrap items-center gap-inline sm:col-span-2 xl:col-span-4">
          <Button type="submit">Aplicar</Button>
          <Button type="button" variant="outline" disabled={!hayFiltros && borrador.q === ''} onClick={() => aplicar({ q: '', filtros: {} })}>
            <X aria-hidden="true" />
            Limpiar filtros
          </Button>
          <Button type="button" variant="outline" className="sm:ml-auto" disabled={exportando} onClick={() => void exportar()}>
            <Download aria-hidden="true" />
            {exportando ? 'Exportando…' : 'Exportar CSV'}
          </Button>
        </div>
      </form>

      {isError ? (
        <Empty tone="danger" role="alert">
          <EmptyMedia variant="icon">
            <AlertCircle aria-hidden="true" className="size-7" />
          </EmptyMedia>
          <EmptyHeader>
            <EmptyTitle>No se pudo consultar la tabla.</EmptyTitle>
            <EmptyDescription>{getApiErrorMessage(error, 'admin')}</EmptyDescription>
          </EmptyHeader>
          <Button type="button" variant="outline" size="sm" onClick={() => void refetch()}>
            Reintentar
          </Button>
        </Empty>
      ) : isLoading || !data ? (
        <SkeletonRegion className={DATA_TABLE_CARD} label={`Cargando ${meta.etiqueta}`}>
          <div className="flex flex-col gap-stack p-stack">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-5 w-full" />
            ))}
          </div>
        </SkeletonRegion>
      ) : data.filas.length === 0 ? (
        <Empty tone="muted" role="status">
          <EmptyHeader>
            <EmptyTitle>{hayFiltros ? 'Ningún registro coincide con estos filtros.' : 'Esta tabla no tiene registros.'}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <p className="type-body text-text-secondary" role="status" aria-live="polite">
            Registros encontrados: <span className="font-semibold tabular-nums text-text-primary">{data.total}</span>
          </p>
          <div aria-busy={isPlaceholderData || undefined} className={isPlaceholderData ? 'opacity-60' : undefined}>
            <div className={DATA_TABLE_CARD}>
              <Table containerLabel={`Tabla ${meta.etiqueta}, desplázala para ver todas las columnas`}>
                <caption className="sr-only">{meta.etiqueta}, solo lectura</caption>
                <TableHeader>
                  <TableRow className={`${DATA_TABLE_HEAD_ROW} hover:bg-surface-container-low`}>
                    {meta.columnas.map((columna) => {
                      const activa = orden?.columna === columna;
                      const Icono = !activa ? ArrowUpDown : orden.dir === 'asc' ? ArrowUp : ArrowDown;
                      return (
                        <TableHead
                          key={columna}
                          scope="col"
                          aria-sort={activa ? (orden.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                          className={`h-auto whitespace-nowrap px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`}
                        >
                          <Button type="button" variant="ghost" size="sm" onClick={() => ordenarPor(columna)}>
                            {etiquetaColumna(columna)}
                            <Icono aria-hidden="true" />
                          </Button>
                        </TableHead>
                      );
                    })}
                    <TableHead scope="col" className={`h-auto px-stack py-tight ${DATA_TABLE_HEAD_TEXT}`}>
                      Detalle
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.filas.map((fila) => (
                    <TableRow key={idDe(fila)} className={`${DATA_TABLE_ROW_BORDER} ${DATA_TABLE_ROW_HOVER}`}>
                      {meta.columnas.map((columna) => (
                        <TableCell key={columna} className="whitespace-nowrap px-stack py-inline align-top tabular-nums">
                          {formatearValor(fila[columna])}
                        </TableCell>
                      ))}
                      <TableCell className="px-stack py-inline align-top">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          aria-label={`Ver detalle del registro ${idDe(fila)} de ${meta.etiqueta}`}
                          onClick={() => setSeleccion(idDe(fila))}
                        >
                          <Eye aria-hidden="true" />
                          Ver
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
          {totalPaginas > 1 && (
            <DataTablePager pagina={pagina} totalPaginas={totalPaginas} onPagina={setPagina} label={`Paginación de ${meta.etiqueta}`} />
          )}
        </>
      )}

      <DetalleRegistro entidad={meta.clave} meta={meta} id={seleccion} onClose={() => setSeleccion(null)} />
    </div>
  );
}

export default function AdminTablasPage() {
  const { data: tablas, isLoading, isError } = useQuery({ queryKey: ['adminTablas'], queryFn: getTablas, retry: false });
  const [clave, setClave] = useState<string | null>(null);
  const meta = tablas?.find((t) => t.clave === clave) ?? tablas?.[0];

  return (
    <div className={ADMIN_PAGE}>
      <AdminBreadcrumb seccion="Sistema" pagina="Tablas del sistema" />
      <section className="mb-8">
        <PageTitle className={ADMIN_PAGE_TITLE}>Tablas del sistema</PageTitle>
        <p className={ADMIN_PAGE_LEAD}>
          Consulta de solo lectura. Los correos aparecen enmascarados en la lista y completos en el detalle. Para editar o
          eliminar un registro usa las pantallas de gestión correspondientes.
        </p>
      </section>

      {isLoading ? (
        <SkeletonRegion className="flex flex-col gap-stack" label="Cargando las tablas disponibles">
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-40 w-full" />
        </SkeletonRegion>
      ) : isError || !tablas || !meta ? (
        <p role="alert" className="card-base type-body text-text-secondary">
          No se pudo cargar la lista de tablas.
        </p>
      ) : (
        <div className="flex flex-col gap-stack">
          <div className="flex max-w-sm flex-col gap-tight">
            <Label htmlFor="tabla-entidad">Tabla</Label>
            <Select value={meta.clave} onValueChange={setClave}>
              <SelectTrigger id="tabla-entidad" className={SELECT}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tablas.map((t) => (
                  <SelectItem key={t.clave} value={t.clave}>
                    {t.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <TablaEntidad key={meta.clave} meta={meta} />
        </div>
      )}
    </div>
  );
}
