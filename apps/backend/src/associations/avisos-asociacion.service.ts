import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { HorasSemestreService } from '../horas-semestre/horas-semestre.service';
import { NotificationsService, type PostCommitEffect } from '../notifications/notifications.service';
import { PrismaService } from '../prisma/prisma.service';
import { AvisoAsociacionDto } from './dto/aviso-asociacion.dto';
import { DashboardReporteQueryDto } from './dto/dashboard-query.dto';
import { assertPuedePublicarComoAsociacion } from './junta-access';

export const AVISO_MAX_DESTINATARIOS = 500;
/** Avisos por asociación en una ventana de 24 horas. */
export const AVISO_MAX_POR_DIA = 3;
const DIA_MS = 24 * 60 * 60 * 1000;
const DIAS_VIGENTE = 14;
export const AVISO_ACCION = 'ASOCIACION_AVISO_ENVIADO';
export const AVISO_SIN_DESTINATARIOS_MESSAGE = 'Ningún estudiante coincide con estos filtros';
export const AVISO_LISTA_CAMBIO_MESSAGE = 'La lista de estudiantes cambió. Revisa la cantidad y confirma de nuevo';
export const AVISO_LIMITE_MESSAGE = 'La asociación ya envió el máximo de avisos de hoy. Inténtalo mañana';
export const AVISO_DEMASIADOS_MESSAGE = `El aviso llegaría a más de ${AVISO_MAX_DESTINATARIOS} estudiantes. Acota los filtros`;

const filtrosPlanos = (f: DashboardReporteQueryDto): Prisma.InputJsonObject =>
  JSON.parse(JSON.stringify({ anio: f.anio, periodo: f.periodo, tipo: f.tipo, enRiesgo: f.enRiesgo, busqueda: f.busqueda }));

/**
 * MEJ-161: aviso de la junta a los estudiantes de una lista filtrada. Solo Presidente y Editores.
 * Los destinatarios los resuelve el servidor con los filtros sobre los estudiantes de las carreras de ESA
 * asociación; el cliente nunca manda ids. Llega como notificación y como anuncio dirigido a esas personas.
 * Sin correo.
 */
@Injectable()
export class AvisosAsociacionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly horas: HorasSemestreService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Cuántos estudiantes recibirían el aviso con estos filtros (la cifra de la confirmación). */
  async contar(userId: number, idAsociacion: number, filtros: DashboardReporteQueryDto) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    const ids = await this.resolver(idAsociacion, filtros);
    return { cantidad: ids.length, maximo: AVISO_MAX_DESTINATARIOS };
  }

  async enviar(userId: number, idAsociacion: number, dto: AvisoAsociacionDto) {
    await assertPuedePublicarComoAsociacion(this.prisma, idAsociacion, userId);
    const ids = await this.resolver(idAsociacion, dto.filtros);
    if (ids.length === 0) throw new BadRequestException(AVISO_SIN_DESTINATARIOS_MESSAGE);
    if (ids.length > AVISO_MAX_DESTINATARIOS) throw new BadRequestException(AVISO_DEMASIADOS_MESSAGE);
    if (ids.length !== dto.cantidadEsperada) throw new ConflictException(AVISO_LISTA_CAMBIO_MESSAGE);

    const effects: PostCommitEffect[] = [];
    const anuncio = await this.prisma.$transaction(async (tx) => {
      // Serializa los envíos de la misma asociación para que el límite diario no se salte con dos solicitudes a la vez.
      const [asociacion] = await tx.$queryRaw<{ nombre: string }[]>`SELECT nombre FROM asociacion WHERE id_asociacion = ${idAsociacion} FOR UPDATE`;
      const enviados = await tx.bitacoraAuditoria.count({
        where: {
          accion: AVISO_ACCION,
          tipoObjeto: 'ASOCIACION',
          idObjeto: String(idAsociacion),
          fechaEvento: { gte: new Date(Date.now() - DIA_MS) },
        },
      });
      if (enviados >= AVISO_MAX_POR_DIA) throw new HttpException(AVISO_LIMITE_MESSAGE, HttpStatus.TOO_MANY_REQUESTS);

      const ahora = new Date();
      const creado = await tx.anuncio.create({
        data: {
          titulo: 'Aviso de la junta',
          mensaje: dto.mensaje,
          nivel: 'INFO',
          audiencia: 'TODOS',
          fechaInicio: ahora,
          fechaFin: new Date(ahora.getTime() + DIAS_VIGENTE * DIA_MS),
          creadoPor: userId,
          idAsociacion,
          destinatarios: { createMany: { data: ids.map((idUsuario) => ({ idUsuario })) } },
        },
        select: { idAnuncio: true },
      });
      await this.notifications.persistTemplateTx(
        tx,
        ids,
        'AVISO_ASOCIACION',
        { idAsociacion, nombreAsociacion: asociacion.nombre, mensaje: dto.mensaje },
        { add: (e) => effects.push(e) },
      );
      await tx.bitacoraAuditoria.create({
        data: {
          idUsuario: userId,
          accion: AVISO_ACCION,
          tipoObjeto: 'ASOCIACION',
          idObjeto: String(idAsociacion),
          detalleJson: { idAnuncio: creado.idAnuncio, destinatarios: ids.length, filtros: filtrosPlanos(dto.filtros) },
        },
      });
      return creado;
    });
    await this.notifications.publishEffects(effects);
    return { idAnuncio: anuncio.idAnuncio, destinatarios: ids.length };
  }

  /** Estudiantes de la asociación que cumplen el filtro; `idAsociacion` sale de la ruta ya verificada, no del cliente. */
  private async resolver(idAsociacion: number, f: DashboardReporteQueryDto): Promise<number[]> {
    const { filas } = await this.horas.recorrerTodas({
      anio: f.anio,
      periodo: f.periodo,
      tipo: f.tipo,
      enRiesgo: f.enRiesgo,
      busqueda: f.busqueda,
      idAsociacion,
    });
    return filas.map((x) => x.idUsuario);
  }
}
