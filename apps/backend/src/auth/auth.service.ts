import {
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { EstadoUsuario } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { correoCoincideConIdentidad, correoInstitucionalEsperado, normalizarCorreo } from "./correo-institucional.util";
import { ACCESS_TOKEN_TTL, REFRESH_TOKEN_TTL, REFRESH_TOKEN_MAX_AGE_MS } from "./cookie.util";
import { getJwtSecret } from "../config/jwt-secret";
import {
  AccountAttemptsService,
  RECOVERY_ATTEMPTS,
  RECOVERY_ATTEMPT_POLICY,
} from "./account-attempts.service";
import { SecurityEventsService } from "../security-events/security-events.service";
import { TipoEventoSeguridad } from "../security-events/tipos-evento-seguridad";
import { accountReference } from "../security-events/account-reference";
import type { SecurityRequestContext } from "../security-events/request-context";

/**
 * G04 (OWASP25-C023): hash bcrypt (cost 10, el mismo de registro y reset) de
 * un valor aleatorio descartado. Cuando el correo no existe se compara contra
 * él, así el login hace el mismo trabajo criptográfico que con una contraseña
 * incorrecta y el tiempo de respuesta no revela si la cuenta existe. Ninguna
 * contraseña coincide con este hash.
 */
export const UNKNOWN_USER_PASSWORD_HASH = "$2b$10$aIZFrVp.yjl7jr05RXCHVeqgnl4MBvycTKQSNmO.YZyOxlZpEtLR.";

/**
 * G04 (OWASP25-C036): clave del contador por cuenta. Mayúsculas y espacios no
 * abren un contador nuevo para la misma cuenta.
 */
export function accountAttemptKey(correo: string): string {
  return correo.trim().toLowerCase();
}

export const MENSAJE_CUENTA_PENDIENTE = "Tu cuenta está pendiente de verificación por administración";

interface ResetTokenPayload {
  tipo: string;
  idSolicitud: number;
  sub: number;
  correo: string;
}

@Injectable()
export class AuthService {
  private readonly refreshSecret: string;

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private notificationsService: NotificationsService,
    // El default solo aplica a instancias manuales (tests); Nest inyecta el provider de AuthModule.
    private readonly attempts: AccountAttemptsService = new AccountAttemptsService(),
    @Inject(RECOVERY_ATTEMPTS)
    private readonly recoveryAttempts: AccountAttemptsService = new AccountAttemptsService(RECOVERY_ATTEMPT_POLICY),
    // G05: writer best-effort; el default (tests) usa el mismo PrismaService.
    private readonly securityEvents: SecurityEventsService = new SecurityEventsService(prisma),
  ) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error("JWT_REFRESH_SECRET no está definida");
    }
    this.refreshSecret = refreshSecret;
  }

  private hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
  }

  /** Firma el par de tokens y persiste el hash del refresh token para poder revocarlo (logout, rotación). */
  private async issueTokens(usuario: { idUsuario: number; correo: string }) {
    const accessToken = this.jwtService.sign(
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: "access" },
      { secret: getJwtSecret(), expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = this.jwtService.sign(
      // jti: dos refresh tokens del mismo usuario firmados dentro del mismo
      // segundo (iat idéntico) producirían el mismo JWT y por lo tanto el
      // mismo tokenHash, chocando con la unicidad de la columna.
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: "refresh", jti: randomUUID() },
      { secret: this.refreshSecret, expiresIn: REFRESH_TOKEN_TTL },
    );

    await this.prisma.tokenRefresco.create({
      data: {
        idUsuario: usuario.idUsuario,
        tokenHash: this.hashToken(refreshToken),
        expiraEn: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
      },
    });

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, origen?: SecurityRequestContext) {
    // G04 (OWASP25-C036): una cuenta bloqueada sigue el MISMO camino (búsqueda
    // + bcrypt) y recibe la MISMA respuesta que unas credenciales inválidas.
    const cuenta = accountAttemptKey(loginDto.correo);
    const bloqueada = this.attempts.lockedUntil(cuenta) !== null;

    const usuario = await this.prisma.usuario.findUnique({
      where: { correo: loginDto.correo },
    });

    // Sin bifurcación temprana: exista o no la cuenta, siempre hay un bcrypt.compare.
    const contrasenaValida = await bcrypt.compare(
      loginDto.contrasena,
      usuario?.contrasena ?? UNKNOWN_USER_PASSWORD_HASH,
    );

    // G04 (OWASP25-C023): una cuenta BLOQUEADO o INACTIVO no recibe tokens
    // aunque la contraseña sea correcta; la respuesta es la misma genérica.
    const pendiente = usuario?.estado === EstadoUsuario.PENDIENTE_VERIFICACION;

    if (bloqueada || !usuario || !contrasenaValida || usuario.estado !== EstadoUsuario.ACTIVO) {
      // Cuenta inexistente o contraseña incorrecta suman al contador por igual.
      const bloqueoNuevo = !bloqueada && (!usuario || !contrasenaValida) && this.attempts.recordFailure(cuenta);
      const cuentaRef = usuario ? {} : { cuentaRef: accountReference(loginDto.correo) };
      // G05 (OWASP25-C037): un evento por intento, tras conocer el resultado.
      // Una cuenta inexistente se identifica solo con una referencia
      // seudónima: nunca el correo en claro. La respuesta externa no cambia.
      await this.securityEvents.record({
        tipo: TipoEventoSeguridad.LOGIN_FAILED,
        origen,
        idUsuarioAfectado: usuario?.idUsuario ?? null,
        detalle: {
          motivo: bloqueada
            ? "BLOQUEO_TEMPORAL"
            : !usuario || !contrasenaValida
              ? "CREDENCIALES"
              : pendiente
                ? "CUENTA_PENDIENTE_VERIFICACION"
                : "CUENTA_NO_ACTIVA",
          cuentaConocida: Boolean(usuario),
          ...cuentaRef,
        },
      });
      // G05 (OWASP25-C037/C036): el cruce al bloqueo se registra una sola vez;
      // los intentos siguientes durante el bloqueo no generan más eventos de este tipo.
      if (bloqueoNuevo) {
        await this.securityEvents.record({
          tipo: TipoEventoSeguridad.ACCOUNT_LOCKED,
          origen,
          idUsuarioAfectado: usuario?.idUsuario ?? null,
          detalle: { cuentaConocida: Boolean(usuario), ...cuentaRef },
        });
      }
      if (!bloqueada && pendiente) {
        throw new ForbiddenException(MENSAJE_CUENTA_PENDIENTE);
      }
      throw new UnauthorizedException("Credenciales invalidas");
    }

    this.attempts.recordSuccess(cuenta);

    // Última sesión: solo tras una autenticación exitosa.
    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: { fechaUltimaSesion: new Date() },
    });

    const tokens = await this.issueTokens(usuario);
    // G05: el éxito se registra cuando los tokens ya existen (resultado real).
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.LOGIN_SUCCEEDED,
      origen,
      idActor: usuario.idUsuario,
      idUsuarioAfectado: usuario.idUsuario,
    });
    return tokens;
  }

  async register(registerDto: RegisterDto) {
    const correo = normalizarCorreo(registerDto.correo);
    if (!correoCoincideConIdentidad(correo, registerDto.apellido, registerDto.carne)) {
      const correoEsperado = correoInstitucionalEsperado(registerDto.apellido, registerDto.carne);
      throw new BadRequestException(
        `El correo no coincide con tu apellido y carné. Tu correo debería ser ${correoEsperado}`,
      );
    }

    const existente = await this.prisma.usuario.findUnique({
      where: { correo },
    });

    if (existente) {
      throw new ConflictException("El correo ya esta registrado");
    }

    const contrasenaHash = await bcrypt.hash(registerDto.contrasena, 10);

    const usuario = await this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({
        data: {
          correo,
          contrasena: contrasenaHash,
          nombre: registerDto.nombre,
          apellido: registerDto.apellido,
          estado: EstadoUsuario.PENDIENTE_VERIFICACION,
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

    await this.notificationsService.notifyAdminsFromTemplate("CUENTA_PENDIENTE_VERIFICACION", {
      userName: `${registerDto.nombre} ${registerDto.apellido}`,
      carne: registerDto.carne,
      userId: usuario.idUsuario,
    });

    return { idUsuario: usuario.idUsuario, estado: EstadoUsuario.PENDIENTE_VERIFICACION };
  }

  async forgotPassword(carne: string, correo: string) {
    const genericResponse = {
      mensaje:
        "Si los datos son correctos, tu solicitud fue registrada y un administrador se pondrá en contacto contigo",
    };

    // G04 (OWASP25-C036/C014): acota las solicitudes por carné. Pasado el
    // límite no se crea registro ni se notifica a los administradores, y la
    // respuesta pública es exactamente la misma (no revela nada del carné).
    const cuenta = `recuperacion:${carne.trim().toLowerCase()}`;
    if (this.recoveryAttempts.lockedUntil(cuenta) !== null) {
      return genericResponse;
    }
    this.recoveryAttempts.recordFailure(cuenta);

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

  async resetPassword(token: string, nuevaContrasena: string, origen?: SecurityRequestContext) {
    let payload: ResetTokenPayload;
    try {
      payload = this.jwtService.verify<ResetTokenPayload>(token);
    } catch {
      throw new BadRequestException("Token inválido o expirado");
    }

    if (payload.tipo !== "reset") {
      throw new BadRequestException("Token no válido para esta operación");
    }

    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
    });

    if (!usuario) {
      throw new NotFoundException("Usuario no encontrado");
    }

    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);

    // G04 (OWASP25-C024): consumir el token, cambiar la contraseña y revocar
    // TODAS las sesiones de refresh es una sola transacción. El consumo es un
    // UPDATE condicional (`tokenUtilizadoEn IS NULL`): con dos resets
    // simultáneos del mismo token, PostgreSQL deja ganar exactamente a uno y
    // el otro ve 0 filas y falla sin tocar la contraseña.
    const sesionesRevocadas = await this.prisma.$transaction(async (tx) => {
      const ahora = new Date();
      const consumo = await tx.solicitudRecuperacion.updateMany({
        where: { idSolicitud: payload.idSolicitud, idUsuario: usuario.idUsuario, tokenUtilizadoEn: null },
        data: { tokenUtilizadoEn: ahora },
      });
      if (consumo.count !== 1) {
        throw new BadRequestException("Token inválido o ya utilizado");
      }

      await tx.usuario.update({
        where: { idUsuario: usuario.idUsuario },
        data: { contrasena: contrasenaHash },
      });

      const revocadas = await tx.tokenRefresco.updateMany({
        where: { idUsuario: usuario.idUsuario, revocadoEn: null },
        data: { revocadoEn: ahora },
      });
      return revocadas.count;
    });

    // G05 (OWASP25-C037): solo tras un reset realmente consumido (la
    // transacción ya confirmó). Un token inválido o reutilizado no llega aquí.
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.PASSWORD_RESET_COMPLETED,
      origen,
      idActor: usuario.idUsuario,
      idUsuarioAfectado: usuario.idUsuario,
      detalle: { idSolicitud: payload.idSolicitud, sesionesRevocadas },
    });

    return { mensaje: "Contraseña actualizada exitosamente" };
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: number; correo: string; tipo?: string };
    try {
      payload = this.jwtService.verify(refreshToken, { secret: this.refreshSecret });
    } catch {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    if (payload.tipo !== "refresh") {
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

    // G04 (OWASP25-C023): el refresh tampoco renueva credenciales de una
    // cuenta que dejó de estar ACTIVO; el token presentado ya quedó revocado.
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
      select: { idUsuario: true, correo: true, estado: true },
    });
    if (!usuario || usuario.estado !== EstadoUsuario.ACTIVO) {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    return this.issueTokens({ idUsuario: usuario.idUsuario, correo: usuario.correo });
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    await this.prisma.tokenRefresco.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }
}
