// M32/T004. Run with the Playwright runtime and the owned source server on :48762 (see
// docs/evidence/M32-codex-history-recovery.md). The production session-chat slot, composer and
// feed are mounted; only the panel state and the provider I/O are substituted. The service's
// sync states replace each other while the draft, the focus, the scroll and the queue stay.
async (root, config = {}) => {
  const width = config.width ?? 1280, height = config.height ?? 800, theme = config.theme ?? 'dark';
  const context = await root.context().browser().newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width < 500, isMobile: width < 500 });
  const page = await context.newPage();
  const errors = [], checks = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const check = (value, name) => { if (!value) throw Error(`${theme}/${width}: ${name}`); checks.push(name); };
  const RECONNECT = 'Восстанавливаем подключение к Codex…', OFFLINE = 'Нет подключения к Codex. Проверьте демон в настройках провайдера';
  const GAP = 'Часть диалога Codex недоступна: слишком большой элемент. Полный текст доступен в чате провайдера';
  try {
    await page.route('**/m32-recovery-test', (route) => route.fulfill({ contentType: 'text/html', headers: { 'Content-Security-Policy': "default-src 'self'; base-uri 'none'; form-action 'self'" },
      body: `<!doctype html><html data-theme="${theme}"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"><link rel="stylesheet" href="/session-chat/parameters.css"></head><body><main id="m32"></main></body></html>` }));
    await page.goto('http://127.0.0.1:48762/m32-recovery-test');
    await page.evaluate(async () => {
      const { h } = await import('/dom.js');
      const { install } = await import('/session-chat/session-chat.js');
      const key = 'codex:fixture', projectId = 'm32';
      const at = (s) => new Date(Date.now() - s * 1000).toISOString();
      const all = Array.from({ length: 30 }, (_, k) => ({ id: `m${k}`, role: k % 2 ? 'assistant' : 'user', text: `Сообщение ${k}\nвторая строка`, at: at(600 - k) }));
      const f = window.fixture = { posts: [], gets: 0, mode: 'down', messages: all,
        activity: { projectId, key, state: 'working', pending: 1, queued: [{ id: 'q1', text: 'Вопрос в очереди', at: at(1) }] } };
      const fail = (code, message, status = 503) => Object.assign(new Error(message), { status, code });
      let slot = null;
      const shell = { registerSlot: (_name, definition) => { slot = definition; }, dom: { h }, api: async (method, url, body) => {
        if (method !== 'GET') { f.posts.push({ url, body }); return { sent: true }; }
        if (url.endsWith('/messages')) {
          f.gets += 1;
          const full = { supported: true, messages: structuredClone(f.messages), truncated: false };
          if (f.mode === 'down') throw fail('codex-reconnecting', 'Восстанавливаем подключение к Codex…');
          if (f.mode === 'reconnecting') return { ...full, sync: { state: 'reconnecting', reason: 'Восстанавливаем подключение к Codex…', retryAfterMs: 1000 } };
          if (f.mode === 'unavailable') return { ...full, sync: { state: 'unavailable', reason: 'Нет подключения к Codex. Проверьте демон в настройках провайдера', retryAfterMs: 10000 } };
          if (f.mode === 'loading') return { supported: true, messages: structuredClone(f.messages.slice(-2)), truncated: true, sync: { state: 'loading' } };
          if (f.mode === 'partial') return { ...full, sync: { state: 'partial', reason: 'Часть диалога Codex недоступна: слишком большой элемент. Полный текст доступен в чате провайдера', gaps: [{ turnId: 't1', reason: 'x', afterItemId: 'm28' }], gapCount: 1 } };
          return { ...full, sync: { state: 'ready' } };
        }
        // Parameters and other background reads fail quietly while Codex is away.
        if (f.mode === 'down' || f.mode === 'reconnecting' || f.mode === 'unavailable') throw fail('parameters-unavailable', 'Не удалось прочитать параметры ChatGPT');
        return { supported: false };
      } };
      install(shell);
      Object.assign(document.getElementById('m32').style, { display: 'flex', flexDirection: 'column', height: '100dvh', boxSizing: 'border-box', padding: '16px', margin: '0' });
      document.body.style.margin = '0';
      f.state = () => ({ channel: { sessions: [structuredClone(f.activity)], interruptions: {} }, providers: { projects: { [projectId]: { codex: { sessions: [{ localId: 'fixture', model: 'Model' }] } } } } });
      const session = { project: { id: projectId }, session: { key, provider: 'codex', providerLabel: 'ChatGPT' } };
      f.push = () => { const state = f.state(); const node = slot.render(slot.select(state, session), state, session, { requestRefresh: () => {} });
        if (!node.isConnected) document.getElementById('m32').append(node); };
      f.push();
    });
    const errorLine = page.locator('.sc-card > .sc-error');
    const stateLine = page.locator('.sc-card > .sc-state');
    const nextPoll = async (mode) => {
      const gets = await page.evaluate((m) => { window.fixture.mode = m; return window.fixture.gets; }, mode);
      await page.waitForFunction((n) => window.fixture.gets > n + 0, gets, { timeout: 8000 });
      await page.waitForTimeout(50);
    };
    // 503 without any snapshot: the service's line, an empty feed, the queued bubble stays.
    await errorLine.getByText(RECONNECT).waitFor({ timeout: 8000 });
    check(await page.locator('.sc-msg:not(.sc-msg-queued)').count() === 0, '503 without snapshot keeps an empty feed');
    check(await stateLine.isHidden(), 'no state line on 503');
    // The daemon is back: the feed fills, the lines go without a success message.
    await nextPoll('ready');
    await page.locator('.sc-msg[data-id="m29"]').waitFor();
    check(await errorLine.isHidden() && await stateLine.isHidden(), 'ready hides both lines');
    check(!(await page.locator('.sc-card').innerText()).includes('восстановлено'), 'no success line');
    await page.locator('.sc-input').fill('Черновик');
    await page.locator('.sc-input').focus();
    const feed = page.locator('.sc-feed');
    await feed.evaluate((n) => { n.scrollTop = 40; });
    const scroll = await feed.evaluate((n) => n.scrollTop);
    const bubble = await page.locator('.sc-msg-queued').elementHandle();
    const first = await page.locator('.sc-msg[data-id="m0"]').elementHandle();
    const kept = async (name) => {
      check(await page.locator('.sc-input').inputValue() === 'Черновик', `${name}: draft`);
      check(await page.locator('.sc-input').evaluate((n) => n === document.activeElement), `${name}: focus`);
      check(Math.abs((await feed.evaluate((n) => n.scrollTop)) - scroll) <= 1, `${name}: scroll`);
      check(await bubble.evaluate((n) => n.isConnected), `${name}: queued bubble`);
      check(await first.evaluate((n) => n.isConnected), `${name}: message nodes`);
      check(await page.locator('.sc-msg:not(.sc-msg-queued)').count() === 30, `${name}: all messages`);
      check(await page.locator('.sc-status').isHidden(), `${name}: no service line under the composer`);
      check(await page.evaluate(() => window.fixture.posts.length === 0), `${name}: nothing sent`);
    };
    for (const [mode, text] of [['down', RECONNECT], ['reconnecting', RECONNECT], ['unavailable', OFFLINE]]) {
      await nextPoll(mode);
      await errorLine.getByText(text).waitFor();
      check(await stateLine.isHidden(), `${mode}: state line hidden`);
      await kept(mode);
    }
    if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-unavailable.png') });
    // A new pass after the return: loading never replaces the shown full snapshot.
    await nextPoll('loading');
    await stateLine.getByText('Загружаем диалог…').waitFor();
    check(await errorLine.isHidden(), 'loading clears the reconnect line');
    await kept('loading');
    // The pass is ready with a gap and a newer answer.
    await page.evaluate(() => window.fixture.messages.push({ id: 'm30', role: 'assistant', text: 'Новый ответ', at: new Date().toISOString() }));
    await nextPoll('partial');
    await page.locator('.sc-msg[data-id="m30"]').waitFor();
    await stateLine.getByText(GAP).waitFor();
    check(await page.locator('.sc-input').inputValue() === 'Черновик', 'partial keeps the draft');
    await nextPoll('ready');
    await page.waitForFunction(() => document.querySelector('.sc-card > .sc-state').hidden);
    check(await errorLine.isHidden(), 'ready after partial: no lines');
    const box = await page.locator('.sc-card').boundingBox();
    check(box && box.x >= 0 && box.x + box.width <= width + 0.5, 'card inside the viewport');
    check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), 'no horizontal page scroll');
    check(errors.length === 0, 'no browser/CSP errors: ' + JSON.stringify(errors));
    return { theme, width, checks };
  } finally { await context.close(); }
}
