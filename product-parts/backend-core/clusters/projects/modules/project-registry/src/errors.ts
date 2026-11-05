/** Error codes of the project registry; routes map them to HTTP statuses. */
export type ProjectErrorCode =
  | 'invalid-name'
  | 'invalid-path'
  | 'outside-home'
  | 'not-found'
  | 'not-directory'
  | 'access-denied'
  | 'exists'
  | 'registry-invalid'
  | 'busy';

/** HTTP status for each error code. */
export const PROJECT_ERROR_STATUS: Readonly<Record<ProjectErrorCode, number>> = {
  'invalid-name': 400,
  'invalid-path': 400,
  'outside-home': 400,
  'not-found': 404,
  'not-directory': 400,
  'access-denied': 403,
  exists: 409,
  'registry-invalid': 409,
  busy: 409,
};

/** A user-facing failure of a registry or folder action; the message is shown in the panel. */
export class ProjectError extends Error {
  readonly code: ProjectErrorCode;
  /** Extra fields for the panel, e.g. { hint } or { blockers }. */
  readonly details: Record<string, unknown> | undefined;

  constructor(code: ProjectErrorCode, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ProjectError';
    this.code = code;
    this.details = details;
  }
}

/** Hint for a permission error; on macOS it explains the TCC privacy protection (spec R4). */
export function accessHint(platform: NodeJS.Platform): string {
  if (platform === 'darwin') {
    return (
      'macOS закрывает службе доступ к этой папке (защита конфиденциальности TCC: Документы, ' +
      'Рабочий стол, Загрузки, внешние и сетевые диски). Откройте «Системные настройки → ' +
      'Конфиденциальность и безопасность → Файлы и папки» (или «Полный доступ к диску»), ' +
      'разрешите доступ для node или Workflow Kit и повторите. Можно выбрать папку вне защищённых мест.'
    );
  }
  return 'Нет прав на чтение этой папки. Проверьте права доступа или выберите другую папку.';
}

/** Converts a file system error for a path into a ProjectError; unknown errors are rethrown as is. */
export function fsError(error: unknown, target: string, platform: NodeJS.Platform): Error {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  if (code === 'ENOENT' || code === 'ENOTDIR') return new ProjectError('not-found', `Папка не найдена: ${target}`);
  if (code === 'EACCES' || code === 'EPERM') {
    return new ProjectError('access-denied', `Нет доступа к папке: ${target}`, { hint: accessHint(platform) });
  }
  if (code === 'ELOOP') return new ProjectError('invalid-path', `Слишком много символических ссылок: ${target}`);
  return error instanceof Error ? error : new Error(String(error));
}
