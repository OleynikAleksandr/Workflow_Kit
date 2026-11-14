// M29 T004: the Claude menu never waits for the terminal. A choice shows at once as pending, the
// confirmed value replaces it on the next read, a refused choice is one line under the input.
// Owned source server :48762 and an I/O-only fixture; `config.states` come from the provider's
// nativeClaudeParameters (initial while Claude answers, pending, applied, failed).
async (page, config) => {
  const errors = [], checks = [];
  const check = (v, name) => { if (!v) throw Error(name); checks.push(name); };
  page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: config.width ?? 1280, height: config.height ?? 800 });
  await page.route('**/m29-pending-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body></body></html>' }));
  await page.goto('http://127.0.0.1:48762/m29-pending-test');
  await page.evaluate(async ({ states, theme }) => {
    document.documentElement.dataset.theme = theme;
    const { h } = await import('/dom.js'); const { createComposer } = await import('/session-chat/composer.js');
    window.m29 = { phase: 'initial', posts: [] };
    const shell = { dom: { h }, api: async (method, _url, body) => {
      if (method === 'POST') { window.m29.posts.push(body.change); window.m29.phase = body.change.effort ? 'effortPending' : 'pending'; }
      return method === 'GET' ? { supported: true, parameters: structuredClone(states[window.m29.phase]) } : { parameters: structuredClone(states[window.m29.phase]) };
    } };
    const view = createComposer({ shell, projectId: 'm29', key: 'claude:fixture', provider: 'claude', onSent() {} });
    const card = h('section', { class: 'sc-card' }, [view.node]); card.style.cssText = 'position:absolute;right:16px;bottom:10px;width:min(768px,calc(100vw - 32px))';
    document.body.append(card); view.setVisible(true);
  }, { states: config.states, theme: config.theme ?? 'dark' });
  const trigger = page.locator('.sc-parameter-trigger'); await trigger.waitFor();
  // Claude answers: the menu opens and every model can be chosen.
  await trigger.click(); await page.locator('.sc-claude-main').waitFor();
  const disabled = await page.locator('.sc-claude-main [role=menuitemradio]').evaluateAll(nodes => nodes.map(n => n.disabled));
  check(disabled.length > 0 && disabled.every(d => !d), 'models are selectable while Claude answers');
  check((await page.locator('.sc-claude-main .sc-claude-reason:visible').count()) === 0, 'no busy footnote');
  const started = Date.now();
  await page.locator('.sc-claude-main [role=menuitemradio]', { hasText: 'Haiku 5.5' }).click();
  const pending = page.locator('.sc-parameter-trigger .sc-parameter-pending', { hasText: 'Haiku 5.5' });
  await pending.waitFor({ timeout: 1000 });
  check(Date.now() - started < 1000, 'the choice shows at once');
  check((await pending.getAttribute('title')).includes('применится, когда Claude закончит ответ'), 'the note says what the choice waits for');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-pending.png') });
  await page.evaluate(() => { window.m29.phase = 'applied'; });
  await page.locator('.sc-parameter-trigger .sc-parameter-value:not(.sc-parameter-pending)', { hasText: 'Haiku 5.5' }).waitFor({ timeout: 2500 });
  check(true, 'the confirmed value replaces the pending mark within the 1 s poll');
  // A refused effort: one line under the input, the row keeps the confirmed value.
  await trigger.click(); await page.locator('.sc-claude-branch', { hasText: 'Effort' }).click();
  await page.locator('.sc-claude-sub [role=menuitemradio]', { hasText: 'Low' }).click();
  await page.locator('.sc-parameter-trigger .sc-parameter-pending', { hasText: 'Low' }).waitFor({ timeout: 1000 });
  await page.evaluate(() => { window.m29.phase = 'failed'; });
  const line = page.locator('.sc-status[data-tone="error"]', { hasText: 'Claude не принял усилие Low' });
  await line.waitFor({ timeout: 2500 });
  check((await page.locator('.sc-parameter-trigger .sc-parameter-pending').count()) === 0, 'the row returns to the confirmed value');
  check(!(await page.locator('.sc-status').textContent()).includes('Транзакция'), 'no host-internal reason');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-failed.png') });
  check(JSON.stringify(await page.evaluate(() => window.m29.posts)) === JSON.stringify([{ model: config.haiku }, { effort: 'low' }]), 'one POST per choice');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { name: config.name, checks };
}
