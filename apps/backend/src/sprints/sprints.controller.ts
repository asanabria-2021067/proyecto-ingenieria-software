import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('proyectos/:projectId/sprints')
@UseGuards(JwtAuthGuard)
export class SprintsController {}
