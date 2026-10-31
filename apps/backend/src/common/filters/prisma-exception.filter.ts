import { ArgumentsHost, Catch, ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Red de seguridad (RTF-3.2): un P2002 (unique) o P2025 (registro inexistente)
 * que ningun servicio manejo deja de ser un 500 generico. Los servicios que ya
 * capturan estos codigos no llegan aqui; cualquier otro codigo Prisma conserva
 * el comportamiento por defecto (500).
 */
@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  catch(error: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    if (error.code === 'P2002') {
      return super.catch(new ConflictException('El registro ya existe'), host);
    }
    if (error.code === 'P2025') {
      return super.catch(new NotFoundException('Registro no encontrado'), host);
    }
    return super.catch(error, host);
  }
}
