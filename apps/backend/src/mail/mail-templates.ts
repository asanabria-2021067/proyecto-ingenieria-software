/** MEJ-80: textos de los cuatro correos. Texto plano, sin datos que no necesite el destinatario. */
const PIE = '\n\nUVGenius';

export const correoCuentaAprobada = (nombre: string, urlLogin: string) => ({
  asunto: 'Tu cuenta de UVGenius fue aprobada',
  texto: `Hola ${nombre},\n\nAdministración aprobó tu cuenta. Ya puedes iniciar sesión: ${urlLogin}${PIE}`,
});

export const correoRecuperacion = (urlReset: string) => ({
  asunto: 'Recupera tu contraseña de UVGenius',
  texto: `Administración atendió tu solicitud. Define tu nueva contraseña desde este enlace, que vence pronto: ${urlReset}\n\nSi no la pediste, ignora este correo.${PIE}`,
});

export const correoInvitacionOrganizacion = (organizacion: string, invitadoPor: string, urlInvitaciones: string) => ({
  asunto: `Te invitaron a ${organizacion} en UVGenius`,
  texto: `${invitadoPor} te invitó a unirte a "${organizacion}". Acepta o rechaza la invitación aquí: ${urlInvitaciones}${PIE}`,
});

export const correoJuntaAsociacion = (asociacion: string, accion: 'ASIGNADA' | 'ACTUALIZADA' | 'REMOVIDA', cargo: string) => ({
  asunto: `Junta de ${asociacion} en UVGenius`,
  texto:
    accion === 'REMOVIDA'
      ? `Administración te quitó de la junta de "${asociacion}".${PIE}`
      : `Administración ${accion === 'ASIGNADA' ? 'te nombró en' : 'actualizó tu cargo en'} la junta de "${asociacion}" como ${cargo}.${PIE}`,
});

/** URL absoluta de la app (misma regla que el enlace de recuperación). */
export const urlApp = (ruta: string) => `${process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://uvgenius.com'}${ruta}`;
