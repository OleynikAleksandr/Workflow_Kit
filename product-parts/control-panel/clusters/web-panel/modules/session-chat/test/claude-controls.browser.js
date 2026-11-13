// Owned source server :48762; production composer and I/O-only fixture, no native inference.
async (root, config = {}) => {
  const context=await root.context().browser().newContext({viewport:{width:config.width??1542,height:config.height??1049},deviceScaleFactor:2,hasTouch:config.touch??false,isMobile:config.touch??false});const page=await context.newPage();
  const errors=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const check=(v,name)=>{if(!v)throw Error(name);checks.push(name);};
  try {
    await page.route('**/m27-controls-test',route=>route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; base-uri 'none'; form-action 'self'"},body:'<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body></body></html>'}));
    await page.goto('http://127.0.0.1:48762/m27-controls-test');
    await page.evaluate(async()=>{
      const {h}=await import('/dom.js');const {createComposer}=await import('/session-chat/composer.js');
      const modelNames=['Opus 5.5','Fable 5.2','Sonnet 5.5','Haiku 5.5','Fable 5.1','Haiku 4.5','Sonnet 5','Opus 5','Fable 5','Opus 4.8','Opus 4.7','Opus 4.6','Sonnet 4.6'];
      const item=(id,value,label,options,inRow=true)=>({id,value,label,options,inRow,tone:id==='effort'?'muted':'primary',title:`${id}: ${label}`});
      const state=window.fixture={posts:[],reads:0,fail:false,delay:0,parameters:{editable:true,style:{font:'"Anthropic Sans", system-ui, sans-serif',ring:'last',accent:'#4c8dff'},presentation:{layout:'claude-controls'},items:[
        item('model','claude-sonnet-5-5','Sonnet 5.5',modelNames.map((label,i)=>({value:`native:${encodeURIComponent(label)}`,label,group:i<4?'primary':'more',selected:label==='Sonnet 5.5'}))),
        item('effort','medium','Medium',['Low','Medium','High','Extra','Max'].map((label,i)=>({label,value:['low','medium','high','xhigh','max'][i],recommended:i===1}))),
        item('ultracode','off','Ultracode',[{value:'on',label:'On'},{value:'off',label:'Off'}],false),
        item('mode','auto','Auto',[['auto','Auto','Claude handles permission decisions'],['default','Manual','Always ask before making changes'],['acceptEdits','Accept edits','Automatically accept all file edits'],['plan','Plan','Create a plan before making changes']].map(([value,label,description])=>({value,label,description})),false),
        item('speed','standard','Standard',[{value:'fast',label:'Fast',disabled:true,reason:'Fast mode requires usage credits'}],false),
      ],context:{usedTokens:4000,windowTokens:1000000,usedPercent:4},limits:[],at:new Date().toISOString()}};
      const shell={dom:{h},api:async(method,url,body)=>{
        if(method==='GET'){state.reads++;return{supported:true,parameters:structuredClone(state.parameters)};}
        state.posts.push(body);if(state.delay)await new Promise(r=>setTimeout(r,state.delay));if(state.fail)throw Error('Claude не подтвердил изменение');
        for(const[id,value]of Object.entries(body.change)){const item=state.parameters.items.find(i=>i.id===id);if(item){const choice=item.options.find(o=>o.value===value);item.value=id==='model'?`effective:${value}`:value;item.label=id==='ultracode'?'Ultracode':choice?.label??value;for(const o of item.options)o.selected=o.value===value;if(id==='ultracode')item.inRow=value==='on';}}
        return{parameters:structuredClone(state.parameters)};
      }};
      const view=createComposer({shell,projectId:'m27',key:'claude:fixture',provider:'claude',onSent(){}});const card=h('section',{class:'sc-card'},[view.node]);document.body.append(card);
      card.style.width='min(768px, calc(100vw - 32px))';card.style.position='absolute';card.style.right='max(16px, calc(50% - 418px))';card.style.bottom='10px';document.body.style.background='#1a1a1a';
      view.setVisible(true);state.view=view;state.timer=setInterval(()=>view.setVisible(true),200);
    });
    const model=page.locator('.sc-parameter-trigger');await model.waitFor();await page.locator('.sc-input').fill('Черновик сохраняется');
    await model.click();check(await page.locator('.sc-claude-main [role=menuitemradio]').count()===4,'four primary models');check(await page.getByRole('slider').count()===0,'Claude has list, no slider');
    if(config.touch)await page.getByRole('menuitem',{name:'Effort',exact:false}).tap();else await page.getByRole('menuitem',{name:'Effort',exact:false}).hover();await page.locator('.sc-claude-sub').waitFor();
    check(await page.getByRole('menuitemradio',{name:'Medium Recommended'}).count()===1,'native recommended label');
    check(await page.getByRole('switch',{name:'Ultracode'}).getAttribute('aria-checked')==='false','separate Ultracode switch');
    if(config.poll){const focused=page.getByRole('menuitemradio',{name:'High',exact:true});await focused.focus();await focused.evaluate(n=>{window.m27Focused=n;});const reads=await page.evaluate(()=>window.fixture.reads);await page.waitForFunction(n=>window.fixture.reads>n,reads,{timeout:7000});check(await focused.evaluate(n=>n===window.m27Focused&&n===document.activeElement),'poll preserves open menu DOM and focus');}
    const bounds=await page.locator('.sc-claude-pane:visible').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom};}));check(bounds.every(b=>b.x>=7&&b.y>=7&&b.right<=(config.width??1542)-7&&b.bottom<=(config.height??1049)-7),'menu fits all viewport sides');
    await page.screenshot({path:`/Users/oleksandroliinyk/VSCODE/Workflow_Kit/docs/evidence/M27/claude-effort-${config.touch?'touch':'source'}.png`});
    await page.getByRole('menuitemradio',{name:'High',exact:true}).click();await model.locator('text=High').waitFor();check((await page.evaluate(()=>window.fixture.posts)).length===1,'one effort POST');
    check(await page.locator('.sc-status').isHidden(),'quiet success');check(await page.locator('.sc-input').inputValue()==='Черновик сохраняется','draft preserved');
    await model.click();await page.getByRole('menuitem',{name:'More models',exact:true}).click();check(await page.getByRole('menuitemradio',{name:'Sonnet 5',exact:true}).count()===1,'more models submenu');
    await page.keyboard.press('Escape');check(await page.locator('.sc-claude-sub').isHidden(),'Esc closes submenu first');await page.keyboard.press('Escape');check(await page.locator('.sc-claude-popup').count()===0,'Esc closes root');
    await page.getByRole('button',{name:'Режим Claude',exact:true}).click();check(await page.getByRole('menuitemradio',{name:'Plan Create a plan before making changes'}).count()===1,'native Plan belongs only to Mode');
    await page.screenshot({path:`/Users/oleksandroliinyk/VSCODE/Workflow_Kit/docs/evidence/M27/claude-mode-${config.touch?'touch':'source'}.png`});
    await page.getByRole('menuitemradio',{name:'Manual Always ask before making changes'}).click();await page.locator('.sc-claude-mode-trigger').getByText('Manual').waitFor();
    check(await page.locator('.sc-status').isHidden(),'mode success quiet');
    await model.click();await page.getByRole('menuitem',{name:'Effort',exact:false}).click();await page.getByRole('switch',{name:'Ultracode'}).click();await model.getByText('Ultracode').waitFor();check(await model.innerText().then(t=>t.includes('High')&&t.includes('Ultracode')),'Ultracode keeps base effort in footer');
    await model.click();await page.getByRole('button',{name:'Режим Claude',exact:true}).click();check(await page.locator('.sc-claude-popup').count()===1,'single popup across anchors');await page.locator('.sc-input').click();check(await page.locator('.sc-claude-popup').count()===0,'outside click closes popup');
    await page.evaluate(()=>{window.fixture.fail=true;});await model.click();await page.getByRole('menuitem',{name:'Effort',exact:false}).click();await page.getByRole('menuitemradio',{name:'Low',exact:true}).click();
    await page.getByRole('status').getByText('Claude не подтвердил изменение').waitFor();check(true,'provider failure visible');
    if(config.touch){const boxes=await page.locator('.sc-claude-option:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().height));check(boxes.every(h=>h>=44),'all touch targets >=44');}
    check(errors.length===0,'no browser/CSP errors: '+JSON.stringify(errors));return {checks,errors};
  } finally {await context.close();}
}
