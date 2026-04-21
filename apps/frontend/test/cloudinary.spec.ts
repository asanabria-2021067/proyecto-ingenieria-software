import { describe, expect, it, vi } from 'vitest';
import { uploadToCloudinary } from '../lib/cloudinary';

describe('cloudinary upload', () => {
  it('falla sin variables de entorno', async () => {
    delete process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
    delete process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;
    await expect(uploadToCloudinary(new File(['x'], 'a.txt'), 'folder')).rejects.toThrow(
      'Cloudinary environment variables not configured',
    );
  });

  it('sube y retorna secure_url', async () => {
    process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME = 'demo';
    process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET = 'preset';
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ secure_url: 'https://img.test/file.png' }),
    } as Response);

    const result = await uploadToCloudinary(new File(['x'], 'a.txt'), 'avatars');

    expect(result.url).toBe('https://img.test/file.png');
  });
});
