import { redirect } from 'next/navigation';

/** Alias: las solicitudes de cierre del coordinador son la misma bandeja del admin, acotada a su alcance. */
export default function CoordinadorCierresPage() {
  redirect('/dashboard/admin/proyectos?grupo=cierres');
}
