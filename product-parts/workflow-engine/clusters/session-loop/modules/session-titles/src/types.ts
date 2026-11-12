// Types and constants of session-titles: the name of a session, its archive flags, the options
// and the interface of createSessionTitles, the refused title change.
export const SESSIONS_DIR = '.workflow-kit/local/sessions';
export const DEFAULT_NAME = 'Новая сессия';
export const MAX_TITLE_LENGTH = 80;
/** Note of a promptTitle session whose name waits for the end of the turn or the next prompt hook. */
export const NEXT_TURN_NOTE = 'Имя уйдёт в приложение, когда агент закончит ход или со следующим сообщением';
/** How `wfk session title|plan` names the session itself. */
export const SESSION_FLAGS_HINT = 'повторите команду с --client <id> --session <id>';

export type TitleSource = 'manual' | 'agent' | 'scope' | 'provider' | 'default';

export interface SessionTitle {
  name: string;
  source: TitleSource;
  manual: string | null;
  topic: string | null;
  /** True when the provider app shows the same name; false when it is only in Workflow Kit. */
  synced: boolean | null;
  note: string | null;
  /** When the session was put into the archive (hidden in the tree); null when it is not. */
  archivedAt: string | null;
  /** When the session was removed from Workflow Kit's lists for good (the chat stays in the app). */
  forgottenAt: string | null;
}

/** A refused title change. */
export class TitleError extends Error {
  readonly code: 'bad-title' | 'bad-session' | 'project-not-found' | 'session-ambiguous' | 'already-set' | 'service-turn';
  readonly status: number;
  /** Extra fields of the HTTP error, e.g. { candidates } of session-ambiguous. */
  readonly details: Record<string, unknown> | undefined;
  constructor(code: TitleError['code'], message: string, status: number, details?: Record<string, unknown>) {
    super(message);
    this.name = 'TitleError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

/** A session `wfk session title|plan` may have meant (session-ambiguous). */
export interface SessionCandidate {
  client: string;
  session: string;
  state: string;
  name: string;
}

/** A session the titles module can see in the channel. */
export interface ActiveSession {
  key: string;
  projectId: string | null;
  state: string;
}

export interface SessionTitlesOptions {
  listProjects: () => Promise<Array<{ id: string; path: string }>>;
  /** Project of a folder (cwd or $CLAUDE_PROJECT_DIR of `wfk session title`). */
  resolveProject: (folder: string) => Promise<{ id: string } | undefined>;
  /** Sessions of the agent channel with their activity. */
  sessions: () => ActiveSession[];
  /** Plan objective and owner session id of a project, when a scope is active. */
  scope: (projectId: string) => { objective: string; ownerSession: string | null } | null;
  /**
   * Keys of the sessions the providers list for a project. When several turns run in the
   * project, the topic goes to the one that is a listed session (hidden helper threads of the
   * apps also send hooks but are never listed).
   */
  listed?: (projectId: string) => Promise<ReadonlySet<string>>;
  /**
   * Keys of the sessions the providers list for a project with state running (a Kimi turn is
   * seen by its session lock even when no hook reached the service, spec M9 2.3).
   */
  listedRunning?: (projectId: string) => Promise<ReadonlySet<string>>;
  /**
   * The provider's app takes a name from the prompt hook answer, and a rename is safe only
   * outside a turn (Provider.promptTitle). Default: no provider does.
   */
  promptTitle?: (client: string) => boolean;
  /** Gives the name to the provider app; resolves { synced, note }. */
  rename?: (projectId: string, key: string, name: string) => Promise<{ synced: boolean; note?: string }>;
  /**
   * Called after a session went into the archive or came back (the service stops it or brings it
   * back); a failure is logged and does not undo the archive state.
   */
  archived?: (projectId: string, key: string, archived: boolean) => Promise<void>;
  /**
   * Called once the session is saved as archived or removed from the list: it left the Kit
   * process (spec M22 2.8) and the service drops it from the channel and the review at once.
   */
  onExcluded?: (projectId: string, key: string) => void;
  now?: () => Date;
  log?: (line: string) => void;
}

export interface SessionTitles {
  load(): Promise<void>;
  /** Manual name from the panel; an empty name removes it. */
  setManual(projectId: string, key: string, name: string): Promise<SessionTitle>;
  /** Puts the session into the archive or returns it; options.archived acts on the provider session. */
  setArchived(projectId: string, key: string, archived: boolean): Promise<SessionTitle>;
  /** Removes the session from every list of Workflow Kit for good (the chat stays in the app). */
  setForgotten(projectId: string, key: string): Promise<SessionTitle>;
  /**
   * `wfk session title`: the topic of the calling session (`session`: from the provider's
   * environment variable or --client/--session), else of the only session whose turn is running
   * in the folder's project (session-ambiguous with the candidates otherwise).
   */
  setTopic(folder: string, title: string, session?: { client: string; id: string } | null): Promise<{ projectId: string; key: string; title: SessionTitle }>;
  /**
   * Key of the only session of the project with a running turn (by the channel; never guessed by
   * time). None or several → TitleError session-ambiguous (409) with details.candidates.
   */
  running(projectId: string): Promise<string>;
  /** Name of a session (providerTitle: the provider's own name, if any). */
  name(projectId: string, key: string, providerTitle?: string | null): SessionTitle;
  /**
   * True for a session that left the Kit process: in the archive or removed from the list. A
   * session returned from the archive takes part again; a removed one never does.
   */
  excluded(projectId: string, key: string): boolean;
  /** A turn of the session started: retries a provider rename that had to wait. */
  onTurn(key: string): void;
  /** The turn of the session ended (no turn, no dialog): retries a waiting rename; resolves after it. */
  onStop(key: string): Promise<void>;
  /**
   * A turn started with the panel's service greeting (`service`: true) or with anything else:
   * no topic is taken during a service turn, it is not the user's task yet.
   */
  setServiceTurn(key: string, service: boolean): void;
  /**
   * Prompt hook of a promptTitle session: the Workflow Kit name to give the app (once per name and
   * service run) when it differs from `current`, the app's title; null otherwise. A matching
   * title marks the name synced.
   */
  appTitle(key: string, current: string | null): Promise<string | null>;
  section(): { projects: Record<string, Record<string, SessionTitle>> };
}
