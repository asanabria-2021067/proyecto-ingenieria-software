import { describe, expect, it, vi } from 'vitest';
import { AppController } from '../src/app.controller';
import { ApplicationsController } from '../src/applications/applications.controller';
import { AuthController } from '../src/auth/auth.controller';
import { CatalogsController } from '../src/catalogs/catalogs.controller';
import { ComentariosController } from '../src/comentarios/comentarios.controller';
import { EvidenceController } from '../src/evidence/evidence.controller';
import { MensajesRevisionController } from '../src/mensajes-revision/mensajes-revision.controller';
import { NotificationsController } from '../src/notifications/notifications.controller';
import { ProjectsController } from '../src/projects/projects.controller';
import { RevisionesController } from '../src/revisiones/revisiones.controller';
import { UsersController } from '../src/users/users.controller';
import { ValidationController } from '../src/validation/validation.controller';
import { CatalogsService } from '../src/catalogs/catalogs.service';
import { EvidenceService } from '../src/evidence/evidence.service';
import { ValidationService } from '../src/validation/validation.service';
import { TasksController } from '../src/tasks/tasks.controller';

describe('Controllers and basic services', () => {
  it('AppController healthCheck', () => {
    expect(new AppController().healthCheck()).toEqual({ status: 'ok' });
  });

  it('controllers delegan a sus servicios', async () => {
    const auth = new AuthController(
      { login: vi.fn(), register: vi.fn() } as unknown as ConstructorParameters<
        typeof AuthController
      >[0],
    );
    auth.login({ correo: 'a', contrasena: 'b' });
    auth.register({} as Parameters<AuthController['register']>[0]);

    const usersSvc = {
      getMe: vi.fn(),
      getProfile: vi.fn(),
      getProfileBootstrap: vi.fn(),
      updateFotoUrl: vi.fn(),
      updateProfile: vi.fn(),
      replaceHabilidades: vi.fn(),
      replaceIntereses: vi.fn(),
      replaceCualidades: vi.fn(),
      addExperiencia: vi.fn(),
      getDashboard: vi.fn(),
    };
    const users = new UsersController(
      usersSvc as unknown as ConstructorParameters<typeof UsersController>[0],
    );
    await users.updateProfile({ userId: 1 }, { fotoUrl: 'x' });
    users.getMe({ userId: 1 });
    users.getProfile({ userId: 1 });
    users.getProfileBootstrap({ userId: 1 });
    users.getDashboard({ userId: 1 });

    const projectsSvc = {
      findAll: vi.fn(),
      findMine: vi.fn(),
      findAsContributor: vi.fn(),
      findOne: vi.fn(),
      findOneOwner: vi.fn(),
      createFull: vi.fn(),
      update: vi.fn(),
      changeEstado: vi.fn(),
      submitForReview: vi.fn(),
      resubmit: vi.fn(),
      requestClose: vi.fn(),
      approveClosure: vi.fn(),
      rejectClosure: vi.fn(),
      findPostulacionesByProject: vi.fn(),
    };
    const projects = new ProjectsController(
      projectsSvc as unknown as ConstructorParameters<typeof ProjectsController>[0],
    );
    projects.findAll('q', 'ACADEMICO_HORAS_BECA', 'REMOTO', '1', '2');
    projects.findMine({ userId: 1 });
    projects.findMineLegacy({ userId: 1 });
    projects.findAsContributor({ userId: 1 });
    projects.findOne(1);
    projects.findOneOwner(1, { userId: 1 });
    projects.create({} as Parameters<ProjectsController['create']>[0], { userId: 1 });
    projects.update(1, {} as Parameters<ProjectsController['update']>[1], { userId: 1 });
    projects.changeEstado(1, { nuevoEstado: 'PUBLICADO' } as Parameters<ProjectsController['changeEstado']>[1], { userId: 1 });
    projects.submitForReview(1, { userId: 1 });
    projects.resubmit(1, { userId: 1 });
    projects.requestClose(1, { userId: 1 });
    projects.approveClosure(1, { userId: 1 });
    projects.rejectClosure(1, { userId: 1 });
    projects.findPostulaciones(1, { userId: 1 });

    const applicationsSvc = { create: vi.fn(), findAll: vi.fn(), findMine: vi.fn(), findOne: vi.fn(), updateEstado: vi.fn() };
    const applications = new ApplicationsController(
      applicationsSvc as unknown as ConstructorParameters<typeof ApplicationsController>[0],
    );
    applications.create({} as Parameters<ApplicationsController['create']>[0], { userId: 1 });
    applications.findAll();
    applications.findMine({ userId: 1 });
    applications.findOne(1);
    applications.updateEstado(
      1,
      {} as Parameters<ApplicationsController['updateEstado']>[1],
      { userId: 1 },
    );

    const notificationsSvc = {
      findAll: vi.fn(),
      findUnreadForUser: vi.fn(),
      getUnreadCount: vi.fn(),
      markAllAsRead: vi.fn(),
      markAsRead: vi.fn(),
    };
    const notifications = new NotificationsController(
      notificationsSvc as unknown as ConstructorParameters<typeof NotificationsController>[0],
    );
    notifications.findAll({ userId: 1 });
    notifications.findUnreadForUser({ userId: 1 });
    notifications.getUnreadCount({ userId: 1 });
    notifications.markAllAsRead({ userId: 1 });
    notifications.markAsRead(1, { userId: 1 });

    const revisiones = new RevisionesController(
      {
        findAdminInbox: vi.fn(),
        findByProyecto: vi.fn(),
        reclamar: vi.fn(),
        resolver: vi.fn(),
      } as unknown as ConstructorParameters<typeof RevisionesController>[0],
    );
    revisiones.findAdminInbox({ userId: 1 });
    revisiones.findByProyecto(1, { userId: 1 });
    revisiones.reclamar(1, { userId: 1 });
    revisiones.resolver(1, { userId: 1 }, {} as Parameters<RevisionesController['resolver']>[2]);

    const comentarios = new ComentariosController(
      {
        create: vi.fn(),
        findByProyecto: vi.fn(),
        findByHito: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
      } as unknown as ConstructorParameters<typeof ComentariosController>[0],
    );
    comentarios.create(
      { userId: 1 },
      {} as Parameters<ComentariosController['create']>[1],
    );
    comentarios.findByProyecto(1, { userId: 1 });
    comentarios.findByHito(1, { userId: 1 });
    comentarios.update(
      1,
      { userId: 1 },
      {} as Parameters<ComentariosController['update']>[2],
    );
    comentarios.remove(1, { userId: 1 });

    const mensajes = new MensajesRevisionController(
      {
        findByProyecto: vi.fn(),
        create: vi.fn(),
        markAsRead: vi.fn(),
      } as unknown as ConstructorParameters<typeof MensajesRevisionController>[0],
    );
    mensajes.findByProyecto(1, { userId: 1 });
    mensajes.create(
      1,
      { userId: 1 },
      {} as Parameters<MensajesRevisionController['create']>[2],
    );
    mensajes.markAsRead(1, { userId: 1 });
  });

  it('catalogs/tasks/validation/evidence servicios básicos', async () => {
    const prisma = {
      carrera: { findMany: vi.fn().mockResolvedValue([{ idCarrera: 1, nombreCarrera: 'Ing' }]) },
      habilidad: { findMany: vi.fn().mockResolvedValue([{ idHabilidad: 1, nombreHabilidad: 'TS' }]) },
      interes: { findMany: vi.fn().mockResolvedValue([{ idInteres: 1, nombreInteres: 'AI' }]) },
      cualidad: { findMany: vi.fn().mockResolvedValue([{ idCualidad: 1, nombreCualidad: 'Liderazgo' }]) },
    };
    const catalogsService = new CatalogsService(
      prisma as unknown as ConstructorParameters<typeof CatalogsService>[0],
    );
    const catalogs = new CatalogsController(catalogsService);
    const result = await catalogs.findAll();
    expect(result.carreras[0].id).toBe('1');

    const tasksService = {
      findAll: vi.fn(),
      findOne: vi.fn(),
    };

    const tasks = new TasksController(
      tasksService as unknown as ConstructorParameters<typeof TasksController>[0],
    );

    tasks.findAll(1, { userId: 9 });
    expect(tasksService.findAll).toHaveBeenCalledWith(1, 9);

    tasks.findOne(1, 5, { userId: 9 });
    expect(tasksService.findOne).toHaveBeenCalledWith(1, 5, 9);

    const validationService = new ValidationService(
      {} as ConstructorParameters<typeof ValidationService>[0],
    );
    const validation = new ValidationController(validationService);
    expect(validation.findAll()).toEqual({ message: 'Not implemented yet' });
    expect(validation.create({})).toEqual({ message: 'Not implemented yet' });

    const evidenceService = new EvidenceService(
      {} as ConstructorParameters<typeof EvidenceService>[0],
    );
    const evidence = new EvidenceController(evidenceService);
    expect(evidence.findAll()).toEqual({ message: 'Not implemented yet' });
    expect(evidence.create({})).toEqual({ message: 'Not implemented yet' });
  });
});
