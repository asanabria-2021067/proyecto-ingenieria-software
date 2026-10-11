import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';
import { ResumenKpi } from '@/components/dashboard/resumen-kpi';
import { SITUACION_CIERRE } from '@/lib/admin/request-status';
import { IconoTipo } from '@/components/hours/my-hours-project-list';
import {
  RequestInboxCard,
  RequestInboxKpis,
  RequestInboxSection,
} from '@/components/admin/request-inbox';
import {
  REQUEST_INBOX_BUTTON,
  REQUEST_INBOX_BUTTON_CONSULT,
  RequestInboxDetails,
} from '@/components/admin/request-inbox-details';
import { BOTON_CERRADO } from '@/components/projects/available-project-card';
import { Button } from '@/components/ui/button';
import { formatInstanteGuatemala } from '@/lib/admin/sprint-calendar';
import type { AdminProjectListItem, AdminProjectsPage, ClosureRequestSituation } from '@/lib/types/admin-projects';

/**
 * Bandeja de «Solicitudes de cierre» por etapas, con el mismo lenguaje visual
 * de «Solicitudes de publicación».
 *
 * La etapa de cada solicitud y los contadores vienen del backend; aquí solo
 * se agrupan y se presentan. Ningún veredicto se emite desde la bandeja: toda
 * acción abre el detalle, que es donde se revisan requisitos y documentos.
 */

const hrefCierre = (idProyecto: number) => `/dashboard/admin/proyectos/${idProyecto}/cierre`;
const hrefProyecto = (idProyecto: number) => `/dashboard/admin/proyectos/${idProyecto}`;

/**
 * Enlace al detalle con forma de botón compacto; nunca resuelve nada desde la
 * bandeja. `decision`: el verde grisáceo de «Cerrado» de Mis Proyectos, abre una entrega por resolver. `neutro`: el botón
 * oscuro por defecto, el mismo «Ver proyecto» de Actividad reciente del panel,
 * para lo que solo lleva al detalle del proyecto. El resto: verde de consulta.
 */
function Accion({
  href,
  decision = false,
  neutro = false,
  texto,
  proyecto,
}: {
  href: string;
  decision?: boolean;
  neutro?: boolean;
  texto: string;
  proyecto: string;
}) {
  const tono = decision ? BOTON_CERRADO : neutro ? '' : REQUEST_INBOX_BUTTON_CONSULT;
  return (
    <Button asChild size="sm" className={`${REQUEST_INBOX_BUTTON} ${tono}`}>
      <Link href={href} aria-label={`${texto}: ${proyecto}`}>
        {texto}
      </Link>
    </Button>
  );
}

function lider(item: AdminProjectListItem): string {
  return `Líder: ${item.lider.nombre} ${item.lider.apellido}`;
}

