// Public interface of the http-server module; other modules import only from here (#http-server).
export type { AddressKind, InterfaceMap } from './address.ts';
export { classifyAddress, isTrustedAddress, normalizeAddress, tailscaleAddresses } from './address.ts';
export type { AccessContext, AccessDecision, AccessRequest, ParsedHost } from './access.ts';
export { MUTATING_METHODS, allowedHostnames, checkAccess, parseHostHeader } from './access.ts';
export type { JsonResult, RouteContext, RouteHandler, RouteMatch, Router } from './router.ts';
export { HttpError, createRouter, jsonResult } from './router.ts';
export type { StateRegistry, StateSectionProvider } from './state.ts';
export { createStateRegistry, registerCoreRoutes } from './state.ts';
export type { StaticFile, StaticMount } from './static.ts';
export { STATIC_TYPES, findStaticFile } from './static.ts';
export type { HttpServerHandle, HttpServerOptions } from './server.ts';
export { createHttpServer, sendError, sendJson } from './server.ts';
