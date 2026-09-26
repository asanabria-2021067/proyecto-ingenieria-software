import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

interface FilaIdUsuario {
  id_usuario: number;
}

/**
 * T-245: resuelve los `idUsuario` de `Usuario` cuyo nombre o apellido
 * matchea un texto de búsqueda — tolerante a acentos ("saul" encuentra
 * "Saúl" y viceversa), a mayúsculas/minúsculas y a coincidencias parciales
 * ("her" encuentra "Hernández"). Se resuelve enteramente en BD (índices GIN
 * `pg_trgm` sobre `immutable_unaccent(lower(...))`, ver migración
 * `..._user_name_search_unaccent`), nunca cargando usuarios a memoria para
 * filtrar con JS.
 *
 * Vive en `common/` (no dentro de `bitacora/`) a propósito: T-243 la
 * consume para el filtro `persona` de la bitácora, pero la búsqueda de
 * personas por nombre es la misma necesidad de HU-159/HU-171 — este
 * servicio queda disponible para que esas historias la reutilicen sin
 * repetir la lógica SQL, sin implementar nada de esas historias aquí.
 */
@Injectable()
export class UserNameSearchService {
  constructor(private readonly prisma: PrismaService) {}

  async findMatchingUserIds(query: string): Promise<number[]> {
    const texto = query.trim();
    if (texto.length === 0) {
      return [];
    }

    // Escapa los comodines de LIKE (%, _, \) para que un texto de búsqueda
    // literal (p. ej. un apellido con guion bajo) no se interprete como patrón.
    const escapado = texto.replace(/[\\%_]/g, (caracter) => `\\${caracter}`);
    const patron = `%${escapado}%`;

    const filas = await this.prisma.$queryRaw<FilaIdUsuario[]>(Prisma.sql`
      SELECT id_usuario FROM usuario
      WHERE immutable_unaccent(lower(nombre)) LIKE immutable_unaccent(lower(${patron})) ESCAPE '\\'
         OR immutable_unaccent(lower(apellido)) LIKE immutable_unaccent(lower(${patron})) ESCAPE '\\'
    `);
    return filas.map((fila) => fila.id_usuario);
  }
}
