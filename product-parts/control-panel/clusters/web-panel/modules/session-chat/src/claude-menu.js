// @ts-check
/** One rooted native menu, with keyed rows so polling preserves focus.
 * @param {{h:any, data:()=>import('#provider-registry').SessionParameters|null, busy:()=>boolean,
 * change:(id:string, option:import('#provider-registry').ParameterOption)=>Promise<void>,
 * close:()=>void, reposition:()=>void, mode:boolean}} args */
export function createClaudeMenu({h, data, busy, change, close, reposition, mode}) {
  const icon = (/** @type {string} */ name) => h('span', {class:`sc-icon sc-icon-${name}`, 'aria-hidden':'true'});
  const main = h('div', {class:'sc-claude-pane sc-claude-main', role:'menu'});
  const sub = h('div', {class:'sc-claude-pane sc-claude-sub', role:'menu'}); sub.hidden = true;
  const node = h('div', {class:`sc-claude-menu${mode ? ' sc-claude-mode-menu' : ''}`}, [main, sub]);
  /** @type {'effort'|'more'|null} */ let level = null;
  let destroyed = false;
  let rootWidth = 160;
  /** @type {HTMLElement|null} */ let opener = null;
  /** @type {Map<string,{button:HTMLButtonElement,label:HTMLElement,detail:HTMLElement,badge:HTMLElement,mark:HTMLElement,shortcut:HTMLElement}>} */ const rows = new Map();
  const item = (/** @type {string} */ id) => data()?.items.find(i=>i.id===id);
  function reconcile(/** @type {HTMLElement} */ parent, /** @type {HTMLElement[]} */ children) {
    children.forEach((n,i)=>{if(parent.childNodes[i]!==n)parent.insertBefore(n,parent.childNodes[i]??null);});
    while(parent.childNodes.length>children.length)parent.lastChild?.remove();
  }
  function text(/** @type {HTMLElement} */ el, /** @type {string} */ value) {if(el.textContent!==value)el.textContent=value;}
  function option(/** @type {string} */ id, /** @type {import('#provider-registry').ParameterOption} */ value, index=0) {
    const key=`${id}:${value.value}`;
    let row=rows.get(key);
    if(!row) {
      const label=h('span',{class:'sc-claude-label'}),detail=h('small'),badge=h('span',{class:'sc-claude-badge'}),mark=icon('check'),shortcut=h('span',{class:'sc-claude-shortcut','aria-hidden':'true'});
      const copy=h('span',{class:'sc-claude-copy'},[h('span',{class:'sc-claude-option-label'},[label,badge,id==='effort'&&value.value==='max'?icon('info'):null]),detail]);
      const button=/** @type {HTMLButtonElement} */(h('button',{type:'button',class:'sc-claude-option',role:'menuitemradio','data-claude-option':key},[copy,mark,shortcut]));
      button.addEventListener('click',()=>{
        const current=item(id)?.options?.find(o=>o.value===value.value);
        if(!current||busy()||current.disabled)return;
        const selected=current.selected??current.value===item(id)?.value;
        if(selected){close();return;}
        void change(id,current);
      });
      row={button,label,detail,badge,mark,shortcut};rows.set(key,row);
    }
    const selected=value.selected??value.value===item(id)?.value;
    text(row.label,value.label);text(row.detail,value.disabled&&value.reason?value.reason:value.description??'');row.detail.hidden=!row.detail.textContent;
    text(row.badge,value.recommended?'Recommended':'');row.badge.hidden=!value.recommended;
    row.button.disabled=busy()||value.disabled===true;row.button.title=value.reason??'';row.button.setAttribute('aria-checked',String(selected));
    row.mark.hidden=!selected; text(row.shortcut,index>0?String(index):''); row.shortcut.hidden=index===0||(!mode&&selected);
    return row.button;
  }
  const separator = () => h('div',{class:'sc-claude-separator',role:'separator'});
  const effortText = h('span',{class:'sc-claude-current'});
  const effortButton=/** @type {HTMLButtonElement} */(h('button',{type:'button',class:'sc-claude-option sc-claude-branch',role:'menuitem','aria-haspopup':'menu'},[h('span',{},['Effort']),effortText,icon('chevron-right')]));
  const moreButton=/** @type {HTMLButtonElement} */(h('button',{type:'button',class:'sc-claude-option sc-claude-branch',role:'menuitem','aria-haspopup':'menu'},[h('span',{},['More models']),icon('chevron-right')]));
  const back=/** @type {HTMLButtonElement} */(h('button',{type:'button',class:'sc-claude-back',role:'menuitem'},[icon('chevron-right'),'Back']));
  back.addEventListener('click',()=>leave());
  const explanation=h('p',{class:'sc-claude-explanation'},['Higher effort means more thorough responses, but takes longer and uses your limits faster.']);
  const modeTitle=h('div',{class:'sc-claude-title'},['Mode']);
  const subReason=h('p',{class:'sc-claude-reason'});
  const reason=h('p',{class:'sc-claude-reason'});
  const toggle=/** @type {HTMLButtonElement} */(h('button',{type:'button',class:'sc-claude-option sc-claude-ultra',role:'switch','aria-label':'Ultracode'},[h('span',{},['Ultracode']),h('span',{class:'sc-claude-switch','aria-hidden':'true'})]));
  toggle.addEventListener('click',()=>{const value=item('ultracode')?.value==='on'?'off':'on';const o=item('ultracode')?.options?.find(o=>o.value===value);if(o&&!o.disabled&&!busy())void change('ultracode',o);});
  const separators=[separator(),separator(),separator()];
  /** @param {'effort'|'more'} next @param {HTMLElement} button @param {boolean} focus */
  function enter(next,button,focus) {if(busy())return;level=next;opener=button;update();reposition();if(focus)sub.querySelector('button:not(:disabled)')?.focus({preventScroll:true});}
  for(const [button,next] of [[effortButton,'effort'],[moreButton,'more']]) {
    const b=/** @type {HTMLButtonElement} */(button), l=/** @type {'effort'|'more'} */(next);
    b.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse'&&(window.visualViewport?.width??innerWidth)>=520)enter(l,b,false);});
    b.addEventListener('click',()=>enter(l,b,true));
    b.addEventListener('keydown',event=>{if(event.key==='ArrowRight'){event.preventDefault();event.stopPropagation();enter(l,b,true);}});
  }
  function leave(){level=null;sub.hidden=true;main.hidden=false;node.classList.remove('sc-claude-narrow');opener?.focus({preventScroll:true});effortButton.setAttribute('aria-expanded','false');moreButton.setAttribute('aria-expanded','false');reposition();}
  node.addEventListener('keydown',(/** @type {KeyboardEvent} */ event)=>{
    if(level&&['ArrowLeft','Escape'].includes(event.key)){event.preventDefault();event.stopPropagation();leave();return;}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      const pane=level?sub:main;const buttons=Array.from(pane.querySelectorAll('button')).filter(b=>!b.disabled&&!b.classList.contains('sc-claude-back')&&b.getClientRects().length);
      if(buttons.length){event.preventDefault();event.stopPropagation();const current=buttons.findIndex(b=>b===document.activeElement);const index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(current+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus();}return;
    }
    if(/^[1-4]$/.test(event.key)&&!level){const choices=main.querySelectorAll('button[role="menuitemradio"]');const b=/** @type {HTMLButtonElement|undefined} */(choices[Number(event.key)-1]);if(b&&!b.disabled){event.preventDefault();b.click();}}
  });
  function position(){
    if(destroyed)return;
    const vv=window.visualViewport;const width=vv?.width??innerWidth,height=vv?.height??innerHeight,left=vv?.offsetLeft??0,top=vv?.offsetTop??0;
    const narrow=width<520;
    if(!mode&&!main.hidden){const labelWidth=effortText.getBoundingClientRect().width;if(labelWidth>0)rootWidth=Math.max(142,Math.ceil(114+labelWidth));}
    const popup=node.closest('.sc-claude-popup');const wanted=Math.min(width-16,mode||level&&narrow?320:rootWidth);
    if(popup instanceof HTMLElement&&popup.style.width!==`${wanted}px`){popup.style.width=`${wanted}px`;reposition();return;}
    if(!level)return;
    node.classList.toggle('sc-claude-narrow',narrow);main.hidden=narrow;back.hidden=!narrow;
    if(narrow){sub.style.position='static';sub.style.width='100%';sub.style.maxHeight=`${Math.max(44,height-16)}px`;return;}
    sub.style.position='fixed';sub.style.width=level==='more'?'142px':'320px';sub.style.maxHeight=`${Math.max(44,height-16)}px`;
    const box=main.getBoundingClientRect(),r=opener?.getBoundingClientRect()??box,b=sub.getBoundingClientRect();
    const x=box.right+3+b.width<=left+width-8?box.right+3:box.left-b.width-3;
    sub.style.left=`${Math.max(left+8,Math.min(x,left+width-b.width-8))}px`;
    sub.style.top=`${Math.max(top+8,Math.min(r.bottom-b.height,top+height-b.height-8))}px`;
  }
  function update(){
    if(destroyed)return;
    const state=data();if(!state)return;
    node.setAttribute('aria-busy',String(busy()));text(reason,state.reason??'');reason.hidden=!state.reason;text(subReason,state.reason??'');subReason.hidden=!state.reason;
    const primary=(item('model')?.options??[]).filter(o=>o.group!=='more');
    if(mode)reconcile(main,[modeTitle,...(item('mode')?.options??[]).map((o,i)=>option('mode',o,i+1)),reason]);
    else {
      text(effortText,item('effort')?.label??'');
      effortButton.disabled=moreButton.disabled=busy();
      effortButton.setAttribute('aria-expanded',String(level==='effort'));moreButton.setAttribute('aria-expanded',String(level==='more'));
      reconcile(main,[...primary.map((o,i)=>option('model',o,i+1)),separators[0],effortButton,separators[1],moreButton,reason]);
    }
    sub.hidden=!level;sub.classList.toggle('sc-claude-more-pane',level==='more');
    if(level==='effort'){
      const ultra=item('ultracode');const checked=ultra?.value==='on';toggle.setAttribute('aria-checked',String(checked));
      const target=ultra?.options?.find(o=>o.value===(checked?'off':'on'));toggle.disabled=busy()||!target||target.disabled===true;toggle.title=target?.reason??'';
      reconcile(sub,[back,explanation,...(item('effort')?.options??[]).map(o=>option('effort',o)),separators[2],toggle,subReason]);
    } else if(level==='more')reconcile(sub,[back,...(item('model')?.options??[]).filter(o=>o.group==='more').map(o=>option('model',o)),subReason]);
    position();
  }
  const resize=()=>{position();reposition();};window.addEventListener('resize',resize);window.visualViewport?.addEventListener('resize',resize);window.visualViewport?.addEventListener('scroll',resize);
  update();
  return {node,update,position,destroy(){destroyed=true;window.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('resize',resize);window.visualViewport?.removeEventListener('scroll',resize);}};
}
