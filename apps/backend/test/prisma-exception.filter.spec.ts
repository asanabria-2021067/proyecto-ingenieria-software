import { ConflictException, NotFoundException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { PrismaExceptionFilter } from '../src/common/filters/prisma-exception.filter';

function known(code: string) {
  return new Prisma.PrismaClientKnownRequestError('x', { code, clientVersion: 'test' });
}

describe('PrismaExceptionFilter', () => {
  const host = {} as never;

  it.each([
    ['P2002', ConflictException],
    ['P2025', NotFoundException],
  ])('%s se traduce a la excepcion HTTP correspondiente', (code, expected) => {
    const base = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    new PrismaExceptionFilter().catch(known(code), host);
    expect(base.mock.calls[0][0]).toBeInstanceOf(expected);
    base.mockRestore();
  });

  it('otros codigos Prisma conservan el comportamiento por defecto', () => {
    const base = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const error = known('P2003');
    new PrismaExceptionFilter().catch(error, host);
    expect(base.mock.calls[0][0]).toBe(error);
    base.mockRestore();
  });
});
