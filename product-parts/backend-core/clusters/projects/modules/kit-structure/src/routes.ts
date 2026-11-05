// HTTP routes of the Kit structure: GET|POST /api/projects/:id/structure and the "structure"
// section of /api/state (a report per registered project).
import { stat } from 'node:fs/promises';
import { createKeyedMutex } from '#data-store';
import type { EventLog, KeyedMutex } from '#data-store';
import { HttpError } from '#http-server';
import type { Router, StateRegistry } from '#http-server';
import { accessHint } from '#project-registry';
import type { Project, ProjectRegistry } from '#project-registry';
import { StructureError, checkStructure, installStructure } from './structure.ts';
import type { StructureReport } from './structure.ts';

/** Dependencies of the structure routes. */
export interface StructureRoutesOptions {
  router: Router;
  state: StateRegistry;
  projects: ProjectRegistry;
  platform: NodeJS.Platform;
  mutex?: KeyedMutex;
  events?: EventLog;
}

/** A report of one project in the "structure" section, or why it could not be checked. */
export type StructureEntry = StructureReport | { error: string; code: string };

/** The "structure" section of /api/state: entries by project id. */
export interface StructureSection {
  projects: Record<string, StructureEntry>;
}

function projectInfo(project: Project): { id: string; name: string; path: string } {
  return { id: project.id, name: project.name, path: project.path };
}

/** Converts a missing or unreadable project folder into an HTTP error; returns quietly for a folder. */
async function requireFolder(project: Project, platform: NodeJS.Platform): Promise<void> {
  try {
    if ((await stat(project.path)).isDirectory()) return;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EACCES' || code === 'EPERM') {
      throw new HttpError(403, 'access-denied', `Нет доступа к папке проекта: ${project.path}`, { hint: accessHint(platform) });
    }
  }
  throw new HttpError(409, 'project-missing', `Папка проекта не найдена: ${project.path}`);
}

async function findProject(projects: ProjectRegistry, id: string, platform: NodeJS.Platform): Promise<Project> {
  const project = await projects.get(id);
  if (!project) throw new HttpError(404, 'not-found', `Проект не найден: ${id}`);
  await requireFolder(project, platform);
  return project;
}

function parseForce(body: unknown): boolean {
  if (body === undefined || body === null) return false;
  if (typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid-body', 'Ожидается JSON-объект');
  const force = (body as Record<string, unknown>)['force'];
  if (force === undefined) return false;
  if (typeof force !== 'boolean') throw new HttpError(400, 'invalid-body', 'Поле force должно быть true или false');
  return force;
}

const REFUSALS: Readonly<Record<StructureError['code'], string>> = {
  'invalid-json': 'Файл не является корректным JSON',
  'bad-markers': 'Маркеры раздела Kit повреждены',
  'bad-shape': 'У файла неожиданная структура',
};

/** Registers the structure routes and the "structure" state section. */
export function registerStructureRoutes(options: StructureRoutesOptions): void {
  const { router, state, projects, platform, events } = options;
  const mutex = options.mutex ?? createKeyedMutex();

  router.get('/api/projects/:id/structure', async (ctx) => {
    const project = await findProject(projects, ctx.params['id'] ?? '', platform);
    return { project: projectInfo(project), structure: await checkStructure(project.path) };
  });

  router.post('/api/projects/:id/structure', async (ctx) => {
    const force = parseForce(ctx.body);
    const project = await findProject(projects, ctx.params['id'] ?? '', platform);
    return mutex.run(`project:${project.id}`, async () => {
      try {
        const result = await installStructure(project.path, { force });
        if (result.written.length > 0) {
          await events
            ?.append('structure.installed', { ...projectInfo(project), written: result.written, force })
            .catch(() => undefined);
        }
        return { project: projectInfo(project), ...result };
      } catch (error) {
        if (error instanceof StructureError) {
          throw new HttpError(409, error.code, `${REFUSALS[error.code]}, установка отменена, файлы не изменены: ${error.message}`, {
            files: error.files,
          });
        }
        throw error;
      }
    });
  });

  state.add('structure', async (): Promise<StructureSection> => {
    const section: StructureSection = { projects: {} };
    for (const project of await projects.list()) {
      try {
        await requireFolder(project, platform);
        section.projects[project.id] = await checkStructure(project.path);
      } catch (error) {
        const code = error instanceof HttpError ? error.code : 'internal';
        section.projects[project.id] = { code, error: error instanceof Error ? error.message : String(error) };
      }
    }
    return section;
  });
}
