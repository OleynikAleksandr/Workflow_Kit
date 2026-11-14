// M28 T014: the Claude menu shows one reason per menu, never under each option. Owned source server
// :48762 and an I/O-only fixture; `config.parameters` comes from the provider's nativeClaudeParameters.
async (page, config) => {
  const errors = [], checks = [];
  const check = (v, name) => { if (!v) throw Error(name); checks.push(name); };
  page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: config.width ?? 1280, height: config.height ?? 800 });
  await page.route('**/m28-menu-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body></body></html>' }));
  await page.goto('http://127.0.0.1:48762/m28-menu-test');
  await page.evaluate(async ({ parameters, theme }) => {
    document.documentElement.dataset.theme = theme;
    const { h } = await import('/dom.js'); const { createComposer } = await import('/session-chat/composer.js');
    const shell = { dom: { h }, api: async (method) => method === 'GET' ? { supported: true, parameters: structuredClone(parameters) } : { parameters } };
    const view = createComposer({ shell, projectId: 'm28', key: 'claude:fixture', provider: 'claude', onSent() {} });
    const card = h('section', { class: 'sc-card' }, [view.node]); card.style.cssText = 'position:absolute;right:16px;bottom:10px;width:min(768px,calc(100vw - 32px))';
    document.body.append(card); view.setVisible(true);
  }, { parameters: config.parameters, theme: config.theme ?? 'dark' });
  const trigger = page.locator('.sc-parameter-trigger'); await trigger.waitFor(); await trigger.click();
  await page.locator('.sc-claude-main').waitFor();
  const reasons = await page.locator('.sc-claude-main .sc-claude-reason:visible').allTextContents();
  check(reasons.length === (config.reason ? 1 : 0) && (!config.reason || reasons[0] === config.reason), `one reason line: ${JSON.stringify(reasons)}`);
  const details = await page.locator('.sc-claude-main [role=menuitemradio]').evaluateAll(nodes => nodes.map(n => n.textContent));
  check(details.length > 0 && details.every(t => !config.reason || !t.includes(config.reason)), 'no reason under the options');
  const disabled = await page.locator('.sc-claude-main [role=menuitemradio]').evaluateAll(nodes => nodes.map(n => n.disabled));
  check(disabled.every(d => d === config.modelsDisabled), `model options disabled=${config.modelsDisabled}`);
  if (config.shot) await page.screenshot({ path: config.shot });
  await page.keyboard.press('Escape');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { name: config.name, checks };
}
