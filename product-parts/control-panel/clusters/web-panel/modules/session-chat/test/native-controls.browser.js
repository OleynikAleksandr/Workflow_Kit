// Run with the existing Playwright browser runtime and the owned source server on :48762.
// Real composer/parameters/effort-card DOM; only provider I/O is substituted. No live threads.
async (root) => {
  const touch = false; // Set true for the touch/375px variant in the same browser runtime.
  const context = await root.context().browser().newContext({viewport:touch?{width:375,height:667}:{width:1000,height:700},deviceScaleFactor:2,hasTouch:touch,isMobile:touch});
  const page = await context.newPage();
  const errors = [], results = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', m => {if(m.type()==='error')errors.push(m.text());});
  const check = (v, name) => {if(!v)throw Error(name);results.push(name);};
  try {
    await page.route('**/native-controls-test', route => route.fulfill({contentType:'text/html',headers:{'Content-Security-Policy':"default-src 'self'; base-uri 'none'; form-action 'self'"},body:'<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body></body></html>'}));
    await page.goto('http://127.0.0.1:48762/native-controls-test');
    await page.bringToFront();
    await page.evaluate(async () => {
      const {h} = await import('/dom.js');
      const {createComposer} = await import('/session-chat/composer.js');
      const options = values => values.map(([value,label])=>({value,label}));
      const item = (id,value,label,values) => ({id,value,label,title:label,inRow:id!=='mode',options:options(values)});
      const state = window.fixture = {posts:[],reads:0,fail:false,delay:0,parameters:{editable:true,items:[
        {...item('speed','priority','Быстрая',[['standard','Стандартная'],['priority','Быстрая']]),icon:'zap'},
        item('model','sol','GPT-6.1 Sol',[['sol','GPT-6.1 Sol'],['astra','GPT-6 Astra']]),
        item('effort','high','Высокое',[['low','Низкое'],['medium','Среднее'],['high','Высокое'],['xhigh','Очень высокое'],['max','Максимальное'],['ultra','Ультра']]),
        item('permissions',':danger-full-access','Полный доступ',[]),item('mode','default','Обычный',[['default','Обычный'],['plan','План']])
      ],presentation:{layout:'effort-card',speedHint:'Скорость 2×\nБольше использования',access:{value:'full',label:'Полный доступ',tone:'warning',options:[{value:'ask',label:'Запрашивать разрешение',description:'Подтверждать действия вручную',icon:'hand'}]}},limits:[],context:null}};
      const shell={dom:{h},api:async(method,url,body)=>{
        if(method==='GET'){state.reads++;return {supported:true,parameters:structuredClone(state.parameters)};}
        state.posts.push(body);if(state.delay)await new Promise(r=>setTimeout(r,state.delay));
        if(state.fail)throw Error('Провайдер не сохранил параметры');
        for(const [id,value]of Object.entries(body.change)){const item=state.parameters.items.find(i=>i.id===id);if(item){item.value=value;item.label=item.options.find(o=>o.value===value)?.label??value;}}
        return {parameters:{...structuredClone(state.parameters),notes:['Одобрения: never','Проверяющий: user']}};
      }};
      const view=createComposer({shell,projectId:'fixture',key:'codex:fixture',provider:'codex',onSent(){}});
      const card=h('section',{class:'sc-card'},[view.node]);document.body.append(card);
      // CSSOM keeps the test layout compatible with the production CSP.
      card.style.width='min(700px, calc(100vw - 32px))';card.style.margin='220px auto 0';
      view.setVisible(true);state.timer=setInterval(()=>view.setVisible(true),200);
    });
    await page.locator('.sc-parameter-trigger').waitFor();
    await page.locator('.sc-input').fill('Черновик не теряется');
    const range=page.getByRole('slider',{name:'Уровень размышлений'});
    const read=()=>page.evaluate(()=>({posts:window.fixture.posts,reads:window.fixture.reads}));
    const settle=()=>page.locator('.sc-parameter-trigger:enabled').waitFor();
    const start=async()=>{
      // Wait for stable layout after the anchor's press animation before measuring the thumb.
      await range.hover();
      const b=await range.boundingBox(),v=Number(await range.inputValue()),max=Number(await range.getAttribute('max'));
      const center=b.x+14+v/max*(b.width-28),y=b.y+b.height/2;
      await page.mouse.move(center,y);await page.mouse.down();return {...b,y};
    };
    const move=async(b,index)=>page.mouse.move(b.x+14+index/5*(b.width-28),b.y,{steps:12});
    const assertQuiet=async()=>check(await page.locator('.sc-status').isHidden(),'no success/progress subline');
    for(const theme of ['dark','light']){
      await page.evaluate(t=>document.documentElement.dataset.theme=t,theme);
      await page.locator('.sc-parameter-trigger').click();
      for(const target of [4,1]){
        const before=(await read()).posts.length,b=await start();await move(b,target);
        check(Number(await range.inputValue())===target,`${theme}: thumb moves while held to ${target}`);
        check((await read()).posts.length===before,'no POST while dragging');
        await page.mouse.up();await settle();
        check((await read()).posts.length===before+1,'exactly one POST after release');await assertQuiet();
      }
      // Native thumb keeps moving when pointer leaves the element.
      const before=(await read()).posts.length,b=await start();await page.mouse.move(b.x-100,b.y-50,{steps:12});
      check(await range.inputValue()==='0','drag outside track clamps to first step');
      await page.mouse.up();await settle();check((await read()).posts.length===before+1,'outside release commits once');
      await page.keyboard.press('End');await settle();await page.keyboard.press('Home');await settle();
      check(await range.inputValue()==='0','keyboard Home/End remains native');
      const clickBefore=(await read()).posts.length,box=await range.boundingBox();
      await page.mouse.click(box.x+14+3/5*(box.width-28),box.y+box.height/2);await settle();
      check((await read()).posts.length===clickBefore+1,'track click still commits once');
      await page.keyboard.press('Escape');
    }
    await page.locator('.sc-parameter-trigger').click();
    let before=(await read()).posts.length,b=await start();await move(b,4);
    check(await range.inputValue()==='4','drag preview reached target before polling');
    const reads=(await read()).reads,deadline=Date.now()+7000;
    while((await read()).reads<=reads&&Date.now()<deadline)await page.waitForTimeout(50);
    check((await read()).reads>reads,'poll completed while holding thumb');
    check(await range.inputValue()==='4','poll preserves real drag preview: '+await range.inputValue());await move(b,1);
    check(await range.inputValue()==='1','thumb still draggable after poll');await page.mouse.up();await settle();
    check((await read()).posts.length===before+1,'poll does not duplicate POST');
    for(const cancel of ['pointercancel','lostpointercapture','blur','Escape']){
      before=(await read()).posts.length;b=await start();await move(b,4);
      if(cancel==='Escape')await page.keyboard.press('Escape');
      else if(cancel==='blur')await page.evaluate(()=>window.dispatchEvent(new Event('blur')));
      else await range.dispatchEvent(cancel,{pointerId:1,bubbles:true});
      await page.mouse.up();await settle();
      check((await read()).posts.length===before,`${cancel} cancels without a later POST`);
      if(cancel==='Escape')await page.locator('.sc-parameter-trigger').click();
    }
    await page.evaluate(()=>{window.fixture.fail=true;});
    await range.press('End');await settle();
    check((await page.locator('.sc-status').innerText()).includes('не сохранил'),'failure remains visible');
    await page.evaluate(()=>{window.fixture.fail=false;window.fixture.delay=250;});
    await range.press('End');await assertQuiet();await settle();await assertQuiet();
    check(await page.locator('.sc-input').inputValue()==='Черновик не теряется','draft preserved');
    if(touch){
      await page.evaluate(()=>{window.fixture.delay=0;});
      const box=await range.boundingBox(),max=Number(await range.getAttribute('max')),value=Number(await range.inputValue());
      const cdp=await context.newCDPSession(page),before=(await read()).posts.length,y=box.y+box.height/2;
      check(box.height>=44,'touch target >=44');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+14+value/max*(box.width-28),y}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+14+(box.width-28)/5,y}]});
      check(await range.inputValue()==='1','touch thumb moves before release');
      check((await read()).posts.length===before,'no POST while touch held');
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();
      check((await read()).posts.length===before+1,'one POST after touch release');await cdp.detach();
    }
    check(errors.length===0,'no browser/CSP errors: '+JSON.stringify(errors));
    await page.keyboard.press('Escape');
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    await page.locator('.sc-compose').screenshot({path:`/Users/oleksandroliinyk/VSCODE/Workflow_Kit/docs/evidence/M26/fixes-composer${touch?'-touch':''}.png`});
    return {results,posts:(await read()).posts,errors};
  } finally {await context.close();}
}
