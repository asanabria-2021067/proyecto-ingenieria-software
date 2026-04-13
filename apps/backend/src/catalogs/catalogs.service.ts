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

  async findAll() {
    const [carreras, habilidades, intereses, cualidades] = await Promise.all([
      this.findCarreras(),
      this.findHabilidades(),
      this.findIntereses(),
      this.findCualidades(),
    ]);
    return { carreras, habilidades, intereses, cualidades };
  }
}
