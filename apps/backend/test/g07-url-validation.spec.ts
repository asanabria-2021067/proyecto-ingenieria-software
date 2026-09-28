import { BadRequestException, ValidationPipe, type Type } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { UpdateProfileDto } from '../src/users/dto/update-profile.dto';
import { CreateProjectDto } from '../src/projects/dto/create-project.dto';
import { CreateProjectFullDto } from '../src/projects/dto/create-project-full.dto';
import { UpdateProjectDto } from '../src/projects/dto/update-project.dto';
import { isHttpUrl } from '../src/common/validators/http-url.validator';

/**
 * G07-C08 · OWASP25-C027 + C001 (A05/A04:2025). Los cinco campos URL que
 * escribe un usuario (perfil: enlacePortafolio, githubUrl, linkedinUrl, urlCv;
 * proyecto: urlRecursoExterno en sus tres DTO) solo aceptan http(s). Se valida
 * con el MISMO ValidationPipe de main.ts. Vacío: omitido o null siguen siendo
 * opcionales y '' significa «sin enlace».
 */

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
  transformOptions: { enableImplicitConversion: true },
});

const FIELDS: Array<[string, Type<unknown>, string]> = [
  ['perfil', UpdateProfileDto, 'enlacePortafolio'],
  ['perfil', UpdateProfileDto, 'githubUrl'],
  ['perfil', UpdateProfileDto, 'linkedinUrl'],
  ['perfil', UpdateProfileDto, 'urlCv'],
  ['proyecto (crear)', CreateProjectDto, 'urlRecursoExterno'],
  ['proyecto (crear completo)', CreateProjectFullDto, 'urlRecursoExterno'],
  ['proyecto (editar)', UpdateProjectDto, 'urlRecursoExterno'],
];

const VALID = [
  'https://github.com/ana',
  'http://portafolio.example/ana?tab=1#proyectos',
  'https://www.linkedin.com/in/ana-perez',
  'https://res.cloudinary.com/demo/raw/upload/v1/cv.pdf',
  'HTTPS://EXAMPLE.COM/Ruta',
  'http://localhost:3000/recurso',
];

const INVALID = [
  'javascript:alert(1)',
  'JavaScript:alert(document.cookie)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'javascript://%0aalert(1)',
  'data:text/html,<script>alert(1)</script>',
  'vbscript:msgbox(1)',
  'file:///etc/passwd',
  'ftp://archivos.example/cv.pdf',
  'mi-app://abrir',
  '//evil.example/ruta',
  'github.com/ana',
  'https://',
  'http:// espacio.example',
  'https://github.com/ana ',
  '​https://github.com/ana',
  `https://example.com/${'a'.repeat(250)}`,
];

async function validateField(dto: Type<unknown>, field: string, value: unknown) {
  // Solo interesan los errores del campo bajo prueba (los DTO de creación
  // exigen además título, descripción, etc.).
  try {
    await pipe.transform({ [field]: value }, { type: 'body', metatype: dto });
    return [];
  } catch (error) {
    const response = (error as BadRequestException).getResponse() as { message: string[] };
    return response.message.filter((message) => message.startsWith(`${field} `));
  }
}

describe('G07-C08: esquemas de URL permitidos en los cinco campos', () => {
  describe.each(FIELDS)('%s · %s', (_dto, dto, field) => {
    it.each(VALID)(`${field}=%j se acepta`, async (value) => {
      expect(await validateField(dto, field, value)).toEqual([]);
    });

    it.each(INVALID)(`${field}=%j → 400`, async (value) => {
      const messages = await validateField(dto, field, value);
      expect(messages.length).toBeGreaterThan(0);
    });

    it.each([
      ['omitido', undefined],
      ['null', null],
      ['cadena vacía («sin enlace»)', ''],
    ])(`${field} %s sigue siendo válido`, async (_caso, value) => {
      expect(await validateField(dto, field, value)).toEqual([]);
    });
  });

  it('el mensaje nombra el campo y los esquemas permitidos, sin repetir el valor', async () => {
    const [message] = await validateField(UpdateProfileDto, 'githubUrl', 'javascript:alert(1)');
    expect(message).toBe('githubUrl debe ser una URL http:// o https://');
  });

  it('fotoUrl (imagen subida a Cloudinary, fuera de los cinco campos) conserva su contrato actual', async () => {
    expect(await validateField(UpdateProfileDto, 'fotoUrl', 'https://res.cloudinary.com/demo/image/upload/v1/foto.png')).toEqual([]);
  });

  it('isHttpUrl exige host y esquema http(s) tal como los interpreta el navegador', () => {
    expect(isHttpUrl('https://github.com')).toBe(true);
    expect(isHttpUrl('https:github.com')).toBe(true);
    expect(isHttpUrl('http:')).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
    expect(isHttpUrl(null)).toBe(false);
  });
});
