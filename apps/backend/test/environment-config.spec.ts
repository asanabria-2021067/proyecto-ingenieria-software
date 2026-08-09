import { afterEach, describe, expect, it } from 'vitest';
import { getRequiredFrontendUrl } from '../src/config/frontend-url';

describe('getRequiredFrontendUrl', () => {
  const ORIGINAL_FRONTEND_URL = process.env.FRONTEND_URL;

  afterEach(() => {
    if (ORIGINAL_FRONTEND_URL === undefined) {
      delete process.env.FRONTEND_URL;
    } else {
      process.env.FRONTEND_URL = ORIGINAL_FRONTEND_URL;
    }
  });

  it('acepta una URL HTTP válida', () => {
    process.env.FRONTEND_URL = 'http://localhost:3000';
    expect(getRequiredFrontendUrl()).toBe('http://localhost:3000');
  });

  it('acepta una URL HTTPS válida', () => {
    process.env.FRONTEND_URL = 'https://app.example.com';
    expect(getRequiredFrontendUrl()).toBe('https://app.example.com');
  });

  it('rechaza cuando la variable está ausente', () => {
    delete process.env.FRONTEND_URL;
    expect(() => getRequiredFrontendUrl()).toThrow(
      'FRONTEND_URL environment variable is required',
    );
  });

  it('rechaza una cadena vacía', () => {
    process.env.FRONTEND_URL = '';
    expect(() => getRequiredFrontendUrl()).toThrow(
      'FRONTEND_URL environment variable is required',
    );
  });

  it('rechaza una cadena compuesta únicamente por espacios', () => {
    process.env.FRONTEND_URL = '   ';
    expect(() => getRequiredFrontendUrl()).toThrow(
      'FRONTEND_URL environment variable is required',
    );
  });

  it('rechaza el wildcard "*"', () => {
    process.env.FRONTEND_URL = '*';
    expect(() => getRequiredFrontendUrl()).toThrow('FRONTEND_URL cannot allow every origin');
  });

  it('rechaza una URL sin protocolo', () => {
    process.env.FRONTEND_URL = 'example.com';
    expect(() => getRequiredFrontendUrl()).toThrow();
  });

  it('rechaza un protocolo distinto de http/https', () => {
    process.env.FRONTEND_URL = 'ftp://example.com';
    expect(() => getRequiredFrontendUrl()).toThrow('FRONTEND_URL must use http or https');
  });
});
