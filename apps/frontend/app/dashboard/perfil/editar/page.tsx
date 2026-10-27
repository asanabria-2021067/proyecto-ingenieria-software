'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { 
  ChevronLeft, 
  ChevronRight, 
  Save, 
  Trash2, 
  Plus, 
  User as UserIcon, 
  BookOpen, 
  Sparkles, 
  Briefcase, 
  Globe 
} from 'lucide-react';
import { useCurrentUser } from '@/hooks/use-current-user';
import { 
  getProfileBootstrap, 
  updateProfile, 
  replaceHabilidades, 
  replaceIntereses, 
  replaceCualidades, 
  replaceExperiencias,
  type ProfileBootstrap 
} from '@/lib/services/users';
import uvgSwal from '@/lib/swal';
import { normalizeUrlInput } from '@/lib/security/safe-url';
import { createHabilidad, createInteres, createCualidad } from '@/lib/services/catalogs';
import { getApiErrorMessage } from '@/components/projects/api-error';
import { SkeletonDetail } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

const STEPS = [
  { title: 'Personal', icon: UserIcon, desc: 'Datos básicos y académicos' },
  { title: 'Habilidades', icon: BookOpen, desc: 'Tus competencias técnicas' },
  { title: 'Intereses', icon: Sparkles, desc: 'Áreas de interés y cualidades' },
  { title: 'Experiencia', icon: Briefcase, desc: 'Tus proyectos y roles previos' },
  { title: 'Enlaces', icon: Globe, desc: 'Portafolio y redes profesionales' },
];

const TIPO_EXP_LABEL: Record<string, string> = {
  PROYECTO_UNIVERSITARIO: 'Proyecto Universitario',
  PASANTIA: 'Pasantía',
  VOLUNTARIADO: 'Voluntariado',
  INVESTIGACION: 'Investigación',
  OTRO: 'Otro'
};

