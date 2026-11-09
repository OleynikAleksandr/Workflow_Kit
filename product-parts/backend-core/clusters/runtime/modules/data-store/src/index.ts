// Public interface of the data-store module; other modules import only from here (#data-store).
export type { DataDirs, DataPlatform, ResolveDirsInput } from './paths.ts';
export { dataPlatform, ensureDataDirs, listDataDirs, resolveDataDirs } from './paths.ts';
export type { WriteJsonOptions } from './atomic.ts';
export { InvalidJsonFileError, readJsonFile, renameRetrying, writeFileAtomic, writeJsonAtomic } from './atomic.ts';
export type { RenameDeps } from './atomic.ts';
export type { LoadConfigInput, WfkConfig } from './config.ts';
export { ConfigError, DEFAULT_PORT, configFile, loadConfig, parsePort } from './config.ts';
export type { EventLog, EventLogOptions, EventRecord } from './events.ts';
export { EVENTS_MAX_BYTES, createEventLog, eventsFile, rotatedEventsFile } from './events.ts';
export type { KeyedMutex } from './mutex.ts';
export { createKeyedMutex } from './mutex.ts';
export type {
  Operation,
  OperationError,
  OperationHandle,
  OperationSpec,
  OperationStatus,
  Operations,
  OperationsOptions,
  OperationsSection,
  StartedOperation,
} from './operations.ts';
export { createOperations, toOperationError } from './operations.ts';
export type { BackupOptions } from './backup.ts';
export { BACKUPS_KEPT, backupDirFor, backupFile } from './backup.ts';
