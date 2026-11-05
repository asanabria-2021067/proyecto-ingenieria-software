import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PROYECTO_Y_ROL = { select: { nombreRol: true, proyecto: { select: { tituloProyecto: true } } } };

/**
 * MEJ-84: exportación de los datos propios. Lista blanca de campos con `select`:
 * nunca hashes, tokens ni datos o mensajes de otras personas.
 */
@Injectable()
export class MisDatosService {
  constructor(private readonly prisma: PrismaService) {}

  async exportar(idUsuario: number) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario },
      select: {
        idUsuario: true,
        correo: true,
        nombre: true,
        apellido: true,
        fotoUrl: true,
        estado: true,
        fechaCreacion: true,
        fechaUltimaSesion: true,
        perfil: {
          select: {
            carne: true,
            semestre: true,
            biografia: true,
            enlacePortafolio: true,
            githubUrl: true,
            linkedinUrl: true,
            disponibilidadHorasSemana: true,
            horasBecaRequeridas: true,
            horasExtensionRequeridas: true,
            urlCv: true,
            carrera: { select: { nombreCarrera: true } },
          },
        },
        telefonos: { select: { numero: true, tipoTelefono: true, esPrincipal: true } },
        habilidades: {
          select: { nivelHabilidad: true, aniosExperiencia: true, habilidad: { select: { nombreHabilidad: true } } },
        },
        intereses: { select: { interes: { select: { nombreInteres: true } } } },
        cualidades: { select: { cualidad: { select: { nombreCualidad: true } } } },
        experiencias: {
          select: {
            tituloProyectoExperiencia: true,
            rolDesempenado: true,
            tipoExperiencia: true,
            fechaInicio: true,
            fechaFin: true,
          },
        },
        registrosHorasSemestre: {
          select: {
            anio: true,
            periodo: true,
            metaBeca: true,
            becaDeclarada: true,
            metaExtension: true,
            extensionDeclarada: true,
          },
        },
        participaciones: {
          select: {
            estadoParticipacion: true,
            fechaIngreso: true,
            fechaSalida: true,
            rolProyecto: PROYECTO_Y_ROL,
            registrosHoras: {
              select: {
                periodoInicio: true,
                periodoFin: true,
                horasReportadas: true,
                horasCalculadas: true,
                horasAprobadas: true,
                estadoHoras: true,
              },
            },
          },
        },
        postulaciones: {
          select: {
            justificacion: true,
            estadoPostulacion: true,
            fechaPostulacion: true,
            fechaResolucion: true,
            rolProyecto: PROYECTO_Y_ROL,
          },
        },
        tareasAsignadas: {
          select: {
            fechaAsignacion: true,
            desasignadaEn: true,
            horasReales: true,
            tarea: {
              select: {
                tituloTarea: true,
                estadoTarea: true,
                prioridad: true,
                fechaLimite: true,
                proyecto: { select: { tituloProyecto: true } },
              },
            },
            registrosTiempo: {
              where: { idUsuario, revocadoEn: null },
              select: { horas: true, fecha: true, nota: true },
            },
          },
        },
      },
    });
    if (!usuario) throw new NotFoundException('Usuario no encontrado');
    return { generadoEn: new Date().toISOString(), ...usuario };
  }
}
