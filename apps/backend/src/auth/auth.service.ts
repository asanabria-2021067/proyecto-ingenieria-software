import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(loginDto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: loginDto.correo },
    });

    if (!usuario) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const contrasenaValida = await bcrypt.compare(
      loginDto.contrasena,
      usuario.contrasena,
    );

    if (!contrasenaValida) {
      throw new UnauthorizedException('Credenciales invalidas');
    }

    const payload = { sub: usuario.idUsuario, correo: usuario.correo };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async register(registerDto: RegisterDto) {
    const existente = await this.prisma.usuario.findUnique({
      where: { correo: registerDto.correo },
    });

    if (existente) {
      throw new ConflictException('El correo ya esta registrado');
    }

    const contrasenaHash = await bcrypt.hash(registerDto.contrasena, 10);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({
        data: {
          correo: registerDto.correo,
          contrasena: contrasenaHash,
          nombre: registerDto.nombre,
          apellido: registerDto.apellido,
        },
      });

      await tx.perfilEstudiante.create({
        data: {
          idUsuario: user.idUsuario,
          carne: registerDto.carne,
          idCarrera: registerDto.idCarrera,
          semestre: registerDto.semestre,
        },
      });

      return user;
    });

    const payload = { sub: usuario.idUsuario, correo: usuario.correo };

    return {
      accessToken: this.jwtService.sign(payload),
    };
  }

  async forgotPassword(correo: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { idUsuario: true, correo: true },
    });

    if (!usuario) {
      // Por seguridad, no revelar si el correo existe
      return {
        mensaje: 'Si el correo existe, recibirás un enlace de recuperación',
      };
    }

    const resetToken = this.jwtService.sign(
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: 'reset' },
      { expiresIn: '1h' },
    );

    // TODO: En producción, enviar email con el token
    // Por ahora devolvemos el token directamente para desarrollo
    return {
      mensaje: 'Si el correo existe, recibirás un enlace de recuperación',
      resetToken, // Solo para desarrollo
    };
  }

  async resetPassword(token: string, nuevaContrasena: string) {
    let payload: any;
    try {
      payload = this.jwtService.verify(token);
    } catch {
      throw new BadRequestException('Token inválido o expirado');
    }

    if (payload.tipo !== 'reset') {
      throw new BadRequestException('Token no válido para esta operación');
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
    });

    if (!usuario) {
      throw new NotFoundException('Usuario no encontrado');
    }

    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);

    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: { contrasena: contrasenaHash },
    });

    return { mensaje: 'Contraseña actualizada exitosamente' };
  }
}
