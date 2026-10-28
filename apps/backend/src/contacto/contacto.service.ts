import { Injectable } from '@nestjs/common';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateContactoDto } from './dto/create-contacto.dto';

export const MENSAJE_CONTACTO_ENVIADO = 'Tu mensaje fue enviado a administración';

@Injectable()
export class ContactoService {
  constructor(private notificationsService: NotificationsService) {}

  async enviar(dto: CreateContactoDto, idUsuario: number | null = null) {
    await this.notificationsService.notifyAdminsFromTemplate('SOLICITUD_CONTACTO', {
      nombre: dto.nombre,
      correo: dto.correo,
      asunto: dto.asunto,
      mensaje: dto.mensaje,
      idUsuario,
    });
    return { mensaje: MENSAJE_CONTACTO_ENVIADO };
  }
}