export default function EditarPerfilPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: user, isLoading: userLoading } = useCurrentUser();

  // --- Multi-step state ---
  const [step, setStep] = useState(0);
  const [bootstrapData, setBootstrapData] = useState<ProfileBootstrap | null>(null);
  const [loadingBootstrap, setLoadingBootstrap] = useState(true);
  const [saving, setSaving] = useState(false);

  // --- Step 1 State ---
  const [nombre, setNombre] = useState('');
  const [apellido, setApellido] = useState('');
  const [biografia, setBiografia] = useState('');
  const [idCarrera, setIdCarrera] = useState<number | null>(null);
  const [semestre, setSemestre] = useState<number | null>(null);
  const [disponibilidadHorasSemana, setDisponibilidadHorasSemana] = useState<number>(0);
  const [horasBecaRequeridas, setHorasBecaRequeridas] = useState<number | null>(null);
  const [horasExtensionRequeridas, setHorasExtensionRequeridas] = useState<number | null>(null);

  // --- Step 2 State (Habilidades) ---
  const [habilidadesUsuario, setHabilidadesUsuario] = useState<{
    idHabilidad: number;
    nombre: string;
    nivelHabilidad: 'BASICO' | 'INTERMEDIO' | 'AVANZADO';
    aniosExperiencia: number;
  }[]>([]);
  const [selHabilidadInput, setSelHabilidadInput] = useState('');
  const [selNivel, setSelNivel] = useState<'BASICO' | 'INTERMEDIO' | 'AVANZADO'>('BASICO');
  const [selAnios, setSelAnios] = useState<number>(0);

  // --- Step 3 State (Intereses y Cualidades) ---
  const [interesesSeleccionados, setInteresesSeleccionados] = useState<number[]>([]);
  const [interesInput, setInteresInput] = useState('');
  const [cualidadesSeleccionadas, setCualidadesSeleccionadas] = useState<number[]>([]);
  const [cualidadInput, setCualidadInput] = useState('');

  // --- Step 4 State (Experiencias) ---
  const [experienciasUsuario, setExperienciasUsuario] = useState<{
    idExperiencia?: number;
    tituloProyectoExperiencia: string;
    rolDesempenado: string;
    tipoExperiencia: string;
  }[]>([]);
  const [nuevaExpTitulo, setNuevaExpTitulo] = useState('');
  const [nuevaExpRol, setNuevaExpRol] = useState('');
  const [nuevaExpTipo, setNuevaExpTipo] = useState('PROYECTO_UNIVERSITARIO');

  // --- Step 5 State (Enlaces & CV) ---
  const [enlacePortafolio, setEnlacePortafolio] = useState('');
  const [githubUrl, setGithubUrl] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [urlCv, setUrlCv] = useState('');

  // Fetch catalogs and current profile state
  useEffect(() => {
    async function loadData() {
      try {
        const data = await getProfileBootstrap();
        setBootstrapData(data);

        // Prepopulate states from bootstrap profile
        const prof = data.profile;
        setNombre(user?.nombre || '');
        setApellido(user?.apellido || '');
        setBiografia(prof.biografia || '');
        setIdCarrera(prof.idCarrera);
        setSemestre(prof.semestre);
        setDisponibilidadHorasSemana(prof.disponibilidadHorasSemana || 0);
        setHorasBecaRequeridas(prof.horasBecaRequeridas);
        setHorasExtensionRequeridas(prof.horasExtensionRequeridas);
        setHabilidadesUsuario(prof.habilidades);
        setInteresesSeleccionados(prof.intereses);
        setCualidadesSeleccionadas(prof.cualidades);
        
        setEnlacePortafolio(prof.enlacePortafolio || '');
        setGithubUrl(prof.githubUrl || '');
        setLinkedinUrl(prof.linkedinUrl || '');
        setUrlCv(prof.urlCv || '');
      } catch (err) {
        console.error('Error loading profile catalogs:', err);
      } finally {
        setLoadingBootstrap(false);
      }
    }
    if (user) {
      loadData();
    }
  }, [user]);

  // Set initial experiences when user data is ready
  useEffect(() => {
    if (user?.experiencias) {
      setExperienciasUsuario(user.experiencias.map(exp => ({
        idExperiencia: exp.idExperiencia,
        tituloProyectoExperiencia: exp.tituloProyectoExperiencia,
        rolDesempenado: exp.rolDesempenado || '',
        tipoExperiencia: exp.tipoExperiencia
      })));
    }
  }, [user]);

  // --- Handlers for Skills ---
  const handleAddHabilidad = async () => {
    if (!selHabilidadInput.trim() || !bootstrapData) return;
    
    const inputVal = selHabilidadInput.trim();
    let targetId: number | null = null;
    let targetName = inputVal;

    const matched = bootstrapData.catalogs.habilidades.find(
      h => h.nombre.toLowerCase() === inputVal.toLowerCase()
    );

    if (matched) {
      targetId = Number(matched.id);
      targetName = matched.nombre;
    } else {
      try {
        const newHabilidad = await createHabilidad(inputVal);
        targetId = newHabilidad.idHabilidad;
        targetName = newHabilidad.nombreHabilidad;
        
        setBootstrapData({
          ...bootstrapData,
          catalogs: {
            ...bootstrapData.catalogs,
            habilidades: [...bootstrapData.catalogs.habilidades, { id: targetId.toString(), nombre: targetName }]
          }
        });
      } catch (error) {
        uvgSwal.fire({ icon: 'error', title: 'Error', text: 'No se pudo crear la habilidad.' });
        return;
      }
    }

    if (habilidadesUsuario.some(h => h.idHabilidad === targetId)) {
      uvgSwal.fire({
        icon: 'warning',
        title: 'Habilidad ya agregada',
        text: 'Ya has agregado esta habilidad a tu perfil.'
      });
      return;
    }

    setHabilidadesUsuario([
      ...habilidadesUsuario,
      {
        idHabilidad: targetId,
        nombre: targetName,
        nivelHabilidad: selNivel,
        aniosExperiencia: selAnios
      }
    ]);
    
    // Reset inputs
    setSelHabilidadInput('');
    setSelNivel('BASICO');
    setSelAnios(0);
  };

  const handleRemoveHabilidad = (idHabilidad: number) => {
    setHabilidadesUsuario(habilidadesUsuario.filter(h => h.idHabilidad !== idHabilidad));
  };

  // --- Handlers for Interests & Qualities ---
  const toggleInteres = (id: number) => {
    if (interesesSeleccionados.includes(id)) {
      setInteresesSeleccionados(interesesSeleccionados.filter(x => x !== id));
    } else {
      setInteresesSeleccionados([...interesesSeleccionados, id]);
    }
  };

  const toggleCualidad = (id: number) => {
    if (cualidadesSeleccionadas.includes(id)) {
      setCualidadesSeleccionadas(cualidadesSeleccionadas.filter(x => x !== id));
    } else {
      setCualidadesSeleccionadas([...cualidadesSeleccionadas, id]);
    }
  };

  // --- Handlers for Experiences ---
  const handleAddExperiencia = () => {
    if (!nuevaExpTitulo.trim() || !nuevaExpRol.trim()) {
      uvgSwal.fire({
        icon: 'warning',
        title: 'Campos incompletos',
        text: 'Por favor, introduce el título del proyecto y tu rol.'
      });
      return;
    }

    setExperienciasUsuario([
      ...experienciasUsuario,
      {
        tituloProyectoExperiencia: nuevaExpTitulo.trim(),
        rolDesempenado: nuevaExpRol.trim(),
        tipoExperiencia: nuevaExpTipo
      }
    ]);

    // Reset inputs
    setNuevaExpTitulo('');
    setNuevaExpRol('');
    setNuevaExpTipo('PROYECTO_UNIVERSITARIO');
  };

  const handleRemoveExperiencia = (index: number) => {
    setExperienciasUsuario(experienciasUsuario.filter((_, idx) => idx !== index));
  };

  // --- Final Save ---
  const handleSaveAll = async () => {
    setSaving(true);
    try {
      // 1. Update general info and links
      await updateProfile({
        nombre: nombre || undefined,
        apellido: apellido || undefined,
        biografia: biografia || undefined,
        idCarrera: idCarrera,
        semestre: semestre,
        disponibilidadHorasSemana: disponibilidadHorasSemana ? Number(disponibilidadHorasSemana) : undefined,
        horasBecaRequeridas: horasBecaRequeridas !== null ? Number(horasBecaRequeridas) : null,
        horasExtensionRequeridas: horasExtensionRequeridas !== null ? Number(horasExtensionRequeridas) : null,
        // G07 (OWASP25-C027): sin espacios y sin cadenas en blanco.
        enlacePortafolio: normalizeUrlInput(enlacePortafolio),
        githubUrl: normalizeUrlInput(githubUrl),
        linkedinUrl: normalizeUrlInput(linkedinUrl),
        urlCv: normalizeUrlInput(urlCv),
      });

      // 2. Update skills
      await replaceHabilidades(
        habilidadesUsuario.map(h => ({
          idHabilidad: h.idHabilidad,
          nivelHabilidad: h.nivelHabilidad
        }))
      );

      // 3. Update interests
      await replaceIntereses(interesesSeleccionados);

      // 4. Update qualities
      await replaceCualidades(cualidadesSeleccionadas);

      // 5. Update experiences
      await replaceExperiencias(
        experienciasUsuario.map(e => ({
          tituloProyectoExperiencia: e.tituloProyectoExperiencia,
          rolDesempenado: e.rolDesempenado,
          tipoExperiencia: e.tipoExperiencia
        }))
      );

      await queryClient.invalidateQueries({ queryKey: ['currentUser'] });

      await uvgSwal.fire({
        icon: 'success',
        title: 'Perfil Guardado',
        text: '¡Tu perfil profesional ha sido actualizado con éxito!',
        timer: 2000,
        showConfirmButton: false,
      });

      router.push('/dashboard/perfil');
    } catch (err: any) {
      console.error(err);
      uvgSwal.fire({
        icon: 'error',
        title: 'Error al guardar',
        text: getApiErrorMessage(err, 'general', 'Ocurrió un error inesperado al actualizar tu perfil.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    }
  };

  if (userLoading || loadingBootstrap) {
    return (
      <SkeletonDetail
        label="Cargando editor de perfil"
        sections={2}
        className="mx-auto max-w-[1400px] px-4 md:px-8 py-8 pb-24"
      />
    );
  }

  return (
      <div className="mx-auto max-w-[1400px] px-4 md:px-8 py-8 pb-24">
        {/* Header bar */}
        <div className="mb-8">
          <button
            onClick={() => router.push('/dashboard/perfil')}
            className="flex items-center gap-2 text-xs font-bold text-tertiary hover:text-on-surface transition-colors mb-4 cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
            Volver al perfil
          </button>
          <h1 className="type-display">
            Editar Perfil Profesional
          </h1>
          <p className="mt-1 text-sm text-on-surface-variant">
            Completa y personaliza tu portafolio en la UVG para destacar ante los proyectos.
          </p>
        </div>

        {/* Steps indicator */}
        <div className="mb-8 bg-surface-container-low border border-outline-variant/30 rounded-2xl p-4 md:p-6 shadow-sm">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-primary/10 text-primary">
                {(() => {
                  const CurrentIcon = STEPS[step].icon;
                  return <CurrentIcon className="w-6 h-6" />;
                })()}
              </div>
              <div>
                <p className="text-xs font-bold text-primary uppercase tracking-wider">Paso {step + 1} de {STEPS.length}</p>
                <p className="text-lg font-black text-on-surface leading-tight font-headline">{STEPS[step].title}</p>
              </div>
            </div>
            <p className="text-xs font-medium text-on-surface-variant">{STEPS[step].desc}</p>
          </div>
          
          {/* Progress bar container */}
          <div className="mt-6 flex gap-2">
            {STEPS.map((s, idx) => (
              <button
                key={s.title}
                onClick={() => setStep(idx)}
                className={`h-2 flex-1 rounded-full transition-all duration-300 cursor-pointer ${
                  idx <= step ? 'bg-primary' : 'bg-surface-container-high'
                }`}
                title={s.title}
              />
            ))}
          </div>
        </div>

        {/* Main Form container */}
        <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-2xl p-6 md:p-8 shadow-sm">
          {/* STEP 1: Datos Personales & Académicos */}
          {step === 0 && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                Información Personal y Académica
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="perfil-nombre" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Nombre</label>
                  <input id="perfil-nombre"
                    type="text"
                    required
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label htmlFor="perfil-apellido" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Apellido</label>
                  <input id="perfil-apellido"
                    type="text"
                    required
                    value={apellido}
                    onChange={(e) => setApellido(e.target.value)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label htmlFor="perfil-carrera" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Carrera</label>
                  <select id="perfil-carrera"
                    value={idCarrera || ''}
                    onChange={(e) => setIdCarrera(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Selecciona tu carrera</option>
                    {bootstrapData?.catalogs.carreras.map(c => (
                      <option key={c.id} value={c.id}>{c.nombre}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="perfil-semestre-actual" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Semestre Actual</label>
                  <input id="perfil-semestre-actual"
                    type="number"
                    min="1"
                    max="20"
                    value={semestre || ''}
                    onChange={(e) => setSemestre(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label htmlFor="perfil-disponibilidad-horas-sem" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Disponibilidad (horas/sem)</label>
                  <input id="perfil-disponibilidad-horas-sem"
                    type="number"
                    min="0"
                    max="168"
                    value={disponibilidadHorasSemana}
                    onChange={(e) => setDisponibilidadHorasSemana(Number(e.target.value))}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label htmlFor="perfil-horas-beca-requeridas" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Horas Beca Requeridas</label>
                  <input id="perfil-horas-beca-requeridas"
                    type="number"
                    min="0"
                    value={horasBecaRequeridas || ''}
                    onChange={(e) => setHorasBecaRequeridas(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label htmlFor="perfil-horas-extension-requeridas" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Horas Extensión Requeridas</label>
                  <input id="perfil-horas-extension-requeridas"
                    type="number"
                    min="0"
                    value={horasExtensionRequeridas || ''}
                    onChange={(e) => setHorasExtensionRequeridas(e.target.value ? Number(e.target.value) : null)}
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="perfil-biografia-profesional" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">Biografía Profesional</label>
                <textarea id="perfil-biografia-profesional"
                  value={biografia}
                  onChange={(e) => setBiografia(e.target.value)}
                  rows={4}
                  placeholder="Cuentanos sobre ti, tus intereses académicos, fortalezas y áreas en las que deseas crecer..."
                  className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
                />
              </div>
            </div>
          )}

          {/* STEP 2: Habilidades */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                Gestión de Habilidades
              </h2>
              
              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-6 space-y-4">
                <p className="text-xs font-black uppercase tracking-wider text-primary">Agregar Nueva Habilidad</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label htmlFor="perfil-seleccionar-habilidad" className="block text-xs font-bold text-tertiary mb-1">Seleccionar Habilidad</label>
                    <input id="perfil-seleccionar-habilidad"
                      type="text"
                      list="habilidades-list"
                      placeholder="Escribe o selecciona..."
                      value={selHabilidadInput}
                      onChange={(e) => setSelHabilidadInput(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                    <datalist id="habilidades-list">
                      {bootstrapData?.catalogs.habilidades.map(h => (
                        <option key={h.id} value={h.nombre} />
                      ))}
                    </datalist>
                  </div>
                  <div>
                    <label htmlFor="perfil-nivel-habilidad" className="block text-xs font-bold text-tertiary mb-1">Nivel Habilidad</label>
                    <select id="perfil-nivel-habilidad"
                      value={selNivel}
                      onChange={(e) => setSelNivel(e.target.value as any)}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2.5 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="BASICO">Básico (Aprendiendo)</option>
                      <option value="INTERMEDIO">Intermedio (Productivo)</option>
                      <option value="AVANZADO">Avanzado (Dominio completo)</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={handleAddHabilidad}
                      className="h-auto w-full gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-on-primary hover:bg-primary/95 has-[>svg]:px-4 motion-glow-primary"
                    >
                      <Plus className="w-4 h-4" />
                      Añadir habilidad
                    </Button>
                  </div>
                </div>
              </div>

              {/* Added Skills Grid */}
              <div className="space-y-3">
                <p className="text-xs font-black uppercase tracking-widest text-tertiary">Tus Habilidades Registradas</p>
                {habilidadesUsuario.length === 0 ? (
                  <p className="text-sm text-tertiary italic text-center py-6">No has agregado ninguna habilidad todavía.</p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {habilidadesUsuario.map(h => (
                      <div 
                        key={h.idHabilidad} 
                        className="flex justify-between items-center bg-surface-container-low border border-outline-variant/30 rounded-xl px-4 py-3 shadow-sm hover:shadow transition-shadow"
                      >
                        <div>
                          <p className="font-bold text-sm text-on-surface leading-snug">{h.nombre}</p>
                          <span className={`inline-block mt-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                            h.nivelHabilidad === 'AVANZADO' ? 'bg-primary/10 text-primary' :
                            h.nivelHabilidad === 'INTERMEDIO' ? 'bg-secondary-container text-on-secondary-container' :
                            'bg-surface-container-high text-on-surface-variant'
                          }`}>
                            {h.nivelHabilidad}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveHabilidad(h.idHabilidad)}
                          className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors cursor-pointer"
                          title="Eliminar habilidad"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 3: Intereses y Cualidades */}
          {step === 2 && (
            <div className="space-y-8">
              <div className="space-y-4">
                <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                  Áreas de Interés
                </h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  Haz clic en las categorías que más te llamen la atención. Las utilizaremos para sugerirte proyectos destacados.
                </p>
                <div className="mt-2">
                  <input 
                    type="text" 
                    placeholder="¿No encuentras tu interés? Escríbelo y presiona Enter"
                    aria-label="Añadir un interés que no está en la lista"
                    value={interesInput}
                    onChange={(e) => setInteresInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!interesInput.trim() || !bootstrapData) return;
                        const inputVal = interesInput.trim();
                        const existing = bootstrapData.catalogs.intereses.find(i => i.nombre.toLowerCase() === inputVal.toLowerCase());
                        let targetId = existing?.id;
                        if (!targetId) {
                          try {
                            const newI = await createInteres(inputVal);
                            targetId = newI.idInteres.toString();
                            setBootstrapData({
                              ...bootstrapData,
                              catalogs: {
                                ...bootstrapData.catalogs,
                                intereses: [...bootstrapData.catalogs.intereses, { id: targetId, nombre: newI.nombreInteres }]
                              }
                            });
                          } catch (err) { return; }
                        }
                        if (!interesesSeleccionados.includes(Number(targetId))) {
                          setInteresesSeleccionados([...interesesSeleccionados, Number(targetId)]);
                        }
                        setInteresInput('');
                      }
                    }}
                    className="w-full md:w-1/2 rounded-xl border border-outline-variant/30 bg-surface px-4 py-2.5 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  {bootstrapData?.catalogs.intereses.map(i => {
                    const isSelected = interesesSeleccionados.includes(Number(i.id));
                    return (
                      <button
                        key={i.id}
                        type="button"
                        onClick={() => toggleInteres(Number(i.id))}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-primary border-primary text-on-primary shadow-sm scale-102'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {i.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-4 border-t border-outline-variant/30 pt-6">
                <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                  Tus Cualidades Personales
                </h2>
                <p className="text-xs text-on-surface-variant leading-relaxed">
                  ¿Cuáles de estas palabras describen mejor tu forma de trabajar en equipo? Elige las cualidades que te representen.
                </p>
                <div className="mt-2">
                  <input 
                    type="text" 
                    placeholder="¿No encuentras tu cualidad? Escríbela y presiona Enter"
                    aria-label="Añadir una cualidad que no está en la lista"
                    value={cualidadInput}
                    onChange={(e) => setCualidadInput(e.target.value)}
                    onKeyDown={async (e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (!cualidadInput.trim() || !bootstrapData) return;
                        const inputVal = cualidadInput.trim();
                        const existing = bootstrapData.catalogs.cualidades.find(c => c.nombre.toLowerCase() === inputVal.toLowerCase());
                        let targetId = existing?.id;
                        if (!targetId) {
                          try {
                            const newC = await createCualidad(inputVal);
                            targetId = newC.idCualidad.toString();
                            setBootstrapData({
                              ...bootstrapData,
                              catalogs: {
                                ...bootstrapData.catalogs,
                                cualidades: [...bootstrapData.catalogs.cualidades, { id: targetId, nombre: newC.nombreCualidad }]
                              }
                            });
                          } catch (err) { return; }
                        }
                        if (!cualidadesSeleccionadas.includes(Number(targetId))) {
                          setCualidadesSeleccionadas([...cualidadesSeleccionadas, Number(targetId)]);
                        }
                        setCualidadInput('');
                      }
                    }}
                    className="w-full md:w-1/2 rounded-xl border border-outline-variant/30 bg-surface px-4 py-2.5 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="flex flex-wrap gap-2.5 mt-4">
                  {bootstrapData?.catalogs.cualidades.map(q => {
                    const isSelected = cualidadesSeleccionadas.includes(Number(q.id));
                    return (
                      <button
                        key={q.id}
                        type="button"
                        onClick={() => toggleCualidad(Number(q.id))}
                        className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider border transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-secondary border-secondary text-white shadow-sm scale-102'
                            : 'bg-surface-container-low border-outline-variant/30 text-on-surface hover:bg-surface-container-high'
                        }`}
                      >
                        {q.nombre}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Experiencias Previas */}
          {step === 3 && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                Experiencias Previas
              </h2>

              <div className="bg-surface-container-low border border-outline-variant/30 rounded-xl p-6 space-y-4">
                <p className="text-xs font-black uppercase tracking-wider text-primary">Agregar Nueva Experiencia</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="perfil-titulo-del-proyecto-empresa" className="block text-xs font-bold text-tertiary mb-1">Título del Proyecto / Empresa</label>
                    <input id="perfil-titulo-del-proyecto-empresa"
                      type="text"
                      placeholder="Ej. Rediseño del portal de biblioteca"
                      value={nuevaExpTitulo}
                      onChange={(e) => setNuevaExpTitulo(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label htmlFor="perfil-rol-desempenado" className="block text-xs font-bold text-tertiary mb-1">Rol Desempeñado</label>
                    <input id="perfil-rol-desempenado"
                      type="text"
                      placeholder="Ej. Desarrollador Frontend Lead"
                      value={nuevaExpRol}
                      onChange={(e) => setNuevaExpRol(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="perfil-tipo-de-experiencia" className="block text-xs font-bold text-tertiary mb-1">Tipo de Experiencia</label>
                    <select id="perfil-tipo-de-experiencia"
                      value={nuevaExpTipo}
                      onChange={(e) => setNuevaExpTipo(e.target.value)}
                      className="w-full rounded-xl border border-outline-variant/30 bg-surface px-3 py-2 text-sm text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      {Object.entries(TIPO_EXP_LABEL).map(([val, lbl]) => (
                        <option key={val} value={val}>{lbl}</option>
                      ))}
                    </select>
                  </div>
                  <div className="flex items-end">
                    <Button
                      type="button"
                      onClick={handleAddExperiencia}
                      className="h-auto w-full gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/95 has-[>svg]:px-4 motion-glow-primary"
                    >
                      <Plus className="w-4 h-4" />
                      Agregar Experiencia
                    </Button>
                  </div>
                </div>
              </div>

              {/* Added Experiences list */}
              <div className="space-y-4">
                <p className="text-xs font-black uppercase tracking-widest text-tertiary">Lista de Experiencias</p>
                {experienciasUsuario.length === 0 ? (
                  <p className="text-sm text-tertiary italic text-center py-6">No has agregado ninguna experiencia todavía.</p>
                ) : (
                  <div className="space-y-3">
                    {experienciasUsuario.map((exp, idx) => (
                      <div
                        key={idx}
                        className="flex justify-between items-center bg-surface-container-low border border-outline-variant/30 rounded-xl p-4 shadow-sm"
                      >
                        <div>
                          <p className="font-bold text-sm text-on-surface">{exp.tituloProyectoExperiencia}</p>
                          <p className="text-xs text-on-surface-variant font-medium mt-0.5">Rol: {exp.rolDesempenado}</p>
                          <span className="inline-block mt-1 text-[9px] font-black uppercase px-2 py-0.5 rounded bg-tertiary/10 text-tertiary">
                            {TIPO_EXP_LABEL[exp.tipoExperiencia] || exp.tipoExperiencia}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveExperiencia(idx)}
                          className="p-2 rounded-lg text-error hover:bg-error/10 transition-colors cursor-pointer"
                          title="Eliminar experiencia"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: Enlaces y CV */}
          {step === 4 && (
            <div className="space-y-6">
              <h2 className="text-xl font-black text-on-surface font-headline border-b border-outline-variant/30 pb-3">
                Enlaces y Portafolio Digital
              </h2>

              <div className="space-y-5">
                <div>
                  <label htmlFor="perfil-enlace-de-cv-drive-dropbox-pdf-publico" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">
                    Enlace de CV (Drive, Dropbox, PDF público)
                  </label>
                  <input id="perfil-enlace-de-cv-drive-dropbox-pdf-publico"
                    type="url"
                    value={urlCv}
                    onChange={(e) => setUrlCv(e.target.value)}
                    placeholder="https://drive.google.com/file/d/..."
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="perfil-sitio-web-o-portafolio-personal" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">
                    Sitio Web o Portafolio Personal
                  </label>
                  <input id="perfil-sitio-web-o-portafolio-personal"
                    type="url"
                    value={enlacePortafolio}
                    onChange={(e) => setEnlacePortafolio(e.target.value)}
                    placeholder="https://tu-portafolio.com"
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="perfil-perfil-de-github" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">
                    Perfil de GitHub
                  </label>
                  <input id="perfil-perfil-de-github"
                    type="url"
                    value={githubUrl}
                    onChange={(e) => setGithubUrl(e.target.value)}
                    placeholder="https://github.com/usuario"
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div>
                  <label htmlFor="perfil-perfil-de-linkedin" className="block text-xs font-black uppercase tracking-widest text-tertiary mb-2">
                    Perfil de LinkedIn
                  </label>
                  <input id="perfil-perfil-de-linkedin"
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    placeholder="https://linkedin.com/in/usuario"
                    className="w-full rounded-xl border border-outline-variant/30 bg-surface-container-low px-4 py-3 text-sm text-on-surface transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between border-t border-outline-variant/30 mt-8 pt-6">
            <Button
              type="button"
              variant="ghost"
              onClick={handleBack}
              disabled={step === 0}
              className="h-auto gap-2 p-0 text-sm font-bold text-tertiary hover:bg-transparent hover:text-on-surface has-[>svg]:px-0 disabled:opacity-40 dark:hover:bg-transparent"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </Button>

            {step < STEPS.length - 1 ? (
              <Button
                type="button"
                onClick={handleNext}
                className="h-auto gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary hover:bg-primary/95 has-[>svg]:px-6 motion-glow-primary"
              >
                Siguiente
                <ChevronRight className="w-4 h-4" />
              </Button>
            ) : (
              <Button
                type="button"
                onClick={handleSaveAll}
                disabled={saving}
                className="h-auto gap-2 rounded-xl bg-primary px-6 py-2.5 font-bold text-on-primary hover:bg-primary/95 has-[>svg]:px-6 motion-glow-primary"
              >
                <Save className="w-4 h-4" />
                {saving ? 'Guardando Perfil...' : 'Guardar y Finalizar'}
              </Button>
            )}
          </div>
        </div>
      </div>
  );
}
