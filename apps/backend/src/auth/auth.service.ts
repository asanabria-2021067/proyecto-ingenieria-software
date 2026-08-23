import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, REFRESH_TOKEN_MAX_AGE_MS } from "./cookie.util";

interface ResetTokenPayload {
  tipo: string;
  idSolicitud: number;
  sub: number;
  correo: string;
}

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
  ) {}

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Firma el par de tokens y persiste el hash del refresh token para poder revocarlo (logout, rotación). */
  private async issueTokens(usuario: { idUsuario: number; correo: string }) {
    const payload = { sub: usuario.idUsuario, correo: usuario.correo };
    const accessToken = this.jwtService.sign(payload, { expiresIn: ACCESS_TOKEN_TTL });
    const refreshToken = this.jwtService.sign(payload, { expiresIn: REFRESH_TOKEN_TTL });

    await this.prisma.tokenRefresco.create({
      data: {
        idUsuario: usuario.idUsuario,
        tokenHash: this.hashToken(refreshToken),
        expiraEn: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto) {
    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: loginDto.correo },
    });

    if (!usuario) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    const contrasenaValida = await bcrypt.compare(
      loginDto.contrasena,
      usuario.contrasena,
    );

    if (!contrasenaValida) {
      throw new UnauthorizedException("Credenciales invalidas");
    }

    return this.issueTokens(usuario);
  }

  async register(registerDto: RegisterDto) {
    const existente = await this.prisma.usuario.findUnique({
      where: { correo: registerDto.correo },
    });

    if (existente) {
      throw new ConflictException("El correo ya esta registrado");
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

    return this.issueTokens(usuario);
  }

  async forgotPassword(carne: string, correo: string) {
    const genericResponse = {
      mensaje:
        "Si los datos son correctos, tu solicitud fue registrada y un administrador se pondrá en contacto contigo",
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

    await this.notificationsService.notifyAdminsFromTemplate(
      "SOLICITUD_RECUPERACION_CONTRASENA",
      {
        userName: `${perfil.usuario.nombre} ${perfil.usuario.apellido}`,
        carne,
        solicitudId: solicitud.idSolicitud,
      },
    );

    return genericResponse;
  }

  async resetPassword(token: string, nuevaContrasena: string) {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwtService.verify<ResetTokenPayload>(token);
    } catch {
      throw new BadRequestException("Token inválido o expirado");
    }

    if (payload.tipo !== "reset") {
      throw new BadRequestException("Token no válido para esta operación");
    }

    const solicitud = await this.prisma.solicitudRecuperacion.findUnique({
      where: { idSolicitud: payload.idSolicitud },
    });

    if (!solicitud || solicitud.tokenUtilizadoEn) {
      throw new BadRequestException("Token inválido o ya utilizado");
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
    });

    if (!usuario) {
      throw new NotFoundException("Usuario no encontrado");
    }

    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);

    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: { contrasena: contrasenaHash },
    });

    await this.prisma.solicitudRecuperacion.update({
      where: { idSolicitud: solicitud.idSolicitud },
      data: { tokenUtilizadoEn: new Date() },
    });

    return { mensaje: "Contraseña actualizada exitosamente" };
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: number; correo: string };
    try {
      payload = this.jwtService.verify(refreshToken);
    } catch {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    const tokenHash = this.hashToken(refreshToken);
    const registro = await this.prisma.tokenRefresco.findUnique({ where: { tokenHash } });

    if (!registro || registro.revocadoEn || registro.expiraEn < new Date()) {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    // Rotación: el token usado queda inválido, uno reintentando reutilizarlo
    // (robado o duplicado) se topa con `revocadoEn` ya seteado en el siguiente refresh.
    await this.prisma.tokenRefresco.update({
      where: { idTokenRefresco: registro.idTokenRefresco },
      data: { revocadoEn: new Date() },
    });

    return this.issueTokens({ idUsuario: payload.sub, correo: payload.correo });
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    await this.prisma.tokenRefresco.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }
}
