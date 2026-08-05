import { NIVEL_LABEL } from '@/types';
import type { NivelHabilidad } from '@/types';
import { ReadonlyField, SectionCommentReadonly } from '@/components/projects/detail/project-general-info-section';

const labelClass = 'block text-[10px] font-black uppercase tracking-widest text-tertiary mb-1.5';

interface RequisitoHabilidadItem {
  idRequisitoHabilidad: number;
  nivelMinimo: string;
  obligatorio: boolean;
  habilidad: { nombreHabilidad: string };
}

interface RolItem {
  idRolProyecto: number;
  nombreRol: string;
  cupos: number;
  descripcionRolProyecto: string | null;
  carreraRequerida: { nombreCarrera: string } | null;
  horasSemanalesEstimadas: number | null;
  requisitos: RequisitoHabilidadItem[];
}

interface ProjectRolesSkillsSectionProps {
  roles: RolItem[];
  mostrarComentario: boolean;
  comentario?: string;
  /** Variante visual del comentario ('field' por defecto, igual que T10/T11). */
  commentVariant?: 'field' | 'plain';
}

export function ProjectRolesSkillsSection({
  roles,
  mostrarComentario,
  comentario,
  commentVariant = 'field',
}: ProjectRolesSkillsSectionProps) {
  return (
    <section>
      <h2 className="text-[10px] font-black uppercase tracking-widest text-primary mb-5">
        Roles y habilidades
      </h2>
      {roles.length === 0 ? (
        <p className="text-sm text-tertiary italic">Sin roles definidos.</p>
      ) : (
        <div className="space-y-4">
          {roles.map((rol, i) => (
            <div key={rol.idRolProyecto} className="rounded-xl border border-outline-variant/40 bg-surface-container-lowest p-5 space-y-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-tertiary">Rol {i + 1}</p>
              <div className="grid grid-cols-2 gap-4">
                <ReadonlyField label="Nombre del rol" value={rol.nombreRol} />
                <ReadonlyField label="Cupos" value={String(rol.cupos)} />
              </div>
              {rol.descripcionRolProyecto && (
                <ReadonlyField label="Descripción del rol" value={rol.descripcionRolProyecto} />
              )}
              <div className="grid grid-cols-2 gap-4">
                {rol.carreraRequerida && <ReadonlyField label="Carrera requerida" value={rol.carreraRequerida.nombreCarrera} />}
                {rol.horasSemanalesEstimadas != null && <ReadonlyField label="Horas semanales" value={String(rol.horasSemanalesEstimadas)} />}
              </div>
              {rol.requisitos.length > 0 && (
                <div>
                  <label className={labelClass}>Habilidades requeridas</label>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {rol.requisitos.map((req) => (
                      <span key={req.idRequisitoHabilidad} className="inline-flex items-center gap-1.5 rounded-lg bg-surface-container-high px-3 py-1.5 text-xs font-medium text-on-surface">
                        {req.habilidad.nombreHabilidad}
                        <span className="text-tertiary">·</span>
                        <span className="text-tertiary">{NIVEL_LABEL[req.nivelMinimo as NivelHabilidad] ?? req.nivelMinimo}</span>
                        {req.obligatorio && <span className="text-error font-bold ml-0.5">*</span>}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {mostrarComentario && <SectionCommentReadonly comment={comentario} variant={commentVariant} />}
    </section>
  );
}
