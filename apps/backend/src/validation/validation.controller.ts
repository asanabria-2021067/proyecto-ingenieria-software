import { Controller, Get, Post, Body } from '@nestjs/common';
import { ValidationService } from './validation.service';

@Controller('validaciones')
export class ValidationController {
  constructor(private validationService: ValidationService) {}

  @Post()
  create(@Body() data: any) {
    return this.validationService.create(data);
  }

  @Get()
  findAll() {
    return this.validationService.findAll();
  }
}
