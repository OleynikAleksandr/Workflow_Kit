// M33 T007: the card of an agent's question in the dialogue (spec M33 section 2.5). The real
// session-chat extension on a fake shell: the feed GET returns window.m33.page, the answer POST is
// recorded and answered by window.m33.mode. Checks the choice, one click never sends, «Отправить»
// and Ctrl/⌘+Enter, the same attemptId after a network error, timeout, invalid, stale, a question
// that cannot be answered, the choice surviving a poll, touch targets, both themes, narrow width.
async (page, config) => {
  const errors = [], checks = [];
  const check = (v, name) => { if (!v) throw Error(name); checks.push(name); };
  page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: config.width ?? 1280, height: config.height ?? 860 });
  await page.route('**/m33-question-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body><main class="m33"></main></body></html>' }));
  await page.goto('http://127.0.0.1:48762/m33-question-test');
  const COLOR = { id: 'q1', header: 'Color', question: 'Which color do you prefer?', options: [{ label: 'Blue', description: 'Calm and cold' }, { label: 'Red', description: 'Warm' }], multiSelect: false, allowOther: true };
  const FRUIT = { id: 'q2', header: 'Fruit', question: 'Which fruits?', options: [{ label: 'Apple', description: '' }, { label: 'Plum', description: '' }], multiSelect: true, allowOther: false };
  const messages = [{ id: 'm1', role: 'user', text: 'Спроси меня', at: '2026-11-15T09:00:00.000Z' }, { id: 'm2', role: 'assistant', text: 'Сейчас спрошу.', at: '2026-11-15T09:00:05.000Z' }];
  const pending = (over = {}) => ({ id: 'toolu_1', at: '2026-11-15T09:00:06.000Z', afterMessageId: 'm2', state: 'pending', parts: [COLOR, FRUIT], answerable: true, ...over });
  await page.evaluate(async ({ theme, messages, first }) => {
    document.documentElement.dataset.theme = theme;
    const { h } = await import('/dom.js'); const { install } = await import('/session-chat/session-chat.js');
    window.m33 = { page: { messages, truncated: false, questions: [first] }, posts: [], mode: 'accept', fails: 0 };
    let slot;
    const shell = { dom: { h }, registerSlot: (_n, d) => { slot = d; }, api: async (method, url, body) => {
      if (method === 'GET' && url.endsWith('/messages')) return structuredClone(window.m33.page);
      if (method === 'GET') return { supported: false };
      if (url.endsWith('/answer')) {
        window.m33.posts.push(structuredClone(body));
        const mode = window.m33.mode;
        if (mode === 'network' && window.m33.fails++ < 1) { const e = new Error('Нет связи с бэкендом'); e.status = 0; e.code = 'network'; throw e; }
        const refuse = { timeout: [504, 'question-timeout', 'Ответ отправлен, подтверждение не пришло. Проверьте чат провайдера'], invalid: [400, 'question-invalid', 'Ответ не подходит к вопросу'], stale: [409, 'question-stale', 'На вопрос уже ответили'] }[mode];
        if (refuse) { const e = new Error(refuse[2]); e.status = refuse[0]; e.code = refuse[1]; throw e; }
        return { answered: true, outcome: 'accepted' };
      }
      return {};
    } };
    install(shell);
    const session = { project: { id: 'p1' }, session: { key: 'claude:s1', provider: 'claude', providerLabel: 'Claude' }, link: 'claude://claude.ai/code/session_x' };
    const node = slot.render(slot.select({}, session), {}, session, { requestRefresh() {} });
    const wrap = document.querySelector('main'); wrap.style.cssText = 'display:flex;height:820px;padding:16px;box-sizing:border-box'; wrap.append(node);
  }, { theme: config.theme ?? 'dark', messages, first: pending() });
  const card = page.locator('.sc-question:not(.sc-question-closed)');
  await card.waitFor();
  const send = card.locator('.sc-q-send');
  check(await page.locator('.sc-state', { hasText: 'Агент ждёт вашего ответа' }).isVisible(), 'the status line says the agent waits');
  check((await page.locator('.sc-feed > *').last().getAttribute('data-question')) === 'toolu_1', 'the pending question stands at the end of the feed');
  check(await send.isDisabled(), '«Отправить» is off until every part has an answer');
  check((await page.getByText('Пропустить').count()) === 0, 'no «Пропустить»');
  await card.locator('.sc-q-option', { hasText: 'Blue' }).click();
  check((await page.evaluate(() => window.m33.posts.length)) === 0, 'one click on an option sends nothing');
  check(await send.isDisabled(), 'the second part still has no answer');
  await card.locator('.sc-q-option', { hasText: 'Apple' }).click();
  await card.locator('.sc-q-option', { hasText: 'Plum' }).click();
  check(await send.isEnabled(), '«Отправить» is on');
  // The choice survives a poll of the feed (POLL_MS 3 s).
  await page.waitForTimeout(3400);
  check(await card.locator('.sc-q-option', { hasText: 'Blue' }).locator('input').isChecked(), 'the choice survives a poll');
  // Own text replaces the single choice.
  await card.locator('.sc-q-other').click();
  const other = card.locator('.sc-q-other-text');
  await other.fill('Зелёный');
  check(!(await card.locator('.sc-q-option', { hasText: 'Blue' }).locator('input').isChecked()), 'own text replaces the radio');
  const sizes = await page.locator('.sc-q-option, .sc-q-send, .sc-q-other-text').evaluateAll(nodes => nodes.filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height)));
  check(sizes.every(s => s >= 44), `touch targets ≥ 44 px: ${sizes.join(',')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, 'no horizontal scroll');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-pending.png') });
  // A network error: the same attemptId again; then accepted.
  await page.evaluate(() => { window.m33.mode = 'network'; });
  await other.focus();
  await page.keyboard.press(config.mac ? 'Meta+Enter' : 'Control+Enter');
  await page.waitForFunction(() => window.m33.posts.length >= 2, null, { timeout: 5000 });
  const posts = await page.evaluate(() => window.m33.posts);
  check(posts[0].attemptId === posts[1].attemptId && /^[0-9a-f-]{36}$/.test(posts[0].attemptId), 'a retry after a network error keeps the attemptId');
  check(JSON.stringify(posts[0].answers) === JSON.stringify({ q1: { selected: [], other: 'Зелёный' }, q2: { selected: ['Apple', 'Plum'] } }), 'the body has the answer of each part');
  // The provider confirms: the closed card shows the proven answer after its message.
  await page.evaluate((q) => { window.m33.page.questions = [{ ...q, state: 'answered', answerable: false, answers: { q1: { selected: [], other: 'Зелёный' }, q2: { selected: ['Apple', 'Plum'] } } }]; }, pending());
  const closed = page.locator('.sc-question-closed[data-question="toolu_1"]');
  await closed.waitFor({ timeout: 5000 });
  check((await closed.textContent()).includes('Apple, Plum') && (await closed.textContent()).includes('Зелёный'), 'the closed card shows the proven answer');
  check((await page.locator('.sc-state', { hasText: 'Агент ждёт' }).count()) === 0, 'no waiting line without a pending question');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-answered.png') });
  // A timeout: no button, the outcome comes by polling; an unknown outcome never shows the panel's choice.
  await page.evaluate((q) => { window.m33.mode = 'timeout'; window.m33.posts = []; window.m33.page.questions = [q]; }, pending({ id: 'toolu_2', parts: [COLOR] }));
  const second = page.locator('.sc-question[data-question="toolu_2"]');
  await second.waitFor({ timeout: 5000 });
  await second.locator('.sc-q-option', { hasText: 'Red' }).click();
  await second.locator('.sc-q-send').click();
  await second.locator('.sc-q-status', { hasText: 'Ответ отправлен, ждём подтверждения' }).waitFor({ timeout: 3000 });
  check(await second.locator('.sc-q-send').isHidden(), 'no button after question-timeout');
  await page.evaluate((q) => { window.m33.page.questions = [{ ...q, state: 'answered', answerable: false }]; }, pending({ id: 'toolu_2', parts: [COLOR] }));
  await page.locator('.sc-question-closed[data-question="toolu_2"]').waitFor({ timeout: 5000 });
  const unknown = await page.locator('.sc-question-closed[data-question="toolu_2"]').textContent();
  check(unknown.includes('Какой ответ принят, провайдер не сообщил') && !unknown.includes('Red'), 'an unknown outcome does not show the panel choice');
  // Invalid: a line under the card, the same button makes a new attempt.
  await page.evaluate((q) => { window.m33.mode = 'invalid'; window.m33.posts = []; window.m33.page.questions = [q]; }, pending({ id: 'toolu_3', parts: [COLOR] }));
  const third = page.locator('.sc-question[data-question="toolu_3"]');
  await third.waitFor({ timeout: 5000 });
  await third.locator('.sc-q-option', { hasText: 'Blue' }).click();
  await third.locator('.sc-q-send').click();
  await third.locator('.sc-q-status[data-tone="error"]', { hasText: 'Ответ не подходит к вопросу' }).waitFor({ timeout: 3000 });
  check(await third.locator('.sc-q-send').isEnabled(), 'a new attempt is possible after a refusal without hand-out');
  await page.evaluate(() => { window.m33.mode = 'accept'; });
  await third.locator('.sc-q-send').click();
  await page.waitForFunction(() => window.m33.posts.length === 2, null, { timeout: 3000 });
  const twice = await page.evaluate(() => window.m33.posts.map(p => p.attemptId));
  check(twice[0] !== twice[1], 'a new attempt has a new attemptId');
  // Stale: the card asks the feed again and shows the outcome.
  await page.evaluate((q) => { window.m33.mode = 'stale'; window.m33.posts = []; window.m33.page.questions = [q]; }, pending({ id: 'toolu_4', parts: [COLOR] }));
  const fourth = page.locator('.sc-question[data-question="toolu_4"]');
  await fourth.waitFor({ timeout: 5000 });
  await fourth.locator('.sc-q-option', { hasText: 'Blue' }).click();
  await page.evaluate((q) => { window.m33.page.questions = [{ ...q, state: 'answered', answerable: false }]; }, pending({ id: 'toolu_4', parts: [COLOR] }));
  await fourth.locator('.sc-q-send').click();
  await page.locator('.sc-question-closed[data-question="toolu_4"]', { hasText: 'Ответ дан в приложении' }).waitFor({ timeout: 3000 });
  check(true, 'question-stale shows the outcome at once');
  // A question that cannot be answered here: options without a choice, the reason, the link.
  await page.evaluate((q) => { window.m33.page.questions = [q]; }, pending({ id: 'toolu_5', parts: [COLOR], answerable: false, reason: 'Ответьте в приложении Claude: эта сессия запущена до обновления хуков проекта' }));
  const locked = page.locator('.sc-question[data-question="toolu_5"]');
  await locked.waitFor({ timeout: 5000 });
  check(await locked.locator('input').first().isDisabled(), 'options cannot be chosen');
  check(await locked.locator('.sc-q-send').isHidden(), 'no button');
  check(await locked.locator('.sc-q-open').isVisible(), 'a link to the provider chat');
  check((await locked.locator('.sc-q-status').textContent()).includes('до обновления хуков'), 'the reason is shown');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-locked.png') });
  check(await page.locator('.sc-input').isEditable(), 'the input of the dialogue works as before');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { name: config.name, theme: config.theme, width: config.width, checks };
}
