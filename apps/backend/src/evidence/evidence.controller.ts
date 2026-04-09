import { Controller, Get, Post, Body } from '@nestjs/common';
import { EvidenceService } from './evidence.service';

@Controller('evidencias')
export class EvidenceController {
  constructor(private evidenceService: EvidenceService) {}

  @Post()
  create(@Body() data: any) {
    return this.evidenceService.create(data);
  }

  @Get()
  findAll() {
    return this.evidenceService.findAll();
  }
}
