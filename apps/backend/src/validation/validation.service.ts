import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ValidationService {
  constructor(private prisma: PrismaService) {}

  create(_data: unknown) {
    return { message: 'Not implemented yet' };
  }

  findAll() {
    return { message: 'Not implemented yet' };
  }
}
