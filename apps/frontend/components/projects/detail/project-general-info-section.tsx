import { MessageSquare } from 'lucide-react';
import { TIPO_LABEL, MODALIDAD_LABEL } from '@/types';
import type { TipoProyecto, ModalidadProyecto } from '@/types';

const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-tertiary mb-1.5';

function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('es-GT', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso));
  } catch { return iso; }
}

export function ReadonlyField({ label, value }: { label: string; value: string | null | undefined }) {
  const display = value == null || value === '' ? '—' : value;
  const isEmpty = display === '—';
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className={`w-full rounded-xl border px-4 py-3 text-sm whitespace-pre-wrap min-h-11 ${
        isEmpty
          ? 'border-outline-variant/20 bg-surface-container-lowest text-tertiary italic'
          : 'border-outline-variant/30 bg-surface-container-low/60 text-on-surface'
      }`}>
        {display}
      </div>
    </div>
  );
}

export function SectionCommentReadonly({
  comment,
  variant = 'field',
}: {
  comment?: string;
  /** 'field' (default, T10/T11): caja interior con fallback. 'plain' (histórico/snapshot): texto plano equivalente al markup previo a T12, sin caja interior. */
  variant?: 'field' | 'plain';
}) {
  return (
    <div className="mt-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <MessageSquare className="h-3.5 w-3.5 text-amber-500 shrink-0" />
        <span className="text-[10px] font-black uppercase tracking-widest text-amber-600">
          Comentarios del revisor
        </span>
      </div>
      {variant === 'plain' ? (
        <p className="text-sm text-on-surface whitespace-pre-wrap">{comment}</p>
      ) : (
        <div className="w-full rounded-lg border border-amber-500/30 bg-transparent px-3 py-2.5 text-sm min-h-18 text-on-surface whitespace-pre-wrap">
          {comment?.trim() || (
            <span className="text-outline-variant italic">Sin comentarios aún.</span>
          )}
        </div>
      )}
    </div>
  );
}

interface ProjectGeneralInfoSectionProps {
  tituloProyecto: string;
  descripcionProyecto: string | null;
  tipoProyecto: string;
  modalidadProyecto: string;
  objetivosProyecto: string | null;
  contextoAcademico: string | null;
  ubicacionProyecto: string | null;
  fechaInicio: string | null;
  fechaFinEstimada: string | null;
  urlRecursoExterno: string | null;
  mostrarComentario: boolean;
  comentario?: string;
  /** Variante visual del comentario ('field' por defecto, igual que T10/T11). */
  commentVariant?: 'field' | 'plain';
}

export function ProjectGeneralInfoSection({
  tituloProyecto,
  descripcionProyecto,
  tipoProyecto,
  modalidadProyecto,
  objetivosProyecto,
  contextoAcademico,
  ubicacionProyecto,
  fechaInicio,
  fechaFinEstimada,
  urlRecursoExterno,
  mostrarComentario,
  comentario,
  commentVariant = 'field',
}: ProjectGeneralInfoSectionProps) {
  return (
    <section>
      <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
        Información general
      </h2>
      <div className="space-y-4">
        <ReadonlyField label="Título del proyecto" value={tituloProyecto} />
        <ReadonlyField label="Descripción" value={descripcionProyecto} />
        <div className="grid grid-cols-2 gap-4">
          <ReadonlyField label="Tipo" value={TIPO_LABEL[tipoProyecto as TipoProyecto] ?? tipoProyecto} />
          <ReadonlyField label="Modalidad" value={MODALIDAD_LABEL[modalidadProyecto as ModalidadProyecto] ?? modalidadProyecto} />
        </div>
        <ReadonlyField label="Objetivos" value={objetivosProyecto} />
        <div className="grid grid-cols-2 gap-4">
          <ReadonlyField label="Contexto académico" value={contextoAcademico} />
          <ReadonlyField label="Ubicación" value={ubicacionProyecto} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <ReadonlyField label="Fecha de inicio" value={formatDate(fechaInicio)} />
          <ReadonlyField label="Fecha fin estimada" value={formatDate(fechaFinEstimada)} />
        </div>
        <ReadonlyField label="URL recurso externo" value={urlRecursoExterno} />
      </div>
      {mostrarComentario && <SectionCommentReadonly comment={comentario} variant={commentVariant} />}
    </section>
  );
}
