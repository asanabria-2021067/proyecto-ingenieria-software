import { describe, expect, it, vi } from 'vitest';
import { MODULE_METADATA } from '@nestjs/common/constants';
vi.hoisted(() => {
  process.env.FRONTEND_URL ??= 'http://localhost:3000';
});
import { AppModule } from '../src/app.module';
import { ChatModule } from '../src/chat/chat.module';
import { EventsModule } from '../src/events/events.module';
import { LinkPreviewService } from '../src/chat/link-preview/link-preview.service';
import { PerfilPortafolioModule } from '../src/perfil-portafolio/perfil-portafolio.module';
import { PerfilSocialService } from '../src/social/perfil-social.service';
import { SocialModule } from '../src/social/social.module';
import { EventsService } from '../src/events/events.service';

const meta = (clave: string, modulo: object): unknown[] => Reflect.getMetadata(clave, modulo) ?? [];

/**
 * Wiring de PerfilPortafolioModule: cada proveedor ajeno que sus servicios inyectan debe venir exportado por el
 * modulo que lo importa; si no, Nest no arranca (el CI de pruebas unitarias no lo detecta).
 */
describe('PerfilPortafolioModule', () => {
  it('esta registrado en AppModule', () => {
    expect(meta(MODULE_METADATA.IMPORTS, AppModule)).toContain(PerfilPortafolioModule);
  });

  it('importa los modulos que exportan lo que inyecta', () => {
    const imports = meta(MODULE_METADATA.IMPORTS, PerfilPortafolioModule);
    expect(imports).toEqual(expect.arrayContaining([ChatModule, SocialModule, EventsModule]));
  });

  it.each([
    ['SocialModule', SocialModule, PerfilSocialService],
    ['ChatModule', ChatModule, LinkPreviewService],
    ['EventsModule', EventsModule, EventsService],
  ])('%s exporta lo que usa PerfilPortafolioModule', (_n, modulo, proveedor) => {
    expect(meta(MODULE_METADATA.EXPORTS, modulo)).toContain(proveedor);
  });
});
