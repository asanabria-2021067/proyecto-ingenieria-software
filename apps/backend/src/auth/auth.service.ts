import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Resend } from 'resend';
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
    const resendKey = process.env.RESEND_API_KEY;
    if (!resendKey) {
      console.warn('[AuthService] RESEND_API_KEY no está configurada — los emails de recuperación NO se enviarán en producción');
    }
    if (!process.env.FRONTEND_URL) {
      console.warn('[AuthService] FRONTEND_URL no está configurada — los links de recuperación serán inválidos');
    }
    this.resend = new Resend(resendKey || 're_dummy_key_not_configured');
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

  async forgotPassword(correo: string) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo },
      select: { idUsuario: true, correo: true, nombre: true, apellido: true },
    });

    if (!usuario) {
      return {
        mensaje: 'Si el correo existe, recibirás un enlace de recuperación',
      };
    }

    const resetToken = this.jwtService.sign(
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: 'reset' },
      { expiresIn: '1h' },
    );

    const frontendUrl = process.env.FRONTEND_URL?.replace(/\/$/, '') || 'https://uvgenius.com';
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    try {
      await this.resend.emails.send({
        from: process.env.MAIL_FROM || 'onboarding@resend.dev',
        to: usuario.correo,
        subject: 'Recuperación de contraseña - UVGENIUS',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a73e8;">Recuperación de contraseña</h2>
            <p>Hola ${usuario.nombre} ${usuario.apellido},</p>
            <p>Recibimos una solicitud para restablecer la contraseña de tu cuenta en UVGENIUS.</p>
            <p>Haz clic en el siguiente enlace para crear una nueva contraseña:</p>
            <p style="margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background-color: #1a73e8; color: white; padding: 12px 24px;
                        text-decoration: none; border-radius: 4px; display: inline-block;">
                Restablecer contraseña
              </a>
            </p>
            <p>Este enlace es válido por 1 hora.</p>
            <p>Si no solicitaste este cambio, puedes ignorar este correo.</p>
            <p style="color: #666; font-size: 12px; margin-top: 40px;">
              UVGENIUS - Universidad del Valle de Guatemala
            </p>
          </div>
        `,
      });
    } catch (error) {
      console.error('Error enviando email de recuperación:', error);
    }

    return {
      mensaje: 'Si el correo existe, recibirás un enlace de recuperación',
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
