import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ValidationService } from './validation.service';

@Controller('validaciones')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('administrador')
export class ValidationController {
  constructor(private validationService: ValidationService) {}

  @Post()
  create(@Body() data: unknown) {
    return this.validationService.create(data);
  }

  @Get()
  findAll() {
    return this.validationService.findAll();
  }
}
