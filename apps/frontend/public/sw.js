// MEJ-137: service worker de Web Push. Solo muestra avisos y abre la bandeja; no guarda nada en caché.
self.addEventListener('push', (event) => {
  let datos = {};
  try {
    datos = event.data ? event.data.json() : {};
  } catch {
    datos = {};
  }
  const titulo = typeof datos.titulo === 'string' && datos.titulo ? datos.titulo : 'UVGenius';
  const cuerpo = typeof datos.mensaje === 'string' ? datos.mensaje : '';
  event.waitUntil(self.registration.showNotification(titulo, { body: cuerpo, icon: '/logo.png' }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((ventanas) => {
      for (const ventana of ventanas) {
        if ('focus' in ventana) return ventana.focus();
      }
      return self.clients.openWindow('/dashboard/notificaciones');
    }),
  );
});
