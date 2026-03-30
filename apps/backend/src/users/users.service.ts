import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return { message: 'Not implemented yet' };
  }

  findOne(id: number) {
    return { message: 'Not implemented yet' };
  }
}
