import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { OptionalJwtAuthGuard } from '../auth/optional-jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ContactoService } from './contacto.service';
import { CreateContactoDto } from './dto/create-contacto.dto';

@Controller('contacto')
export class ContactoController {
  constructor(private contactoService: ContactoService) {}

  @Throttle({ short: { limit: 5, ttl: 60000 } })
  @Post()
  @UseGuards(OptionalJwtAuthGuard)
  enviar(@Body() dto: CreateContactoDto, @CurrentUser() user?: { userId: number }) {
    return this.contactoService.enviar(dto, user?.userId ?? null);
  }
}
