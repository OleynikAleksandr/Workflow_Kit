# M27: одноразовый наблюдательный стенд T001

Дата 13.11.2026, macOS. Это сохранённый исходник собственного исследовательского
стенда, не production API и не поставляемый host. Он создаёт изолированный Kit
с настоящими hooks через public createApp/createClaudeProvider, source-обёртка
подключает неизменённый session.exp и наблюдает его PTY в памяти TerminalScreen.
Тестовые клавиши ограничены перечислением; trust/defaults/очереди рабочих
проектов не используются. Единственный изменённый statusline — локальный
statusline собственной временной папки; глобальный не менялся.

Код сохранён для аудита, его нельзя автоматически запускать повторно: два
хода бюджета T001 исчерпаны, native меню получены в продолжении после AX-разрешения. Пути и
checkpoint относятся к удалённому одноразовому стенду. Для нового запуска
нужны восстановленные предусловия и согласованный бюджет, не слепой copy/paste.
macOS/Linux использует expect; Windows этим стендом не проверен. Production
ConPTY/expect не менялись, требование будущих injected/CI/live проверок сохранено.

```javascript
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { createApp } from '/Users/oleksandroliinyk/VSCODE/Workflow_Kit/product-parts/backend-core/clusters/runtime/modules/cli/src/index.ts';
import { createClaudeProvider, PTY_SCRIPTS } from '/Users/oleksandroliinyk/VSCODE/Workflow_Kit/product-parts/provider-runtime/clusters/provider-adapters/modules/provider-claude/src/index.ts';
import { installStructure } from '/Users/oleksandroliinyk/VSCODE/Workflow_Kit/product-parts/backend-core/clusters/projects/modules/kit-structure/src/index.ts';
const base = process.env.M27_PROBE_BASE ?? await mkdtemp(path.join(os.homedir(), 'WorkflowKitProjects', 'M27_native_probe_'));
const projectPath = path.join(base, 'project');
await mkdir(projectPath,{recursive:true});
const scratch = path.join(base, 'observer'); await mkdir(scratch,{recursive:true});
const observer = path.join(scratch, 'screen.mjs');
await writeFile(observer, `import {createInterface} from 'node:readline';\nimport {writeFileSync} from 'node:fs';\nimport {TerminalScreen} from '/Users/oleksandroliinyk/VSCODE/Workflow_Kit/product-parts/provider-runtime/clusters/provider-contract/modules/pty-host/src/index.ts';\nconst screen=new TerminalScreen(); const controls=new Set();\nfor await(const line of createInterface({input:process.stdin})){if(line.startsWith('DATA ')){const chunk=Buffer.from(line.slice(5),'hex').toString('utf8');for(const token of chunk.matchAll(/\\x1b\\[([0-?]*)([ -/]*)([@-~])/g))controls.add(token[1]+token[2]+token[3]);screen.feed(chunk.replace(/\\x1b\\(B/g,'').replace(/\\x1b\\[(?:r|>0q|\\?u|c|<u)/g,'')); writeFileSync(${JSON.stringify(path.join(scratch,'frame.json'))}, JSON.stringify({controls:[...controls],valid:screen.valid,revision:screen.revision,text:screen.text(),at:new Date().toISOString()}));}}\n`);
const wrapper = path.join(scratch, 'session.exp');
await writeFile(wrapper, `# M27 disposable observation harness. Sources the unchanged production host.\nset m27_pipe [open [list | ${process.execPath} ${observer}] w]\nfconfigure $m27_pipe -encoding utf-8 -buffering line\nset m27_keys ${path.join(scratch,'key')}\nrename source m27_source\nproc source {args} {\n  set result [uplevel 1 [list m27_source {*}$args]]\n  if {[file tail [lindex $args end]] eq "interrupt.tcl"} {\n    rename interrupt_data m27_interrupt_data\n    proc interrupt_data {data} {\n      global m27_pipe\n      m27_interrupt_data $data\n      binary scan [encoding convertto utf-8 $data] H* encoded\n      catch {puts $m27_pipe "DATA $encoded"; flush $m27_pipe}\n    }\n    rename interrupt_tick m27_interrupt_tick\n    proc interrupt_tick {} {\n      global m27_keys spawn_id\n      m27_interrupt_tick\n      if {[file exists $m27_keys]} {\n        set f [open $m27_keys r]; set k [string trim [read $f]]; close $f; file delete $m27_keys\n        switch -- $k {\n          s {send -- "s"}\n          esc {send -- "\\033"}\n          left {send -- "\\033\\[D"}\n          right {send -- "\\033\\[C"}\n          up {send -- "\\033\\[A"}\n          down {send -- "\\033\\[B"}\n          tab {send -- "\\t"}\n          enter {send -- "\\r"}\n          shift-tab {send -- "\\033\\[Z"}\n        }\n      }\n    }\n  }\n  return $result\n}\nsource ${PTY_SCRIPTS.session}\n`);
let provider;
const env = {...process.env, WFK_DATA_DIR:path.join(base,'service'), WFK_PORT:process.env.M27_PROBE_PORT??'0'};
const app = await createApp({env,providers:[ctx => (provider=createClaudeProvider(ctx,{scripts:{...PTY_SCRIPTS,session:wrapper}}))],log:()=>{}});
const checkpoint=JSON.parse(await readFile('/tmp/m27-probe-checkpoint.json','utf8').catch(()=> '{}')); const hookObservations=checkpoint.hooks??[]; const match=app.router.match.bind(app.router);
app.router.match=(method,url)=>{ const found=match(method,url); if(found.kind!=='found'||!url.startsWith('/api/hooks/')) return found;
return {...found,handler:async ctx=>{ const input=ctx.body?.input; const observation={at:new Date().toISOString(),event:url,sessionId:input?.session_id??ctx.body?.sessionId??null,command:typeof input?.prompt==='string'&&input.prompt.startsWith('/')?input.prompt:null};hookObservations.push(observation); const end=ctx.res.end;ctx.res.end=function(chunk,...args){observation.sentinelMentions=typeof chunk==='string'?(chunk.match(/M27_SENTINEL_CONTROL/g)??[]).length:0;return end.call(this,chunk,...args);};return await found.handler(ctx); }}; };
const opened=await app.projects.open(projectPath); const project=opened.project;
const kit=app.kit.installed(projectPath)?{ok:true}:await app.kit.install(projectPath,{name:'M27 native probe'}); if(!kit.ok) throw new Error(JSON.stringify(kit));
const structure=await installStructure(projectPath);
if(!(await readFile(path.join(projectPath,'.claude','settings.local.json'),'utf8').catch(()=>null))) await writeFile(path.join(projectPath,'.claude','settings.local.json'), JSON.stringify({model:'sonnet',fastMode:false,effortLevel:'medium',ultracode:false}));
await provider.refresh();
const preview=await provider.previewTrust(project);
const trust=await provider.grantTrust(project,preview.token,{});
const defaultsFile=path.join(os.homedir(),'.claude','settings.json');
const defaultsHash=async()=>{try{return createHash('sha256').update(await readFile(defaultsFile)).digest('hex');}catch{return null;}};
const baselineHash=await defaultsHash();
let session=(await provider.listSessions(project)).find(s=>s.state==='running')??null; const commands=checkpoint.commands??[];
const json=(value)=>({kind:'json',status:200,body:value});
app.router.get('/api/m27/probe',async()=>{let frame=null;try{frame=JSON.parse(await readFile(path.join(scratch,'frame.json'),'utf8'));}catch{}return json({base,project,session,frame,hooks:hookObservations,commands,defaultsUnchanged:(await defaultsHash())===baselineHash,parameters:session?await provider.readParameters(project,session.localId):null,channel:app.channel.section(),autopilot:app.autopilot.section(),processes:(await app.supervisor.list()).map(({id,pid,children,owner})=>({id,pid,children:children.map(c=>({pid:c.pid})),owner}))});});
app.router.post('/api/m27/launch',async()=>{if(session)throw new Error('Already launched');session=await provider.createSession(project,{title:'M27 native controls probe'});return json({session});});
app.router.post('/api/m27/sentinel',async()=>{session=(await provider.listSessions(project)).find(s=>s.remoteId===session.remoteId)??session;return json({message:app.channel.enqueue('claude:'+session.localId,'M27_SENTINEL_CONTROL: ответь только OK, без инструментов.','m27-probe',project.id),activity:app.channel.get('claude:'+session.localId)});});
const nativeCommands=new Set(['/model','/effort','/effort status','/effort ultracode','/effort ultracode off','/fast']);
app.router.post('/api/m27/command',async ctx=>{const command=ctx.body?.command;if(!nativeCommands.has(command)||!session)throw new Error('Invalid native command');commands.push({at:new Date().toISOString(),command});return json({taken:await provider.sendDirect(project,session.localId,command)});});
const keys=new Set(['s','esc','left','right','up','down','tab','enter','shift-tab']);
app.router.post('/api/m27/key',async ctx=>{const key=ctx.body?.key;if(!keys.has(key)||!session)throw new Error('Invalid key');commands.push({at:new Date().toISOString(),key});await writeFile(path.join(scratch,'key'),key,{flag:'wx'});return json({queued:true});});
app.router.post('/api/m27/cleanup',async()=>{if(session)app.channel.forget('claude:'+session.localId);if(session){await provider.archiveSessions(project,null);await provider.stopSession(project,session.localId);}const deleted=await provider.deleteSessions(project);return json({deleted,trust:await provider.trust(project),processes:await app.supervisor.list(),defaultsUnchanged:(await defaultsHash())===baselineHash});});
const started=await app.start(); env.WFK_PORT=String(started.port);
await writeFile('/tmp/m27-probe-address.json',JSON.stringify({base,port:started.port,projectId:project.id}));
console.log(JSON.stringify({ready:true,port:started.port,base,kit:kit.ok,structure:structure.written,trust:trust.trusted,defaultsHash:baselineHash}));
process.on('SIGTERM',async()=>{await app.stop();process.exit(0);});
```
