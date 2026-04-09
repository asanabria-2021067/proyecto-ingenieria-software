-- CreateEnum
CREATE TYPE "EstadoUsuario" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "TipoTelefono" AS ENUM ('PERSONAL', 'TRABAJO', 'EMERGENCIA', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoCarrera" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "NivelHabilidad" AS ENUM ('BASICO', 'INTERMEDIO', 'AVANZADO');

-- CreateEnum
CREATE TYPE "TipoExperiencia" AS ENUM ('PROYECTO_UNIVERSITARIO', 'PASANTIA', 'VOLUNTARIADO', 'INVESTIGACION', 'OTRO');

-- CreateEnum
CREATE TYPE "TipoOrganizacion" AS ENUM ('ASOCIACION', 'INSTITUTO', 'GRUPO_ESTUDIANTIL', 'CENTRO_INVESTIGACION', 'OTRO');

-- CreateEnum
CREATE TYPE "EstadoOrganizacion" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "RolOrganizacion" AS ENUM ('PROPIETARIO', 'ADMINISTRADOR', 'MIEMBRO');

-- CreateEnum
CREATE TYPE "EstadoMembresia" AS ENUM ('ACTIVA', 'INACTIVA');

-- CreateEnum
CREATE TYPE "TipoProyecto" AS ENUM ('ACADEMICO_HORAS_BECA', 'ACADEMICO_EXPERIENCIA', 'EXTRACURRICULAR_EXTENSION');

-- CreateEnum
CREATE TYPE "EstadoProyecto" AS ENUM ('BORRADOR', 'PUBLICADO', 'EN_PROGRESO', 'CERRADO');

-- CreateEnum
CREATE TYPE "ModalidadProyecto" AS ENUM ('PRESENCIAL', 'VIRTUAL', 'MIXTA');

-- CreateEnum
CREATE TYPE "RolOrganizacionProyecto" AS ENUM ('PRINCIPAL', 'COLABORADORA');

-- CreateEnum
CREATE TYPE "EstadoPostulacion" AS ENUM ('PENDIENTE', 'ACEPTADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoParticipacion" AS ENUM ('ACTIVO', 'RETIRADO', 'COMPLETADO');

-- CreateEnum
CREATE TYPE "EstadoHito" AS ENUM ('PENDIENTE', 'EN_PROGRESO', 'COMPLETADO');

-- CreateEnum
CREATE TYPE "EstadoTarea" AS ENUM ('POR_HACER', 'EN_PROGRESO', 'EN_REVISION', 'HECHO');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('BAJA', 'MEDIA', 'ALTA');

-- CreateEnum
CREATE TYPE "TipoEvidencia" AS ENUM ('ENLACE', 'ARCHIVO', 'REPORTE');

-- CreateEnum
CREATE TYPE "ResultadoRevision" AS ENUM ('APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "EstadoHoras" AS ENUM ('PENDIENTE', 'APROBADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "TipoCertificado" AS ENUM ('HORAS_BECA', 'EXTENSION', 'EXPERIENCIA');

-- CreateEnum
CREATE TYPE "TipoNotificacion" AS ENUM ('POSTULACION_RESUELTA', 'TAREA_ASIGNADA', 'EVIDENCIA_REVISADA', 'PROYECTO_PUBLICADO', 'HORAS_VALIDADAS', 'CERTIFICADO_EMITIDO', 'PARTICIPACION_ACTUALIZADA');

-- CreateTable
CREATE TABLE "usuario" (
    "id_usuario" SERIAL NOT NULL,
    "correo" VARCHAR(255) NOT NULL,
    "contrasena" VARCHAR(255) NOT NULL,
    "nombre" VARCHAR(255) NOT NULL,
    "apellido" VARCHAR(255) NOT NULL,
    "foto_url" VARCHAR(255),
    "estado" "EstadoUsuario" NOT NULL DEFAULT 'ACTIVO',
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_ultima_sesion" TIMESTAMP(3),

    CONSTRAINT "usuario_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "usuario_telefono" (
    "id_usuario_telefono" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "numero" VARCHAR(30) NOT NULL,
    "tipo_telefono" "TipoTelefono" NOT NULL DEFAULT 'PERSONAL',
    "es_principal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "usuario_telefono_pkey" PRIMARY KEY ("id_usuario_telefono")
);

-- CreateTable
CREATE TABLE "perfil_estudiante" (
    "id_usuario" INTEGER NOT NULL,
    "carne" VARCHAR(255) NOT NULL,
    "id_carrera" INTEGER,
    "semestre" INTEGER,
    "biografia" TEXT,
    "enlace_portafolio" VARCHAR(255),
    "github_url" VARCHAR(255),
    "linkedin_url" VARCHAR(255),
    "disponibilidad_horas_semana" INTEGER,
    "url_cv" VARCHAR(255),
    "preferencias_notificaciones" JSONB,
    "fecha_actualizacion" TIMESTAMP(3),

    CONSTRAINT "perfil_estudiante_pkey" PRIMARY KEY ("id_usuario")
);

-- CreateTable
CREATE TABLE "carrera" (
    "id_carrera" SERIAL NOT NULL,
    "nombre_carrera" VARCHAR(255) NOT NULL,
    "facultad" VARCHAR(255),
    "descripcion_carrera" TEXT,
    "estado" "EstadoCarrera" NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT "carrera_pkey" PRIMARY KEY ("id_carrera")
);

-- CreateTable
CREATE TABLE "habilidad" (
    "id_habilidad" SERIAL NOT NULL,
    "nombre_habilidad" VARCHAR(255) NOT NULL,
    "categoria_habilidad" VARCHAR(255),
    "descripcion_habilidad" TEXT,

    CONSTRAINT "habilidad_pkey" PRIMARY KEY ("id_habilidad")
);

-- CreateTable
CREATE TABLE "usuario_habilidad" (
    "id_usuario_habilidad" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_habilidad" INTEGER NOT NULL,
    "nivel_habilidad" "NivelHabilidad" NOT NULL DEFAULT 'BASICO',
    "anios_experiencia" INTEGER,

    CONSTRAINT "usuario_habilidad_pkey" PRIMARY KEY ("id_usuario_habilidad")
);

-- CreateTable
CREATE TABLE "interes" (
    "id_interes" SERIAL NOT NULL,
    "nombre_interes" VARCHAR(255) NOT NULL,
    "descripcion_interes" TEXT,

    CONSTRAINT "interes_pkey" PRIMARY KEY ("id_interes")
);

-- CreateTable
CREATE TABLE "usuario_interes" (
    "id_usuario_interes" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_interes" INTEGER NOT NULL,

    CONSTRAINT "usuario_interes_pkey" PRIMARY KEY ("id_usuario_interes")
);

-- CreateTable
CREATE TABLE "cualidad" (
    "id_cualidad" SERIAL NOT NULL,
    "nombre_cualidad" VARCHAR(100) NOT NULL,
    "descripcion_cualidad" TEXT,

    CONSTRAINT "cualidad_pkey" PRIMARY KEY ("id_cualidad")
);

-- CreateTable
CREATE TABLE "usuario_cualidad" (
    "id_usuario_cualidad" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_cualidad" INTEGER NOT NULL,

    CONSTRAINT "usuario_cualidad_pkey" PRIMARY KEY ("id_usuario_cualidad")
);

-- CreateTable
CREATE TABLE "experiencia_previa" (
    "id_experiencia" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "titulo_proyecto_experiencia" VARCHAR(255) NOT NULL,
    "rol_desempenado" VARCHAR(255),
    "id_habilidad_principal" INTEGER,
    "verificable" BOOLEAN NOT NULL DEFAULT false,
    "fecha_inicio" DATE,
    "fecha_fin" DATE,
    "tipo_experiencia" "TipoExperiencia" NOT NULL DEFAULT 'OTRO',

    CONSTRAINT "experiencia_previa_pkey" PRIMARY KEY ("id_experiencia")
);

-- CreateTable
CREATE TABLE "organizacion" (
    "id_organizacion" SERIAL NOT NULL,
    "nombre_organizacion" VARCHAR(255) NOT NULL,
    "tipo_organizacion" "TipoOrganizacion" NOT NULL DEFAULT 'OTRO',
    "descripcion_organizacion" TEXT,
    "correo_contacto" VARCHAR(255),
    "telefono_contacto" VARCHAR(255),
    "sitio_web" VARCHAR(255),
    "logo_url" VARCHAR(255),
    "estado_organizacion" "EstadoOrganizacion" NOT NULL DEFAULT 'ACTIVA',
    "creada_por" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizacion_pkey" PRIMARY KEY ("id_organizacion")
);

-- CreateTable
CREATE TABLE "usuario_organizacion" (
    "id_usuario_organizacion" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_organizacion" INTEGER NOT NULL,
    "rol_organizacion" "RolOrganizacion" NOT NULL DEFAULT 'MIEMBRO',
    "fecha_ingreso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "estado_membresia" "EstadoMembresia" NOT NULL DEFAULT 'ACTIVA',

    CONSTRAINT "usuario_organizacion_pkey" PRIMARY KEY ("id_usuario_organizacion")
);

-- CreateTable
CREATE TABLE "proyecto" (
    "id_proyecto" SERIAL NOT NULL,
    "titulo_proyecto" VARCHAR(200) NOT NULL,
    "descripcion_proyecto" TEXT NOT NULL,
    "objetivos_proyecto" TEXT,
    "tipo_proyecto" "TipoProyecto" NOT NULL,
    "estado_proyecto" "EstadoProyecto" NOT NULL DEFAULT 'BORRADOR',
    "modalidad_proyecto" "ModalidadProyecto" NOT NULL DEFAULT 'MIXTA',
    "ubicacion_proyecto" VARCHAR(255),
    "contexto_academico" VARCHAR(255),
    "url_recurso_externo" VARCHAR(255),
    "fecha_publicacion" DATE,
    "fecha_inicio" DATE,
    "fecha_fin_estimada" DATE,
    "creado_por" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_actualizacion" TIMESTAMP(3),
    "eliminado_en" TIMESTAMP(3),

    CONSTRAINT "proyecto_pkey" PRIMARY KEY ("id_proyecto")
);

-- CreateTable
CREATE TABLE "proyecto_organizacion" (
    "id_proyecto_organizacion" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_organizacion" INTEGER NOT NULL,
    "rol_organizacion" "RolOrganizacionProyecto" NOT NULL DEFAULT 'PRINCIPAL',
    "fecha_vinculacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proyecto_organizacion_pkey" PRIMARY KEY ("id_proyecto_organizacion")
);

-- CreateTable
CREATE TABLE "proyecto_interes" (
    "id_proyecto_interes" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_interes" INTEGER NOT NULL,

    CONSTRAINT "proyecto_interes_pkey" PRIMARY KEY ("id_proyecto_interes")
);

-- CreateTable
CREATE TABLE "rol_proyecto" (
    "id_rol_proyecto" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "nombre_rol" VARCHAR(255) NOT NULL,
    "descripcion_rol_proyecto" TEXT,
    "id_carrera_requerida" INTEGER,
    "cupos" INTEGER NOT NULL DEFAULT 1,
    "horas_semanales_estimadas" INTEGER,

    CONSTRAINT "rol_proyecto_pkey" PRIMARY KEY ("id_rol_proyecto")
);

-- CreateTable
CREATE TABLE "requisito_habilidad_rol" (
    "id_requisito_habilidad" SERIAL NOT NULL,
    "id_rol_proyecto" INTEGER NOT NULL,
    "id_habilidad" INTEGER NOT NULL,
    "nivel_minimo" "NivelHabilidad" NOT NULL DEFAULT 'BASICO',
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "requisito_habilidad_rol_pkey" PRIMARY KEY ("id_requisito_habilidad")
);

-- CreateTable
CREATE TABLE "postulacion" (
    "id_postulacion" SERIAL NOT NULL,
    "id_usuario_postulante" INTEGER NOT NULL,
    "id_rol_proyecto" INTEGER NOT NULL,
    "justificacion" TEXT NOT NULL,
    "estado_postulacion" "EstadoPostulacion" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_postulacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_resolucion" TIMESTAMP(3),
    "resuelta_por" INTEGER,
    "comentario_resolucion" TEXT,

    CONSTRAINT "postulacion_pkey" PRIMARY KEY ("id_postulacion")
);

-- CreateTable
CREATE TABLE "participacion_proyecto" (
    "id_participacion" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_rol_proyecto" INTEGER NOT NULL,
    "id_postulacion" INTEGER,
    "estado_participacion" "EstadoParticipacion" NOT NULL DEFAULT 'ACTIVO',
    "fecha_ingreso" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_salida" DATE,

    CONSTRAINT "participacion_proyecto_pkey" PRIMARY KEY ("id_participacion")
);

-- CreateTable
CREATE TABLE "hito" (
    "id_hito" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "titulo_hito" VARCHAR(255) NOT NULL,
    "descripcion_hito" TEXT,
    "fecha_limite" DATE,
    "estado_hito" "EstadoHito" NOT NULL DEFAULT 'PENDIENTE',
    "orden" INTEGER NOT NULL,

    CONSTRAINT "hito_pkey" PRIMARY KEY ("id_hito")
);

-- CreateTable
CREATE TABLE "tarea" (
    "id_tarea" SERIAL NOT NULL,
    "id_proyecto" INTEGER NOT NULL,
    "id_hito" INTEGER,
    "titulo_tarea" VARCHAR(255) NOT NULL,
    "descripcion_tarea" TEXT,
    "estado_tarea" "EstadoTarea" NOT NULL DEFAULT 'POR_HACER',
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "creada_por" INTEGER NOT NULL,
    "fecha_creacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fecha_limite" DATE,
    "actualizada_en" TIMESTAMP(3),

    CONSTRAINT "tarea_pkey" PRIMARY KEY ("id_tarea")
);

-- CreateTable
CREATE TABLE "asignacion_tarea" (
    "id_asignacion" SERIAL NOT NULL,
    "id_tarea" INTEGER NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "asignado_por" INTEGER NOT NULL,

    CONSTRAINT "asignacion_tarea_pkey" PRIMARY KEY ("id_asignacion")
);

-- CreateTable
CREATE TABLE "evidencia" (
    "id_evidencia" SERIAL NOT NULL,
    "id_tarea" INTEGER NOT NULL,
    "id_usuario_cargador" INTEGER NOT NULL,
    "tipo_evidencia" "TipoEvidencia" NOT NULL,
    "url_recurso" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,
    "tamano_bytes" BIGINT,
    "fecha_envio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencia_pkey" PRIMARY KEY ("id_evidencia")
);

-- CreateTable
CREATE TABLE "revision_evidencia" (
    "id_revision" SERIAL NOT NULL,
    "id_evidencia" INTEGER NOT NULL,
    "id_revisor" INTEGER NOT NULL,
    "resultado_revision" "ResultadoRevision" NOT NULL,
    "comentario" TEXT,
    "fecha_revision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revision_evidencia_pkey" PRIMARY KEY ("id_revision")
);

-- CreateTable
CREATE TABLE "horas_participacion" (
    "id_registro_horas" SERIAL NOT NULL,
    "id_participacion" INTEGER NOT NULL,
    "periodo_inicio" DATE NOT NULL,
    "periodo_fin" DATE NOT NULL,
    "horas_reportadas" DECIMAL(6,2) NOT NULL,
    "horas_aprobadas" DECIMAL(6,2),
    "estado_horas" "EstadoHoras" NOT NULL DEFAULT 'PENDIENTE',
    "aprobado_por" INTEGER,
    "fecha_aprobacion" TIMESTAMP(3),

    CONSTRAINT "horas_participacion_pkey" PRIMARY KEY ("id_registro_horas")
);

-- CreateTable
CREATE TABLE "certificado" (
    "id_certificado" SERIAL NOT NULL,
    "id_participacion" INTEGER NOT NULL,
    "tipo_certificado" "TipoCertificado" NOT NULL,
    "horas_certificadas" DECIMAL(6,2) NOT NULL,
    "url_certificado" VARCHAR(255),
    "emitido_por" INTEGER NOT NULL,
    "fecha_emision" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "codigo_verificacion" VARCHAR(255) NOT NULL,

    CONSTRAINT "certificado_pkey" PRIMARY KEY ("id_certificado")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id_notificacion" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "tipo_notificacion" "TipoNotificacion" NOT NULL,
    "titulo_notificacion" VARCHAR(255) NOT NULL,
    "mensaje_notificacion" TEXT,
    "datos_json" JSONB,
    "creada_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leida_en" TIMESTAMP(3),

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id_notificacion")
);

-- CreateTable
CREATE TABLE "rol_acceso" (
    "id_rol_acceso" SERIAL NOT NULL,
    "nombre_perfil" VARCHAR(255) NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "rol_acceso_pkey" PRIMARY KEY ("id_rol_acceso")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id_permiso" SERIAL NOT NULL,
    "nombre_permiso" VARCHAR(255) NOT NULL,
    "descripcion_permiso" TEXT,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id_permiso")
);

-- CreateTable
CREATE TABLE "usuario_rol_acceso" (
    "id_usuario_rol_acceso" SERIAL NOT NULL,
    "id_usuario" INTEGER NOT NULL,
    "id_rol_acceso" INTEGER NOT NULL,
    "fecha_asignacion" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "usuario_rol_acceso_pkey" PRIMARY KEY ("id_usuario_rol_acceso")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "id_rol_permiso" SERIAL NOT NULL,
    "id_rol_acceso" INTEGER NOT NULL,
    "id_permiso" INTEGER NOT NULL,

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("id_rol_permiso")
);

-- CreateTable
CREATE TABLE "bitacora_auditoria" (
    "id_auditoria" SERIAL NOT NULL,
    "id_usuario" INTEGER,
    "accion" VARCHAR(255) NOT NULL,
    "tipo_objeto" VARCHAR(255) NOT NULL,
    "id_objeto" VARCHAR(255),
    "detalle_json" JSONB,
    "ip_origen" VARCHAR(255),
    "fecha_evento" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bitacora_auditoria_pkey" PRIMARY KEY ("id_auditoria")
);

-- CreateTable
CREATE TABLE "configuracion_sistema" (
    "clave" VARCHAR(255) NOT NULL,
    "valor" TEXT,
    "descripcion_parametro" TEXT,
    "actualizado_por" INTEGER,
    "actualizado_en" TIMESTAMP(3),

    CONSTRAINT "configuracion_sistema_pkey" PRIMARY KEY ("clave")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuario_correo_key" ON "usuario"("correo");

-- CreateIndex
CREATE UNIQUE INDEX "perfil_estudiante_carne_key" ON "perfil_estudiante"("carne");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_habilidad_id_usuario_id_habilidad_key" ON "usuario_habilidad"("id_usuario", "id_habilidad");

-- CreateIndex
CREATE UNIQUE INDEX "interes_nombre_interes_key" ON "interes"("nombre_interes");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_interes_id_usuario_id_interes_key" ON "usuario_interes"("id_usuario", "id_interes");

-- CreateIndex
CREATE UNIQUE INDEX "cualidad_nombre_cualidad_key" ON "cualidad"("nombre_cualidad");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_cualidad_id_usuario_id_cualidad_key" ON "usuario_cualidad"("id_usuario", "id_cualidad");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_organizacion_id_usuario_id_organizacion_key" ON "usuario_organizacion"("id_usuario", "id_organizacion");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_organizacion_id_proyecto_id_organizacion_key" ON "proyecto_organizacion"("id_proyecto", "id_organizacion");

-- CreateIndex
CREATE UNIQUE INDEX "proyecto_interes_id_proyecto_id_interes_key" ON "proyecto_interes"("id_proyecto", "id_interes");

-- CreateIndex
CREATE UNIQUE INDEX "requisito_habilidad_rol_id_rol_proyecto_id_habilidad_key" ON "requisito_habilidad_rol"("id_rol_proyecto", "id_habilidad");

-- CreateIndex
CREATE UNIQUE INDEX "asignacion_tarea_id_tarea_id_usuario_key" ON "asignacion_tarea"("id_tarea", "id_usuario");

-- CreateIndex
CREATE UNIQUE INDEX "certificado_codigo_verificacion_key" ON "certificado"("codigo_verificacion");

-- CreateIndex
CREATE UNIQUE INDEX "rol_acceso_nombre_perfil_key" ON "rol_acceso"("nombre_perfil");

-- CreateIndex
CREATE UNIQUE INDEX "permiso_nombre_permiso_key" ON "permiso"("nombre_permiso");

-- CreateIndex
CREATE UNIQUE INDEX "usuario_rol_acceso_id_usuario_id_rol_acceso_key" ON "usuario_rol_acceso"("id_usuario", "id_rol_acceso");

-- CreateIndex
CREATE UNIQUE INDEX "rol_permiso_id_rol_acceso_id_permiso_key" ON "rol_permiso"("id_rol_acceso", "id_permiso");

-- AddForeignKey
ALTER TABLE "usuario_telefono" ADD CONSTRAINT "usuario_telefono_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_estudiante" ADD CONSTRAINT "perfil_estudiante_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "perfil_estudiante" ADD CONSTRAINT "perfil_estudiante_id_carrera_fkey" FOREIGN KEY ("id_carrera") REFERENCES "carrera"("id_carrera") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_habilidad" ADD CONSTRAINT "usuario_habilidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_habilidad" ADD CONSTRAINT "usuario_habilidad_id_habilidad_fkey" FOREIGN KEY ("id_habilidad") REFERENCES "habilidad"("id_habilidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_interes" ADD CONSTRAINT "usuario_interes_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_interes" ADD CONSTRAINT "usuario_interes_id_interes_fkey" FOREIGN KEY ("id_interes") REFERENCES "interes"("id_interes") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_cualidad" ADD CONSTRAINT "usuario_cualidad_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_cualidad" ADD CONSTRAINT "usuario_cualidad_id_cualidad_fkey" FOREIGN KEY ("id_cualidad") REFERENCES "cualidad"("id_cualidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_previa" ADD CONSTRAINT "experiencia_previa_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "experiencia_previa" ADD CONSTRAINT "experiencia_previa_id_habilidad_principal_fkey" FOREIGN KEY ("id_habilidad_principal") REFERENCES "habilidad"("id_habilidad") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organizacion" ADD CONSTRAINT "organizacion_creada_por_fkey" FOREIGN KEY ("creada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_organizacion" ADD CONSTRAINT "usuario_organizacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_organizacion" ADD CONSTRAINT "usuario_organizacion_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto" ADD CONSTRAINT "proyecto_creado_por_fkey" FOREIGN KEY ("creado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_organizacion" ADD CONSTRAINT "proyecto_organizacion_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_organizacion" ADD CONSTRAINT "proyecto_organizacion_id_organizacion_fkey" FOREIGN KEY ("id_organizacion") REFERENCES "organizacion"("id_organizacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_interes" ADD CONSTRAINT "proyecto_interes_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proyecto_interes" ADD CONSTRAINT "proyecto_interes_id_interes_fkey" FOREIGN KEY ("id_interes") REFERENCES "interes"("id_interes") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_proyecto" ADD CONSTRAINT "rol_proyecto_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_proyecto" ADD CONSTRAINT "rol_proyecto_id_carrera_requerida_fkey" FOREIGN KEY ("id_carrera_requerida") REFERENCES "carrera"("id_carrera") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito_habilidad_rol" ADD CONSTRAINT "requisito_habilidad_rol_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requisito_habilidad_rol" ADD CONSTRAINT "requisito_habilidad_rol_id_habilidad_fkey" FOREIGN KEY ("id_habilidad") REFERENCES "habilidad"("id_habilidad") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "postulacion_id_usuario_postulante_fkey" FOREIGN KEY ("id_usuario_postulante") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "postulacion_resuelta_por_fkey" FOREIGN KEY ("resuelta_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "postulacion" ADD CONSTRAINT "postulacion_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacion_proyecto" ADD CONSTRAINT "participacion_proyecto_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacion_proyecto" ADD CONSTRAINT "participacion_proyecto_id_rol_proyecto_fkey" FOREIGN KEY ("id_rol_proyecto") REFERENCES "rol_proyecto"("id_rol_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participacion_proyecto" ADD CONSTRAINT "participacion_proyecto_id_postulacion_fkey" FOREIGN KEY ("id_postulacion") REFERENCES "postulacion"("id_postulacion") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hito" ADD CONSTRAINT "hito_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_proyecto_fkey" FOREIGN KEY ("id_proyecto") REFERENCES "proyecto"("id_proyecto") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_id_hito_fkey" FOREIGN KEY ("id_hito") REFERENCES "hito"("id_hito") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tarea" ADD CONSTRAINT "tarea_creada_por_fkey" FOREIGN KEY ("creada_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "asignacion_tarea_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "asignacion_tarea_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_tarea" ADD CONSTRAINT "asignacion_tarea_asignado_por_fkey" FOREIGN KEY ("asignado_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_id_tarea_fkey" FOREIGN KEY ("id_tarea") REFERENCES "tarea"("id_tarea") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia" ADD CONSTRAINT "evidencia_id_usuario_cargador_fkey" FOREIGN KEY ("id_usuario_cargador") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_evidencia" ADD CONSTRAINT "revision_evidencia_id_evidencia_fkey" FOREIGN KEY ("id_evidencia") REFERENCES "evidencia"("id_evidencia") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revision_evidencia" ADD CONSTRAINT "revision_evidencia_id_revisor_fkey" FOREIGN KEY ("id_revisor") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horas_participacion" ADD CONSTRAINT "horas_participacion_id_participacion_fkey" FOREIGN KEY ("id_participacion") REFERENCES "participacion_proyecto"("id_participacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "horas_participacion" ADD CONSTRAINT "horas_participacion_aprobado_por_fkey" FOREIGN KEY ("aprobado_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificado" ADD CONSTRAINT "certificado_id_participacion_fkey" FOREIGN KEY ("id_participacion") REFERENCES "participacion_proyecto"("id_participacion") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificado" ADD CONSTRAINT "certificado_emitido_por_fkey" FOREIGN KEY ("emitido_por") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacion" ADD CONSTRAINT "notificacion_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol_acceso" ADD CONSTRAINT "usuario_rol_acceso_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol_acceso" ADD CONSTRAINT "usuario_rol_acceso_id_rol_acceso_fkey" FOREIGN KEY ("id_rol_acceso") REFERENCES "rol_acceso"("id_rol_acceso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_rol_acceso_fkey" FOREIGN KEY ("id_rol_acceso") REFERENCES "rol_acceso"("id_rol_acceso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_id_permiso_fkey" FOREIGN KEY ("id_permiso") REFERENCES "permiso"("id_permiso") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bitacora_auditoria" ADD CONSTRAINT "bitacora_auditoria_id_usuario_fkey" FOREIGN KEY ("id_usuario") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuracion_sistema" ADD CONSTRAINT "configuracion_sistema_actualizado_por_fkey" FOREIGN KEY ("actualizado_por") REFERENCES "usuario"("id_usuario") ON DELETE SET NULL ON UPDATE CASCADE;
