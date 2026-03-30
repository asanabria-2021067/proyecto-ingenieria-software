import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return { message: 'Not implemented yet' };
  }

  create(data: any) {
    return { message: 'Not implemented yet' };
  }

  update(id: number, data: any) {
    return { message: 'Not implemented yet' };
  }
}
