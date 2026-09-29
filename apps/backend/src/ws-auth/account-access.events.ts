/**
 * G07 (OWASP25-C025): una cuenta dejó de estar ACTIVO (BLOQUEADO o INACTIVO).
 * AdminService lo emite por el EventEmitter global sin conocer los gateways;
 * cada gateway cierra los sockets abiertos de esa cuenta (room `user:{id}`),
 * así el acceso realtime no sobrevive al estado HTTP. Las conexiones nuevas ya
 * las rechaza la política del handshake.
 */
export const ACCOUNT_ACCESS_REVOKED = 'account.access-revoked';

export interface AccountAccessRevokedEvent {
  idUsuario: number;
}
