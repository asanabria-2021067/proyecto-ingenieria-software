import { afterEach, describe, expect, it } from 'vitest';
import { isCloudinaryUrl, isCloudinaryUrlOrEmpty } from '../src/common/validators/cloudinary-url.validator';

const ORIGINAL = process.env.CLOUDINARY_CLOUD_NAME;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.CLOUDINARY_CLOUD_NAME;
  else process.env.CLOUDINARY_CLOUD_NAME = ORIGINAL;
});

describe('isCloudinaryUrl', () => {
  it('acepta una URL de res.cloudinary.com y la cadena vacía', () => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(isCloudinaryUrl('https://res.cloudinary.com/demo/image/upload/v1/a.png')).toBe(true);
    expect(isCloudinaryUrlOrEmpty('')).toBe(true);
  });

  it('con CLOUDINARY_CLOUD_NAME definido solo acepta ese cloud', () => {
    process.env.CLOUDINARY_CLOUD_NAME = 'uvggt';
    expect(isCloudinaryUrl('https://res.cloudinary.com/uvggt/image/upload/v1/a.png')).toBe(true);
    expect(isCloudinaryUrl('https://res.cloudinary.com/otro/image/upload/v1/a.png')).toBe(false);
  });

  it.each([
    'https://u@res.cloudinary.com/demo/image/upload/a.png',
    'https://user:pass@res.cloudinary.com/demo/image/upload/a.png',
    'https://res.cloudinary.com:8443/demo/image/upload/a.png',
    'https://res.cloudinary.com.evil.com/demo/image/upload/a.png',
    'http://res.cloudinary.com/demo/image/upload/a.png',
    'https://evil.example/demo/a.png',
    'javascript:alert(1)',
  ])('rechaza %s', (valor) => {
    delete process.env.CLOUDINARY_CLOUD_NAME;
    expect(isCloudinaryUrl(valor)).toBe(false);
  });
});
