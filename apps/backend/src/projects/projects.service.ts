import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ProjectsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return { message: 'Not implemented yet' };
  }

  findOne(id: number) {
    return { message: 'Not implemented yet' };
  }

  create(data: any) {
    return { message: 'Not implemented yet' };
  }
}
