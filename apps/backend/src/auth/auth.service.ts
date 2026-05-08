import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Resend } from 'resend';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  private resend: Resend;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {
    this.resend = new Resend(process.env.RESEND_API_KEY);
  }

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

  async forgotPassword(email: string): Promise<void> {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: email },
    });

    if (!usuario) {
      return;
    }

    const resetToken = this.jwtService.sign(
      { sub: usuario.idUsuario, correo: usuario.correo },
      { expiresIn: '1h' }
    );

    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: {
        resetPasswordToken: resetToken,
        resetPasswordExpires: expiresAt,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const resetLink = `${frontendUrl}/restablecer-contrasena?token=${resetToken}`;

    await this.resend.emails.send({
      from: process.env.MAIL_FROM || 'onboarding@resend.dev',
      to: usuario.correo,
      subject: 'Recupera tu contraseña',
      html: `<p>Haz click aquí para restablecer tu contraseña:</p>
             <a href="${resetLink}">Restablecer contraseña</a>
             <p>Este link expira en 1 hora.</p>`,
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    let payload: any;

    try {
      payload = this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Token inválido o expirado');
    }

    const usuario = await this.prisma.usuario.findFirst({
      where: {
        resetPasswordToken: token,
      },
    });

    if (!usuario) {
      throw new UnauthorizedException('Token inválido');
    }

    if (usuario.resetPasswordExpires && usuario.resetPasswordExpires < new Date()) {
      throw new UnauthorizedException('Token expirado');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: {
        contrasena: hashedPassword,
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });
  }
}
