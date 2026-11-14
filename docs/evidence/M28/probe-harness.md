# M28: одноразовый наблюдательный стенд T001

Дата 14.11.2026, macOS. Сохранённый исходник собственного стенда, не production API.
Он создаёт изолированный Kit через public createApp/createClaudeProvider; обёртка
подключает неизменённый `session.exp` и пишет историю кадров `TerminalScreen`. Клавиши
ограничены (`esc`, `enter`, `up`, `down`). Повторный запуск — только с согласованным
бюджетом ходов. `<repo>` — корень репозитория.

```javascript
// M28 disposable observation harness (T001). Sources the unchanged production session.exp,
// records terminal frames and hook traffic of an isolated Kit; never touches working projects.
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
const REPO = '<repo>';
const { createApp } = await import(`${REPO}/product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts`);
const { createClaudeProvider, PTY_SCRIPTS } = await import(`${REPO}/product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts`);
const { installStructure } = await import(`${REPO}/product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts`);
await mkdir(path.join(os.homedir(), 'WorkflowKitProjects'), { recursive: true });
const base = await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M28_probe_'));
const projectPath = path.join(base, 'project');
const scratch = path.join(base, 'observer');
await mkdir(projectPath, { recursive: true }); await mkdir(scratch, { recursive: true });
const framesFile = path.join(scratch, 'frames.jsonl');
const observer = path.join(scratch, 'screen.mjs');
await writeFile(observer, `import {createInterface} from 'node:readline';
import {appendFileSync, writeFileSync} from 'node:fs';
import {TerminalScreen} from '${REPO}/product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts';
const screen = new TerminalScreen(); let last = ''; let count = 0; let lastAt = 0; let pending = null;
const flush = () => { pending = null; const text = screen.text(); if (text === last || count >= 4000) return; last = text; count++; lastAt = Date.now();
  appendFileSync(${JSON.stringify(framesFile)}, JSON.stringify({ at: new Date().toISOString(), valid: screen.valid, text }) + '\\n'); };
