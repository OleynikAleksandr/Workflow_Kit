// M28/T007. Run with the Playwright runtime and the owned source server on :48762
// (docs/evidence/M28-claude-controls-fixes.md). The production session-chat slot, composer and
// feed are mounted; only the panel state and provider I/O are substituted. No live sessions.
async (root, config = {}) => {
  const width = config.width ?? 1280, height = config.height ?? 800, theme = config.theme ?? 'dark', provider = config.provider ?? 'claude';
  const context = await root.context().browser().newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width < 500, isMobile: width < 500 });
  const page = await context.newPage();
  const errors = [], checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (value, name) => { if (!value) throw Error(`${provider}/${theme}/${width}: ${name}`); checks.push(name); };
  const FORBIDDEN = ['Отправляю…', 'Отправлено агенту', 'В очереди…', 'В очереди:', 'Останавливаю…', 'Ответ остановлен', 'Ответ уже завершён', 'Ход сменился'];
  try {
    await page.route('**/m28-composer-test', (route) => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'" },
      body: `<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"><link rel="stylesheet" href="/session-chat/parameters.css"><link rel="stylesheet" href="/session-chat/claude-controls.css"></head><body><main id="m28"></main></body></html>` }));
    await page.goto('http://127.0.0.1:48762/m28-composer-test');
    await page.evaluate(async (provider) => {
      const { h } = await import('/dom.js');
      const { install } = await import('/session-chat/session-chat.js');
      const key = `${provider}:fixture`, projectId = 'm28';
      const at = (s) => new Date(Date.now() - s * 1000).toISOString();
      const f = window.fixture = { posts: [], interrupts: [], sendAnswer: { sent: true }, stopAnswer: { stopped: true, status: 'interrupted', turnRef: 't1' },
        messages: [{ id: 'm1', role: 'user', text: 'Проверь сборку', at: at(120) }, { id: 'm2', role: 'assistant', text: 'Сборка проходит.', at: at(100) }],
        activity: { projectId, key, state: 'waiting', pending: 0, queued: [] }, interruption: { available: true, reason: '', turnRef: null, state: 'waiting', pending: false } };
      let slot = null;
      const shell = { registerSlot: (_name, definition) => { slot = definition; }, dom: { h }, api: async (method, url, body) => {
        if (method === 'GET' && url.endsWith('/messages')) return { supported: true, messages: structuredClone(f.messages) };
        if (method === 'GET' && url === '/api/state') return f.state();
        if (method === 'GET') return { supported: false };
        if (url.endsWith('/interrupt')) { f.interrupts.push(body); return structuredClone(f.stopAnswer); }
        if (f.sendError) throw new Error(f.sendError);
        f.posts.push(body); return structuredClone(f.sendAnswer);
      } };
      install(shell);
      // The session screen gives the card its height; CSSOM styles are allowed by the CSP.
      Object.assign(document.getElementById('m28').style, { display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box', padding: '16px', margin: '0' });
      document.body.style.margin = '0';
      f.state = () => ({ channel: { sessions: [structuredClone(f.activity)], interruptions: { [projectId]: { [key]: structuredClone(f.interruption) } } },
        providers: { projects: { [projectId]: { [provider]: { sessions: [{ localId: 'fixture', model: provider === 'claude' ? 'Haiku 5.5' : 'Model' }] } } } } });
      const session = { project: { id: projectId }, session: { key, provider, providerLabel: provider === 'claude' ? 'Claude' : provider === 'codex' ? 'ChatGPT' : 'Kimi' } };
      f.push = () => { const state = f.state(); const node = slot.render(slot.select(state, session), state, session, { requestRefresh: () => {} });
        if (!node.isConnected) document.getElementById('m28').append(node); };
      f.push();
    }, provider);
    const quiet = async (name) => {
      const text = await page.locator('.sc-compose').innerText();
      check(FORBIDDEN.every((t) => !text.includes(t)) && await page.locator('.sc-availability').count() === 0, `${name}: no service line`);
      check(await page.locator('.sc-status').isHidden(), `${name}: status hidden`);
    };
    const action = page.locator('.sc-compose .sc-icon-button').filter({ has: page.locator('.sc-icon-enter, .sc-icon-stop') });
    await page.locator('.sc-msg').nth(1).waitFor();
    await quiet('waiting');
    // A free agent: Enter sends at once, no notice under the input.
    await page.locator('.sc-input').fill('Первое сообщение');
    await page.locator('.sc-input').press('Enter');
    await page.waitForFunction(() => window.fixture.posts.length === 1);
    check(await page.locator('.sc-input').inputValue() === '', 'sent draft cleared');
    await quiet('after send');
    // A working turn: Stop is pressable for the whole turn, the queue goes into the feed.
    await page.evaluate(() => { const f = window.fixture; f.activity.state = 'working'; Object.assign(f.interruption, { state: 'working', turnRef: 't1' }); f.sendAnswer = { queued: 'q1' }; f.push(); });
    check(await action.getAttribute('aria-label') === 'Остановить ответ' && await action.isEnabled(), 'Stop enabled while working');
    await quiet('working');
    await page.locator('.sc-input').fill('Вопрос во время ответа');
    await page.locator('.sc-input').press(process.platform === 'darwin' ? 'Meta+Enter' : 'Control+Enter');
    await page.waitForFunction(() => window.fixture.posts.length === 2);
    await page.evaluate(() => { const f = window.fixture; f.activity.pending = 1; f.activity.queued = [{ id: 'q1', text: 'Вопрос во время ответа', at: new Date().toISOString() }]; f.push(); });
    const bubble = page.locator('.sc-msg-queued');
    await bubble.waitFor();
    check(await bubble.innerText().then((t) => t.includes('в очереди') && t.includes('Вопрос во время ответа')), 'queued bubble with label');
    check(await page.locator('.sc-feed > *').last().evaluate((n) => n.classList.contains('sc-msg-queued')), 'bubble ends the feed');
    await quiet('queued');
    const box = await page.locator('.sc-card').boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= width + 0.5, 'card inside the viewport');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page scroll');
    if (config.shot) await page.screenshot({ path: config.shot });
    // A poll keeps the draft, the focus and the bubble node.
    await page.locator('.sc-input').fill('Черновик');
    await page.locator('.sc-input').focus();
    const node = await bubble.elementHandle();
    await page.evaluate(() => window.fixture.push());
    check(await page.locator('.sc-input').inputValue() === 'Черновик' && await page.locator('.sc-input').evaluate((n) => n === document.activeElement), 'poll keeps draft and focus');
    check(await node.evaluate((n) => n.isConnected), 'poll keeps the bubble node');
    // Claude outside the Kit terminal: Stop stays pressable, the reason comes only after the press.
    if (provider === 'claude') {
      await page.evaluate(() => { const f = window.fixture; Object.assign(f.interruption, { available: false, reason: 'Остановите ответ в приложении Claude' }); f.push(); });
      check(await action.isEnabled(), 'Stop enabled without availability');
      await quiet('unavailable before press');
      await action.click();
      await page.locator('.sc-status').getByText('Остановите ответ в приложении Claude').waitFor();
      check(await page.evaluate(() => window.fixture.interrupts.length === 0), 'no interrupt request without a Kit terminal');
      await page.evaluate(() => { const f = window.fixture; Object.assign(f.interruption, { available: true, reason: '' }); f.push(); });
    }
    // Stop: one request with the turnRef, quiet success.
    await action.click();
    await page.waitForFunction(() => window.fixture.interrupts.length === 1);
    check(await page.evaluate(() => window.fixture.interrupts[0].turnRef === 't1'), 'Stop sends the turnRef');
    await page.waitForFunction(() => document.querySelector('.sc-compose .sc-icon-enter'));
    check(await page.locator('.sc-status').isHidden(), 'Stop success is quiet');
    // Delivery: the queue empties, the message is in the transcript, the bubble goes.
    await page.evaluate(() => { const f = window.fixture; f.activity = { ...f.activity, state: 'working', pending: 0, queued: [] }; Object.assign(f.interruption, { turnRef: 't2', state: 'working' });
      f.messages.push({ id: 'm3', role: 'user', text: 'Вопрос во время ответа', at: new Date().toISOString() }); f.push(); });
    await page.waitForFunction(() => !document.querySelector('.sc-msg-queued'));
    check(await page.locator('.sc-input').inputValue() === 'Черновик', 'delivery keeps the draft');
    // An error after the user's action stays visible for every provider.
    await page.evaluate(() => { const f = window.fixture; f.activity.state = 'waiting'; Object.assign(f.interruption, { state: 'waiting', turnRef: null }); f.push(); });
    await page.evaluate(() => { window.fixture.sendError = 'Сервис не принял сообщение'; });
    await page.locator('.sc-input').press('Enter');
    await page.locator('.sc-status').getByText('Сервис не принял сообщение').waitFor();
    check(await page.locator('.sc-input').inputValue() === 'Черновик', 'failed send keeps the draft');
    check(errors.length === 0, 'no browser/CSP errors: ' + JSON.stringify(errors));
    return { provider, theme, width, checks };
  } finally { await context.close(); }
}
