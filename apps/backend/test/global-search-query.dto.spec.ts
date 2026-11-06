import { describe, expect, it } from 'vitest';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { GlobalSearchQueryDto } from '../src/search/dto/global-search-query.dto';

describe('GlobalSearchQueryDto', () => {
  const errores = (q: string) => validateSync(plainToInstance(GlobalSearchQueryDto, { q }));

  it('acepta hasta 100 caracteres', () => {
    expect(errores('a'.repeat(100))).toHaveLength(0);
  });

  it('rechaza mas de 100 caracteres', () => {
    expect(errores('a'.repeat(101))).toHaveLength(1);
  });
});
