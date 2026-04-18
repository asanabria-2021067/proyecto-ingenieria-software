import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CatalogsService {
  constructor(private prisma: PrismaService) {}

  findCarreras() {
    return this.prisma.carrera.findMany({
      where: { estado: 'ACTIVA' },
      orderBy: { nombreCarrera: 'asc' },
    });
  }

  findHabilidades() {
    return this.prisma.habilidad.findMany({
      orderBy: { nombreHabilidad: 'asc' },
    });
  }

  findIntereses() {
    return this.prisma.interes.findMany({
      orderBy: { nombreInteres: 'asc' },
    });
  }

  findCualidades() {
    return this.prisma.cualidad.findMany({
      orderBy: { nombreCualidad: 'asc' },
    });
  }

  async getProfileCatalogs() {
    const [carreras, habilidades, intereses, cualidades] = await Promise.all([
      this.findCarreras(),
      this.findHabilidades(),
      this.findIntereses(),
      this.findCualidades(),
    ]);

    return {
      carreras: carreras.map((c) => ({
        id: c.id.toString(),           // convertimos a string por si el frontend lo espera
        nombre: c.nombreCarrera,
      })),

      habilidades: habilidades.map((h) => ({
        id: h.id.toString(),
        nombre: h.nombreHabilidad,
      })),

      intereses: intereses.map((i) => ({
        id: i.id.toString(),
        nombre: i.nombreInteres,
      })),

      // Cualidades también las devolvemos (estaba el método pero no se usaba)
      cualidades: cualidades.map((q) => ({
        id: q.id.toString(),
        nombre: q.nombreCualidad,
      })),

      // Estos siguen siendo estáticos porque no tienen tabla en Prisma
      disponibilidades: [
        { id: '1', nombre: 'Tiempo completo' },
        { id: '2', nombre: 'Tiempo parcial' },
        { id: '3', nombre: 'Fines de semana' },
        { id: '4', nombre: 'Solo noches' },
        { id: '5', nombre: 'Flexible' },
      ],

      modalidades: [
        { value: 'presencial', label: 'Presencial' },
        { value: 'remoto', label: 'Remoto' },
        { value: 'hibrido', label: 'Híbrido' },
      ],
    };
  }
}
