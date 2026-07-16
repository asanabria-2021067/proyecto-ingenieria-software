import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
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
    const accessToken = this.jwtService.sign(payload, { expiresIn: '45m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
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
    const accessToken = this.jwtService.sign(payload, { expiresIn: '45m' });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' });

    return {
      accessToken,
      refreshToken,
    };
  }

  async forgotPassword(carne: string, correo: string) {
    const genericResponse = {
      mensaje: 'Si los datos son correctos, tu solicitud fue registrada y un administrador se pondrá en contacto contigo',
    };

    const perfil = await this.prisma.perfilEstudiante.findUnique({
      where: { carne },
      select: {
        usuario: { select: { idUsuario: true, nombre: true, apellido: true } },
      },
    });

    if (!perfil) {
      return genericResponse;
    }

    const solicitud = await this.prisma.solicitudRecuperacion.create({
      data: {
        idUsuario: perfil.usuario.idUsuario,
        carneReferencia: carne,
        correoReferencia: correo,
      },
    });

    await this.notificationsService.notifyAdminsFromTemplate('SOLICITUD_RECUPERACION_CONTRASENA', {
      userName: `${perfil.usuario.nombre} ${perfil.usuario.apellido}`,
      carne,
      solicitudId: solicitud.idSolicitud,
    });

    return genericResponse;
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

  async refreshToken(refreshToken: string) {
    try {
      const payload = this.jwtService.verify(refreshToken);
      const newPayload = { sub: payload.sub, correo: payload.correo };
      const accessToken = this.jwtService.sign(newPayload, { expiresIn: '45m' });
      const newRefreshToken = this.jwtService.sign(newPayload, { expiresIn: '7d' });

      return {
        accessToken,
        refreshToken: newRefreshToken,
      };
    } catch {
      throw new UnauthorizedException('Token de refresco inválido o expirado');
    }
  }
}
