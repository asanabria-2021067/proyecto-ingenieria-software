import {
  ForbiddenException,
  Inject,
  Injectable,
  Optional,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
  NotFoundException,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { EventEmitter2 } from "@nestjs/event-emitter";
import * as bcrypt from "bcryptjs";
import { createHash, randomUUID } from "crypto";
import { EstadoUsuario } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { NotificationsService } from "../notifications/notifications.service";
import { LoginDto } from "./dto/login.dto";
import { RegisterDto } from "./dto/register.dto";
import { correoCoincideConIdentidad, correoInstitucionalEsperado, normalizarCorreo } from "./correo-institucional.util";
import { huellaDispositivo, parseUserAgent, type DispositivoInfo } from "./user-agent.util";
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
import { ACCOUNT_ACCESS_REVOKED, type AccountAccessRevokedEvent } from "../ws-auth/account-access.events";

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
export function accountAttemptKey(correo: string, ip?: string | null): string {
  return `${correo.trim().toLowerCase()}|${ip ?? ''}`;
}

export const MENSAJE_CUENTA_PENDIENTE = "Tu cuenta está pendiente de verificación por administración";

interface ResetTokenPayload {
  tipo: string;
  idSolicitud: number;
  sub: number;
  correo: string;
}

export const hashRefreshToken = (token: string): string => createHash("sha256").update(token).digest("hex");

/** MEJ-81/82: lo que identifica una sesión; la rotación del refresh lo conserva. */
export interface SesionMeta {
  idSesion: string;
  navegador?: string | null;
  sistema?: string | null;
  huella?: string | null;
}

/** Navegador desde el que se inicia sesión: user-agent y el identificador estable de la cookie device_id. */
export interface OrigenDispositivo {
  userAgent?: string;
  idDispositivo: string;
}

/** Dos pestañas pueden refrescar con la misma cookie a la vez: dentro de esta ventana el segundo solo recibe 401. */
const REFRESH_REUSE_GRACE_MS = 10_000;

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
    @Optional() private readonly events?: EventEmitter2,
  ) {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    if (!refreshSecret) {
      throw new Error("JWT_REFRESH_SECRET no está definida");
    }
    this.refreshSecret = refreshSecret;
  }

  private hashToken(token: string): string {
    return hashRefreshToken(token);
  }

  /** Firma el par de tokens y persiste el hash del refresh token para poder revocarlo (logout, rotación). */
  private async issueTokens(
    usuario: { idUsuario: number; correo: string; sesionVersion: number },
    sesion: SesionMeta,
  ) {
    const accessToken = this.jwtService.sign(
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: "access", sv: usuario.sesionVersion },
      { secret: getJwtSecret(), expiresIn: ACCESS_TOKEN_TTL },
    );
    const refreshToken = this.jwtService.sign(
      // jti: dos refresh tokens del mismo usuario firmados dentro del mismo
      // segundo (iat idéntico) producirían el mismo JWT y por lo tanto el
      // mismo tokenHash, chocando con la unicidad de la columna.
      { sub: usuario.idUsuario, correo: usuario.correo, tipo: "refresh", jti: randomUUID(), sv: usuario.sesionVersion },
      { secret: this.refreshSecret, expiresIn: REFRESH_TOKEN_TTL },
    );

    await this.prisma.tokenRefresco.create({
      data: {
        idUsuario: usuario.idUsuario,
        tokenHash: this.hashToken(refreshToken),
        expiraEn: new Date(Date.now() + REFRESH_TOKEN_MAX_AGE_MS),
        idSesion: sesion.idSesion,
        navegador: sesion.navegador ?? null,
        sistema: sesion.sistema ?? null,
        huella: sesion.huella ?? null,
      },
    });

    return { accessToken, refreshToken };
  }

  async login(loginDto: LoginDto, origen?: SecurityRequestContext, dispositivo?: OrigenDispositivo) {
    // G04 (OWASP25-C036): una cuenta bloqueada sigue el MISMO camino (búsqueda
    // + bcrypt) y recibe la MISMA respuesta que unas credenciales inválidas.
    const cuenta = accountAttemptKey(loginDto.correo, origen?.ip);
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
    // Solo con la contraseña correcta se revela que la cuenta está pendiente (no es un oráculo de existencia).
    const pendiente = usuario?.estado === EstadoUsuario.PENDIENTE_VERIFICACION && contrasenaValida;

    if (bloqueada || !usuario || !contrasenaValida || usuario.estado !== EstadoUsuario.ACTIVO) {
      // Todo 401 suma al contador por igual (cuenta inexistente, contraseña incorrecta,
      // INACTIVO/BLOQUEADO con la contraseña correcta): así intentosRestantes sigue la
      // misma secuencia y no delata la cuenta. Solo PENDIENTE (403, documentado) no suma.
      const bloqueoNuevo = !bloqueada && !pendiente && this.attempts.recordFailure(cuenta);
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
      // NL-T1: intentos que quedan antes del bloqueo temporal. Sale del mismo
      // contador correo+IP que se alimenta con cuentas inexistentes, así que
      // un correo registrado y uno que no lo está reciben el mismo número.
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Credenciales inválidas",
        error: "Unauthorized",
        intentosRestantes: this.attempts.remaining(cuenta),
      });
    }

    this.attempts.recordSuccess(cuenta);

    // Última sesión: solo tras una autenticación exitosa.
    await this.prisma.usuario.update({
      where: { idUsuario: usuario.idUsuario },
      data: { fechaUltimaSesion: new Date() },
    });

    const info = dispositivo ? parseUserAgent(dispositivo.userAgent) : null;
    const huella = dispositivo && info ? huellaDispositivo(dispositivo.idDispositivo, info) : null;
    const idSesion = randomUUID();
    const tokens = await this.issueTokens(usuario, { idSesion, ...info, huella });
    if (huella && info) {
      // El aviso de navegador nuevo nunca bloquea el inicio de sesión.
      await this.registrarDispositivo(usuario.idUsuario, huella, info, idSesion).catch(() => undefined);
    }
    // G05: el éxito se registra cuando los tokens ya existen (resultado real).
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.LOGIN_SUCCEEDED,
      origen,
      idActor: usuario.idUsuario,
      idUsuarioAfectado: usuario.idUsuario,
    });
    return tokens;
  }

  /** MEJ-82: «nuevo» = huella no vista antes en la cuenta; la primera de todas no avisa. */
  private async registrarDispositivo(idUsuario: number, huella: string, info: DispositivoInfo, idSesion: string) {
    const conocidos = await this.prisma.dispositivoUsuario.count({ where: { idUsuario } });
    const { count } = await this.prisma.dispositivoUsuario.createMany({
      data: [{ idUsuario, huella, ...info }],
      skipDuplicates: true,
    });
    if (count === 0) {
      await this.prisma.dispositivoUsuario.update({
        where: { idUsuario_huella: { idUsuario, huella } },
        data: { ultimaVezEn: new Date() },
      });
    } else if (conocidos > 0) {
      await this.notificationsService.notifyFromTemplate([idUsuario], "NUEVO_INICIO_SESION", { ...info, idSesion });
    }
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

  async forgotPassword(carne: string, correo: string, origen?: SecurityRequestContext) {
    const genericResponse = {
      mensaje:
        "Si los datos son correctos, tu solicitud fue registrada y un administrador se pondrá en contacto contigo",
    };

    // G04 (OWASP25-C036/C014): acota las solicitudes por carné. Pasado el
    // límite no se crea registro ni se notifica a los administradores, y la
    // respuesta pública es exactamente la misma (no revela nada del carné).
    const cuenta = `recuperacion:${carne.trim().toLowerCase()}|${origen?.ip ?? ""}`;
    if (this.recoveryAttempts.lockedUntil(cuenta) !== null) {
      return genericResponse;
    }
    this.recoveryAttempts.recordFailure(cuenta);

    const perfil = await this.prisma.perfilEstudiante.findUnique({
      where: { carne },
      select: {
        usuario: { select: { idUsuario: true, nombre: true, apellido: true, correo: true } },
      },
    });

    // El correo declarado debe ser el de la cuenta: misma respuesta genérica si no coincide.
    if (!perfil || normalizarCorreo(correo) !== perfil.usuario.correo.toLowerCase()) {
      return genericResponse;
    }

    const solicitud = await this.prisma.solicitudRecuperacion.create({
      data: {
        idUsuario: perfil.usuario.idUsuario,
        carneReferencia: carne,
        correoReferencia: perfil.usuario.correo,
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
        data: { contrasena: contrasenaHash, sesionVersion: { increment: 1 } },
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

    // Cierra los sockets abiertos de la cuenta: las sesiones de refresh ya quedaron revocadas.
    this.events?.emit(ACCOUNT_ACCESS_REVOKED, { idUsuario: usuario.idUsuario } satisfies AccountAccessRevokedEvent);

    return { mensaje: "Contraseña actualizada exitosamente" };
  }

  async refreshToken(refreshToken: string) {
    let payload: { sub: number; correo: string; tipo?: string; sv?: number };
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

    // Reuso de un token ya rotado fuera de la ventana de carrera entre pestañas:
    // alguien más lo tiene, así que se cierran todas las sesiones de la cuenta.
    // Solo cuenta si el token es de la versión de sesión vigente: uno revocado por
    // un reset de contraseña o un bloqueo (versión anterior) es una pestaña vieja,
    // no un robo, y no debe tumbar la sesión nueva del usuario.
    // Un cierre deliberado (sesiones abiertas, «No fui yo») fija expiraEn <= revocadoEn: no es reuso, solo 401.
    const cierreDeliberado = registro?.revocadoEn && registro.expiraEn <= registro.revocadoEn;
    if (registro?.revocadoEn && !cierreDeliberado && Date.now() - registro.revocadoEn.getTime() > REFRESH_REUSE_GRACE_MS) {
      const dueno = await this.prisma.usuario.findUnique({
        where: { idUsuario: registro.idUsuario },
        select: { sesionVersion: true },
      });
      if (dueno && (payload.sv ?? 0) === dueno.sesionVersion) {
        await this.prisma.tokenRefresco.updateMany({
          where: { idUsuario: registro.idUsuario, revocadoEn: null },
          data: { revocadoEn: new Date() },
        });
      }
    }

    if (!registro || registro.revocadoEn || registro.expiraEn < new Date()) {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    // Rotación atómica: el UPDATE condicional deja pasar a un solo refresh por
    // token aunque lleguen dos a la vez; el perdedor no recibe tokens.
    const rotado = await this.prisma.tokenRefresco.updateMany({
      where: { idTokenRefresco: registro.idTokenRefresco, revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
    if (rotado.count !== 1) {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    // G04 (OWASP25-C023): el refresh tampoco renueva credenciales de una
    // cuenta que dejó de estar ACTIVO; el token presentado ya quedó revocado.
    const usuario = await this.prisma.usuario.findUnique({
      where: { idUsuario: payload.sub },
      select: { idUsuario: true, correo: true, estado: true, sesionVersion: true },
    });
    // Un refresh de otra versión de sesión (reset de contraseña, bloqueo) tampoco renueva: cubre la
    // carrera con un reset o un bloqueo que confirmó después de leer el token pero antes de rotarlo.
    if (!usuario || usuario.estado !== EstadoUsuario.ACTIVO || (payload.sv ?? 0) !== usuario.sesionVersion) {
      throw new UnauthorizedException("Token de refresco inválido o expirado");
    }

    return this.issueTokens(usuario, {
      idSesion: registro.idSesion ?? randomUUID(),
      navegador: registro.navegador,
      sistema: registro.sistema,
      huella: registro.huella,
    });
  }

  /** MEJ-83: cambia la contraseña pidiendo la actual; cierra todas las sesiones y devuelve tokens nuevos para la actual. */
  async cambiarContrasena(
    idUsuario: number,
    contrasenaActual: string,
    nuevaContrasena: string,
    refreshToken?: string,
    origen?: SecurityRequestContext,
  ) {
    const cuenta = `cambio-contrasena:${idUsuario}`;
    if (this.attempts.lockedUntil(cuenta) !== null) {
      throw new HttpException("Demasiados intentos. Intenta de nuevo más tarde", HttpStatus.TOO_MANY_REQUESTS);
    }
    const usuario = await this.prisma.usuario.findUnique({ where: { idUsuario } });
    if (!usuario || !(await bcrypt.compare(contrasenaActual, usuario.contrasena))) {
      this.attempts.recordFailure(cuenta);
      throw new BadRequestException("La contraseña actual no es correcta");
    }
    this.attempts.recordSuccess(cuenta);
    if (contrasenaActual === nuevaContrasena) {
      throw new BadRequestException("La nueva contraseña debe ser distinta de la actual");
    }

    const actual = refreshToken
      ? await this.prisma.tokenRefresco.findFirst({ where: { tokenHash: this.hashToken(refreshToken), idUsuario } })
      : null;
    const contrasenaHash = await bcrypt.hash(nuevaContrasena, 10);
    const { sesionVersion, sesionesRevocadas } = await this.prisma.$transaction(async (tx) => {
      const actualizado = await tx.usuario.update({
        where: { idUsuario },
        data: { contrasena: contrasenaHash, sesionVersion: { increment: 1 } },
        select: { sesionVersion: true },
      });
      const revocadas = await tx.tokenRefresco.updateMany({
        where: { idUsuario, revocadoEn: null },
        data: { revocadoEn: new Date() },
      });
      return { sesionVersion: actualizado.sesionVersion, sesionesRevocadas: revocadas.count };
    });

    const tokens = await this.issueTokens(
      { idUsuario, correo: usuario.correo, sesionVersion },
      {
        idSesion: actual?.idSesion ?? randomUUID(),
        navegador: actual?.navegador,
        sistema: actual?.sistema,
        huella: actual?.huella,
      },
    );
    await this.securityEvents.record({
      tipo: TipoEventoSeguridad.PASSWORD_CHANGED,
      origen,
      idActor: idUsuario,
      idUsuarioAfectado: idUsuario,
      detalle: { sesionesRevocadas },
    });
    this.events?.emit(ACCOUNT_ACCESS_REVOKED, { idUsuario } satisfies AccountAccessRevokedEvent);
    return tokens;
  }

  async logout(refreshToken?: string) {
    if (!refreshToken) return;
    await this.prisma.tokenRefresco.updateMany({
      where: { tokenHash: this.hashToken(refreshToken), revocadoEn: null },
      data: { revocadoEn: new Date() },
    });
  }
}
