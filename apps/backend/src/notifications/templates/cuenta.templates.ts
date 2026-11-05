export interface CuentaTemplateData {
  // MEJ-82: idSesion viaja en datosJson para el boton «No fui yo».
  NUEVO_INICIO_SESION: { navegador: string; sistema: string; idSesion: string };
  // MEJ-85: aviso a administradores y respuesta al usuario.
  SOLICITUD_DESACTIVACION: { userName: string; solicitudId: number; userId: number };
  DESACTIVACION_RESUELTA: { aprobada: boolean; comentario?: string | null };
}

export const CUENTA_TEMPLATES = {
  NUEVO_INICIO_SESION: {
    title: 'Nuevo inicio de sesión en tu cuenta',
    message: (data: CuentaTemplateData['NUEVO_INICIO_SESION']) =>
      `Se inició sesión desde ${data.navegador} en ${data.sistema}, un navegador que no habíamos visto. Si no fuiste tú, ciérrala y cambia tu contraseña.`,
  },

  SOLICITUD_DESACTIVACION: {
    title: 'Solicitud para desactivar una cuenta',
    message: (data: CuentaTemplateData['SOLICITUD_DESACTIVACION']) =>
      `${data.userName} pidió desactivar su cuenta. Revisa la solicitud en pendientes.`,
  },

  DESACTIVACION_RESUELTA: {
    title: (data: CuentaTemplateData['DESACTIVACION_RESUELTA']) =>
      data.aprobada ? 'Tu cuenta fue desactivada' : 'Tu solicitud de desactivación fue rechazada',
    message: (data: CuentaTemplateData['DESACTIVACION_RESUELTA']) =>
      data.aprobada
        ? 'Administración aprobó tu solicitud. Conservamos tus horas y el historial de tus proyectos.'
        : `Administración rechazó tu solicitud de desactivación.${data.comentario ? ` Comentario: ${data.comentario}` : ''}`,
  },
} as const;
