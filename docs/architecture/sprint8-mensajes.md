# Mensajes, errores y confirmaciones

Un solo módulo para avisar y confirmar en toda la app: `apps/frontend/lib/mensajes.ts`.
Los avisos van sobre `uvgSwal` (`lib/swal.ts`), que ya usan casi todas las pantallas, así
que heredan los tokens de HU-163 sin estilos nuevos. Las confirmaciones van sobre un
`AlertDialog` de Radix, montado una sola vez en `app/providers.tsx` vía `<ConfirmacionHost />`.

Ya no se arma un `uvgSwal.fire(...)` suelto ni un `AlertDialog` propio para avisar o confirmar.

## Por qué la confirmación no usa Swal

Varias confirmaciones viven dentro de un `Sheet` o `Dialog` de Radix (roles, etiquetas).
Un `AlertDialog` de Radix apilado sobre esos overlays funciona sin pelearse por el foco
ni por los clics; SweetAlert2 sí lo hace. Los avisos (toast, esquina superior) no tienen
ese problema y se quedan en Swal.

## Qué cubre

| Caso | Función | Comportamiento |
|---|---|---|
| Éxito | `aviso.exito(titulo, texto?)` | Toast arriba a la derecha, se cierra solo (2.5 s) o con la X |
| Advertencia | `aviso.advertencia(titulo, texto?)` | Igual, dura 4.5 s |
| Error | `aviso.error(titulo, texto?)` | Igual, dura 6 s para que se alcance a leer |
| Confirmación | `confirmar({ ... })` | Modal que bloquea hasta que el usuario elige |

Cada aviso lleva una etiqueta escrita (Listo, Atención, Error) además del color,
para no depender solo del color. Mientras el mouse está encima, el aviso no se cierra.

## Reglas

- El texto llega ya en español y listo para mostrarse. El módulo no traduce códigos.
  Para errores del backend se usa `getApiErrorMessage(err, scope)` de `components/projects/api-error.ts`.
- La confirmación dice qué se va a hacer y sobre qué. `descripcion` es obligatoria.
- El botón de confirmar usa el mismo verbo que la acción: "Eliminar tarea", no "Aceptar".
- `destructiva: true` solo para lo que no se puede deshacer: eliminar, cerrar proyecto,
  cerrar sprint, quitar a un integrante, rechazar postulación. Pone el botón en rojo
  y la etiqueta "No se puede deshacer".
- Las acciones reversibles no piden confirmación; solo muestran el aviso del resultado.

## Ejemplos

### Aviso después de guardar

```ts
import { aviso } from '@/lib/mensajes';

aviso.exito('Tarea creada', 'La tarea se agregó al tablero.');
```

### Error del backend

```ts
import { aviso } from '@/lib/mensajes';
import { getApiErrorMessage } from '@/components/projects/api-error';

try {
  await crearTarea(datos);
  aviso.exito('Tarea creada');
} catch (err) {
  aviso.error('No se pudo crear la tarea', getApiErrorMessage(err, 'task'));
}
```

### Confirmar una acción destructiva

```ts
import { aviso, confirmar } from '@/lib/mensajes';

const ok = await confirmar({
  titulo: `¿Eliminar la tarea «${tarea.tituloTarea}»?`,
  descripcion: 'La tarea sale del tablero y ya no se podrá editar ni asignar.',
  textoAccion: 'Eliminar tarea',
  destructiva: true,
});
if (!ok) return;

eliminarTarea.mutate(tarea.id, {
  onSuccess: () => aviso.exito('Tarea eliminada'),
  onError: (err) => aviso.error('No se pudo eliminar la tarea', getApiErrorMessage(err, 'task')),
});
```

### Confirmar algo que no es destructivo

```ts
const ok = await confirmar({
  titulo: '¿Enviar el proyecto a revisión?',
  descripcion: 'El administrador lo revisará antes de publicarlo.',
  textoAccion: 'Enviar a revisión',
});
```

## En tests

`confirmar` se resuelve a través de quien esté escuchando con `escucharConfirmaciones`
(el `<ConfirmacionHost />` en producción). En un test de un componente que use `confirmar`,
mockea `@/lib/mensajes` directamente:

```ts
const mensajesMock = vi.hoisted(() => ({
  confirmar: vi.fn(),
  aviso: { exito: vi.fn(), error: vi.fn(), advertencia: vi.fn() },
}));
vi.mock('../lib/mensajes', () => mensajesMock);

mensajesMock.confirmar.mockResolvedValueOnce(true);
```
