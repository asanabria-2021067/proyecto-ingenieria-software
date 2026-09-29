import { SYNTHETIC_JWT_SECRET } from './synthetic-jwt-secret';

/**
 * setupFile de Vitest (unitarias e integración): fija un JWT_SECRET sintético
 * antes de importar cada spec, para que ninguna suite dependa del fallback
 * predecible del código ni herede un secreto real del shell del desarrollador.
 * Los specs que necesitan otro valor lo fijan explícitamente.
 */
process.env.JWT_SECRET = SYNTHETIC_JWT_SECRET;