for await (const line of createInterface({ input: process.stdin })) {
  if (!line.startsWith('DATA ')) continue;
  const chunk = Buffer.from(line.slice(5), 'hex').toString('utf8');
  screen.feed(chunk);
  if (Date.now() - lastAt >= 150) flush(); else if (!pending) pending = setTimeout(flush, 160);
}
`);
const wrapper = path.join(scratch, 'session.exp');
await writeFile(wrapper, `# M28 disposable observation harness. Sources the unchanged production host.
set m28_pipe [open [list | ${process.execPath} ${observer}] w]
fconfigure $m28_pipe -encoding utf-8 -buffering line
set m28_keys ${path.join(scratch, 'key')}
rename source m28_source
proc source {args} {
  set result [uplevel 1 [list m28_source {*}$args]]
  if {[file tail [lindex $args end]] eq "interrupt.tcl"} {
    rename interrupt_data m28_interrupt_data
    proc interrupt_data {data} {
      global m28_pipe
      m28_interrupt_data $data
      binary scan [encoding convertto utf-8 $data] H* encoded
      catch {puts $m28_pipe "DATA $encoded"; flush $m28_pipe}
    }
    rename interrupt_tick m28_interrupt_tick
    proc interrupt_tick {} {
      global m28_keys spawn_id
      m28_interrupt_tick
      if {[file exists $m28_keys]} {
        set f [open $m28_keys r]; set k [string trim [read $f]]; close $f; file delete $m28_keys
        switch -- $k {
          esc {send -- "\\033"}
          enter {send -- "\\r"}
          down {send -- "\\033\\[B"}
          up {send -- "\\033\\[A"}
        }
      }
    }
  }
  return $result
}
source ${PTY_SCRIPTS.session}
`);
let provider;
const env = { ...process.env, WFK_DATA_DIR: path.join(base, 'service'), WFK_PORT: '0' };
const app = await createApp({ env, providers: [ctx => (provider = createClaudeProvider(ctx, { scripts: { ...PTY_SCRIPTS, session: wrapper } }))], log: () => {} });
const hooks = []; const match = app.router.match.bind(app.router);
app.router.match = (method, url) => {
  const found = match(method, url);
  if (found.kind !== 'found' || !url.startsWith('/api/hooks/')) return found;
  return { ...found, handler: async ctx => {
    const input = ctx.body?.input;
    const o = { at: new Date().toISOString(), event: url, sessionId: input?.session_id ?? null, hookEvent: input?.hook_event_name ?? null, prompt: typeof input?.prompt === 'string' ? input.prompt.slice(0, 120) : null };
    hooks.push(o);
    const end = ctx.res.end;
    ctx.res.end = function (chunk, ...args) { o.reply = typeof chunk === 'string' ? chunk.slice(0, 300) : null; o.repliedAt = new Date().toISOString(); return end.call(this, chunk, ...args); };
    return await found.handler(ctx);
  } };
};
const opened = await app.projects.open(projectPath); const project = opened.project;
const kit = await app.kit.install(projectPath, { name: 'M28 probe' }); if (!kit.ok) throw new Error(JSON.stringify(kit));
await installStructure(projectPath);
await writeFile(path.join(projectPath, '.claude', 'settings.local.json'), JSON.stringify({ model: 'haiku', effortLevel: 'low', fastMode: false, permissions: { defaultMode: 'default' } }));
await provider.refresh();
const preview = await provider.previewTrust(project);
const trust = await provider.grantTrust(project, preview.token, {});
const defaultsFile = path.join(os.homedir(), '.claude', 'settings.json');
const hash = async () => { try { return createHash('sha256').update(await readFile(defaultsFile)).digest('hex'); } catch { return null; } };
const baselineHash = await hash();
let session = null; const actions = []; const paramResults = [];
const json = value => ({ kind: 'json', status: 200, body: value });
const stateFiles = async () => {
  const dir = path.join(base, 'service', 'logs', 'claude'); const out = {};
  for (const name of await readdir(dir).catch(() => [])) if (/\.(interrupt-state|parameters-state)$/.test(name)) out[name.split('.').pop()] = JSON.parse(await readFile(path.join(dir, name), 'utf8').catch(() => 'null'));
  return out;
};
app.router.get('/api/m28/probe', async () => {
  const key = session ? `claude:${session.localId}` : null;
  return json({ base, session, hooks, actions, paramResults, states: await stateFiles(), activity: key ? app.channel.get(key) : null,
    defaultsUnchanged: (await hash()) === baselineHash, parameters: session ? await provider.readParameters(project, session.localId).catch(e => String(e)) : null });
});
app.router.post('/api/m28/launch', async () => { if (session) throw new Error('Already launched'); session = await provider.createSession(project, { title: 'M28 probe' }); return json({ session }); });
app.router.post('/api/m28/refresh', async () => { const list = await provider.listSessions(project); session = list.find(s => s.localId === session?.localId || s.state === 'running') ?? session; return json({ session, list }); });
app.router.post('/api/m28/send', async ctx => { const text = String(ctx.body?.text ?? ''); actions.push({ at: new Date().toISOString(), send: text }); return json({ taken: await provider.sendDirect(project, session.localId, text) }); });
app.router.post('/api/m28/enqueue', async ctx => { const text = String(ctx.body?.text ?? ''); actions.push({ at: new Date().toISOString(), enqueue: text }); return json({ message: app.channel.enqueue(`claude:${session.localId}`, text, 'm28-probe', project.id), activity: app.channel.get(`claude:${session.localId}`) }); });
const KEYS = new Set(['esc', 'enter', 'down', 'up']);
app.router.post('/api/m28/key', async ctx => { const k = ctx.body?.key; if (!KEYS.has(k)) throw new Error('bad key'); actions.push({ at: new Date().toISOString(), key: k }); await writeFile(path.join(scratch, 'key'), k, { flag: 'wx' }); return json({ queued: true }); });
app.router.post('/api/m28/param', async ctx => { const change = ctx.body?.change ?? {}; const at = new Date().toISOString(); actions.push({ at, param: change });
  provider.updateParameters(project, session.localId, change).then(r => paramResults.push({ at, done: new Date().toISOString(), ok: true, items: (r.items ?? []).map(i => `${i.id}=${i.value}`) }), e => paramResults.push({ at, done: new Date().toISOString(), ok: false, error: String(e?.message ?? e), code: e?.code ?? null }));
  return json({ started: true }); });
app.router.post('/api/m28/cleanup', async () => {
  if (session) { app.channel.forget(`claude:${session.localId}`); await provider.archiveSessions(project, null).catch(e => String(e)); await provider.stopSession(project, session.localId).catch(e => String(e)); }
  const deleted = await provider.deleteSessions(project).catch(e => String(e));
  return json({ deleted, trust: await provider.trust(project), processes: await app.supervisor.list(), defaultsUnchanged: (await hash()) === baselineHash });
});
const started = await app.start(); env.WFK_PORT = String(started.port);
await writeFile(path.join(os.tmpdir(), 'm28-probe-address.json'), JSON.stringify({ base, port: started.port, projectId: project.id }));
console.log(JSON.stringify({ ready: true, port: started.port, base, kit: kit.ok, trust: trust.trusted, defaultsHash: baselineHash }));
process.on('SIGTERM', async () => { await app.stop(); process.exit(0); });
```