/** Entrega enviada (pendiente o reenviada): se revisa en el detalle del cierre. */
function SolicitudEnviada({ item }: { item: AdminProjectListItem }) {
  const cierre = item.cierre;
  return (
    <RequestInboxCard
      icon={<IconoTipo tipo={item.tipoProyecto} />}
      actions={<Accion href={hrefCierre(item.idProyecto)} decision texto="Revisar cierre" proyecto={item.tituloProyecto} />}
    >
      <RequestInboxDetails titulo={item.tituloProyecto} tipo={item.tipoProyecto}>
        {lider(item)}
        {cierre?.numeroRevision != null && <> · Envío #{cierre.numeroRevision}</>}
        {cierre?.enviadaEn && <> · Recibida el {formatInstanteGuatemala(cierre.enviadaEn)}</>}
        {cierre?.origen === 'NUEVA_SOLICITUD_TRAS_DEVOLUCION' && <> · Nueva solicitud tras una devolución a ejecución</>}
        {cierre?.correccionSolicitadaEn && (
          <> · Corrección solicitada el {formatInstanteGuatemala(cierre.correccionSolicitadaEn)}</>
        )}
      </RequestInboxDetails>
    </RequestInboxCard>
  );
}

/** El administrador pidió una corrección documental y el responsable aún no reenvía. */
function SolicitudEnEspera({ item }: { item: AdminProjectListItem }) {
  const solicitadaEn = item.cierre?.correccionSolicitadaEn;
  return (
    <RequestInboxCard
      icon={<IconoTipo tipo={item.tipoProyecto} />}
      tone="waiting"
      actions={<Accion href={hrefCierre(item.idProyecto)} texto="Ver solicitud" proyecto={item.tituloProyecto} />}
    >
      <RequestInboxDetails titulo={item.tituloProyecto} tipo={item.tipoProyecto}>
        {lider(item)}
        {solicitadaEn ? <> · Corrección solicitada el {formatInstanteGuatemala(solicitadaEn)}</> : <> · Corrección solicitada</>}
      </RequestInboxDetails>
    </RequestInboxCard>
  );
}

/** Sin entrega (legacy) o con datos inconsistentes: solo se consulta el proyecto. */
function SolicitudSoloConsulta({ item, nota }: { item: AdminProjectListItem; nota: string }) {
  return (
    <RequestInboxCard
      icon={<IconoTipo tipo={item.tipoProyecto} />}
      actions={<Accion href={hrefProyecto(item.idProyecto)} neutro texto="Ver proyecto" proyecto={item.tituloProyecto} />}
    >
      <RequestInboxDetails titulo={item.tituloProyecto} tipo={item.tipoProyecto}>
        {lider(item)} · {nota}
      </RequestInboxDetails>
    </RequestInboxCard>
  );
}

export function ClosureRequestsInbox({ data }: { data: AdminProjectsPage }) {
  // Un proyecto sin bloque `cierre` no debería existir en este grupo; si llega,
  // se muestra como dato sin clasificar en vez de esconderlo.
  const de = (situacion: ClosureRequestSituation) =>
    data.items.filter((item) => (item.cierre?.situacion ?? 'SIN_CLASIFICACION') === situacion);
  const pendientes = de('PENDIENTE_DE_EVALUACION');
  const reenviadas = de('REENVIADA_PARA_REVISION');
  const enEspera = de('EN_ESPERA_DE_CORRECCIONES');
  const sinEntrega = de('SIN_ENTREGA_FORMAL');
  const sinClasificar = de('SIN_CLASIFICACION');
  // Los indicadores son los conteos globales del backend, no el largo de lo pintado.
  const conteo = (situacion: ClosureRequestSituation, visibles: number) => data.resumenCierre?.[situacion] ?? visibles;

  return (
    <div className="space-y-10">
      <RequestInboxKpis columns={4}>
        <ResumenKpi label="Pendientes de evaluación" valor={conteo('PENDIENTE_DE_EVALUACION', pendientes.length)} punto={SITUACION_CIERRE.PENDIENTE_DE_EVALUACION.punto} />
        <ResumenKpi label="Reenviadas para revisión" valor={conteo('REENVIADA_PARA_REVISION', reenviadas.length)} punto={SITUACION_CIERRE.REENVIADA_PARA_REVISION.punto} />
        <ResumenKpi label="En espera de correcciones" valor={conteo('EN_ESPERA_DE_CORRECCIONES', enEspera.length)} punto={SITUACION_CIERRE.EN_ESPERA_DE_CORRECCIONES.punto} />
        <ResumenKpi label="Sin entrega formal" valor={conteo('SIN_ENTREGA_FORMAL', sinEntrega.length)} punto={SITUACION_CIERRE.SIN_ENTREGA_FORMAL.punto} />
      </RequestInboxKpis>

      {sinClasificar.length > 0 && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-card border border-outline-variant bg-surface-container-low px-5 py-4 text-sm text-on-surface"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-attention-strong dark:text-attention" aria-hidden="true" />
          <p>
            {sinClasificar.length === 1
              ? '1 solicitud tiene un historial de cierre inconsistente y no pudo clasificarse.'
              : `${sinClasificar.length} solicitudes tienen un historial de cierre inconsistente y no pudieron clasificarse.`}{' '}
            <a href="#cierres-sin-clasificar" className="font-semibold underline underline-offset-4">
              Ver cuáles
            </a>
          </p>
        </div>
      )}

      <RequestInboxSection
        title="Pendientes de evaluación"
        empty="No hay solicitudes pendientes de evaluación."
        isEmpty={pendientes.length === 0}
      >
        {pendientes.map((item) => (
          <SolicitudEnviada key={item.idProyecto} item={item} />
        ))}
      </RequestInboxSection>

      <RequestInboxSection
        title="Reenviadas para revisión"
        empty="No hay solicitudes reenviadas para revisión."
        isEmpty={reenviadas.length === 0}
      >
        {reenviadas.map((item) => (
          <SolicitudEnviada key={item.idProyecto} item={item} />
        ))}
      </RequestInboxSection>

      <RequestInboxSection
        title="En espera de correcciones"
        empty="No hay solicitudes esperando correcciones."
        isEmpty={enEspera.length === 0}
      >
        {enEspera.map((item) => (
          <SolicitudEnEspera key={item.idProyecto} item={item} />
        ))}
      </RequestInboxSection>

      <RequestInboxSection
        title="Sin entrega formal"
        empty="No hay proyectos sin entrega formal."
        isEmpty={sinEntrega.length === 0}
      >
        {sinEntrega.map((item) => (
          <SolicitudSoloConsulta key={item.idProyecto} item={item} nota="Sin entrega formal registrada" />
        ))}
      </RequestInboxSection>

      {sinClasificar.length > 0 && (
        <div id="cierres-sin-clasificar" className="scroll-mt-24">
          <RequestInboxSection title="Sin clasificar" empty="" isEmpty={false}>
            {sinClasificar.map((item) => (
              <SolicitudSoloConsulta key={item.idProyecto} item={item} nota="Historial de cierre inconsistente" />
            ))}
          </RequestInboxSection>
        </div>
      )}
    </div>
  );
}
