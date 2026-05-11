import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return { message: 'Not implemented yet' };
  }

  create(_data: any) {
    return { message: 'Not implemented yet' };
  }

  update(_id: number, _data: any) {
    return { message: 'Not implemented yet' };
  }
}
