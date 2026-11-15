// M34 T003: the card of an asynchronous question of Codex (spec M34 section 2.5) answers through the
// answer route like a blocking one. The real session-chat extension on a fake shell: the feed GET
// returns window.m34.page, the answer POST is recorded and answered by window.m34.mode, a message
// POST must never come. Checks the place after its message, no header chip, the status line
// untouched, one click never sends, a refusal with the choice kept, Ctrl/⌘+Enter with an attemptId,
// the closed card with the answer from the feed (a label, own text), «Ответ дан сообщением» without
// answers, a blocking question beside it, touch targets, both themes, narrow width.
async (page, config) => {
  const errors = [], checks = [];
  const check = (v, name) => { if (!v) throw Error(name); checks.push(name); };
  page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: config.width ?? 1280, height: config.height ?? 860 });
  await page.route('**/m34-async-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body><main class="m34"></main></body></html>' }));
  await page.goto('http://127.0.0.1:48762/m34-async-test');
  const COLOR = { id: 'q1', header: '', question: 'Где хранить список покупок?', options: [{ label: 'В браузере', description: '' }, { label: 'В файле JSON', description: '' }], multiSelect: false, allowOther: true };
  const SIZE = { id: 'q2', header: '', question: 'Как назвать приложение?', options: [{ label: 'Список покупок', description: '' }], multiSelect: false, allowOther: true };
  const messages = [{ id: 'u1', role: 'user', text: 'Уточни требования', at: '2026-11-15T09:00:00.000Z' }, { id: 'a1', role: 'assistant', text: 'Уточню по одному вопросу.', at: '2026-11-15T09:00:05.000Z' }, { id: 'a2', role: 'assistant', text: 'Жду ответа.', at: '2026-11-15T09:00:09.000Z' }];
  const asked = (over = {}) => ({ id: 'async:a1', at: '2026-11-15T09:00:05.000Z', afterMessageId: 'a1', state: 'pending', parts: [COLOR], answerable: true, reply: 'message', ...over });
  await page.evaluate(async ({ theme, messages, first }) => {
    document.documentElement.dataset.theme = theme;
    const { h } = await import('/dom.js'); const { install } = await import('/session-chat/session-chat.js');
    window.m34 = { page: { messages, truncated: false, questions: [first] }, posts: [], answers: [], urls: [], mode: 'accept' };
    let slot;
    const shell = { dom: { h }, registerSlot: (_n, d) => { slot = d; }, api: async (method, url, body) => {
      if (method === 'GET' && url.endsWith('/messages')) return structuredClone(window.m34.page);
      if (method === 'GET') return { supported: false };
      if (url.endsWith('/answer')) {
        window.m34.answers.push(structuredClone(body)); window.m34.urls.push(url);
        if (window.m34.mode === 'error') { const e = new Error('Ответьте в приложении ChatGPT'); e.status = 409; e.code = 'question-unavailable'; throw e; }
        return { answered: true, outcome: 'accepted' };
      }
      if (url.endsWith('/message')) { window.m34.posts.push(structuredClone(body)); return { queued: true }; }
      return {};
    } };
    install(shell);
    const session = { project: { id: 'p1' }, session: { key: 'codex:t1', provider: 'codex', providerLabel: 'ChatGPT' }, link: 'codex://threads/t1' };
    const node = slot.render(slot.select({}, session), { }, session, { requestRefresh() {} });
    const wrap = document.querySelector('main'); wrap.style.cssText = 'display:flex;height:820px;padding:16px;box-sizing:border-box'; wrap.append(node);
  }, { theme: config.theme ?? 'dark', messages, first: asked() });
  const card = page.locator('.sc-question[data-question="async:a1"]');
  await card.waitFor();
  const order = await page.locator('.sc-feed > *').evaluateAll(nodes => nodes.map(n => n.dataset.question ?? n.dataset.id ?? n.className));
  const at = order.indexOf('async:a1');
  check(at > 0 && at < order.length - 1, `the card stands after its message, not at the end: ${order.join(' | ')}`);
  check((await card.locator('.sc-q-header').count()) === 0, 'no header chip for an empty header');
  check((await page.locator('.sc-state', { hasText: 'Агент ждёт' }).count()) === 0, 'the status line is not «Агент ждёт вашего ответа»');
  const send = card.locator('.sc-q-send');
  check(await send.isDisabled(), '«Отправить» is off without a choice');
  await card.locator('.sc-q-option', { hasText: 'В браузере' }).click();
  check((await page.evaluate(() => window.m34.answers.length)) === 0, 'one click on an option sends nothing');
  check(await send.isEnabled(), '«Отправить» is on');
  const sizes = await page.locator('.sc-q-option, .sc-q-send').evaluateAll(nodes => nodes.filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height)));
  check(sizes.every(s => s >= 44), `touch targets ≥ 44 px: ${sizes.join(',')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, 'no horizontal scroll');
  // A refusal before any hand-out: the line under the card, the choice kept, the same button again.
  await page.evaluate(() => { window.m34.mode = 'error'; });
  await send.click();
  await card.locator('.sc-q-status[data-tone="error"]', { hasText: 'Ответьте в приложении ChatGPT' }).waitFor({ timeout: 3000 });
  check(await card.locator('.sc-q-option', { hasText: 'В браузере' }).locator('input').isChecked(), 'the choice survives a refusal');
  check(await send.isEnabled(), 'a new try with the same button');
  // Ctrl/⌘+Enter: the answer route with a new attemptId and the answers, never the message route.
  await page.evaluate(() => { window.m34.mode = 'accept'; window.m34.answers = []; window.m34.urls = []; });
  await card.locator('.sc-q-option', { hasText: 'В браузере' }).locator('input').focus();
  await page.keyboard.press(config.mac ? 'Meta+Enter' : 'Control+Enter');
  await page.waitForFunction(() => window.m34.answers.length === 1, null, { timeout: 3000 });
  const [body] = await page.evaluate(() => window.m34.answers);
  check(/^[0-9a-f-]{36}$/.test(body.attemptId) && JSON.stringify(body.answers) === JSON.stringify({ q1: { selected: ['В браузере'] } }), `the answer body: ${JSON.stringify(body)}`);
  check((await page.evaluate(() => window.m34.urls[0])).endsWith('/providers/codex/sessions/t1/questions/async%3Aa1/answer'), 'the answer route of the question');
  check((await page.evaluate(() => window.m34.posts.length)) === 0, 'the message route is not used');
  // The reply in the feed closes the card with the answer the feed gives.
  await page.evaluate(({ q }) => { window.m34.page.messages.push({ id: 'u2', role: 'user', text: 'В браузере', at: '2026-11-15T09:00:20.000Z' }); window.m34.page.questions = [{ ...q, state: 'answered', answerable: false, answers: { q1: { selected: ['В браузере'] } } }]; }, { q: asked() });
  const closed = page.locator('.sc-question-closed[data-question="async:a1"]');
  await closed.waitFor({ timeout: 5000 });
  check((await closed.locator('.sc-q-answer').textContent()) === 'В браузере', 'the closed card shows the answer');
  check(!(await closed.textContent()).includes('Ответ дан сообщением'), 'no «Ответ дан сообщением» when the answer is known');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-answered.png') });
  // Two parts with own text; a blocking question beside it keeps its place and the waiting line.
  await page.evaluate(({ two, blocking }) => { window.m34.answers = []; window.m34.page.questions = [two, blocking]; }, {
    two: asked({ id: 'async:a2', afterMessageId: 'a2', parts: [COLOR, SIZE] }),
    blocking: { id: 'item-1', at: '2026-11-15T09:00:30.000Z', afterMessageId: 'u2', state: 'pending', parts: [{ ...COLOR, header: 'Хранение' }], answerable: true },
  });
  const both = page.locator('.sc-question[data-question="async:a2"]');
  await both.waitFor({ timeout: 5000 });
  check((await page.locator('.sc-feed > *').last().getAttribute('data-question')) === 'item-1', 'the blocking question stands at the end');
  check(await page.locator('.sc-state', { hasText: 'Агент ждёт вашего ответа' }).isVisible(), 'the blocking question sets the waiting line');
  await both.locator('.sc-q-option', { hasText: 'В файле JSON' }).click();
  await both.locator('.sc-q-other').nth(1).click();
  await both.locator('.sc-q-other-text').nth(1).fill('За покупками');
  await both.locator('.sc-q-send').click();
  await page.waitForFunction(() => window.m34.answers.length === 1, null, { timeout: 3000 });
  const two = await page.evaluate(() => window.m34.answers[0]?.answers);
  check(JSON.stringify(two) === JSON.stringify({ q1: { selected: ['В файле JSON'] }, q2: { selected: [], other: 'За покупками' } }), `two parts with own text: ${JSON.stringify(two)}`);
  // Closed by a plain message (no reply to it): «Ответ дан сообщением».
  await page.evaluate(({ q }) => { window.m34.page.questions = [{ ...q, state: 'answered', answerable: false }]; }, { q: asked({ id: 'async:a2', afterMessageId: 'a2', parts: [COLOR, SIZE] }) });
  const plain = page.locator('.sc-question-closed[data-question="async:a2"]');
  await plain.waitFor({ timeout: 5000 });
  check((await plain.textContent()).includes('Ответ дан сообщением'), 'without answers: «Ответ дан сообщением»');
  check(await page.locator('.sc-input').isEditable(), 'the input of the dialogue works as before');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { name: config.name, theme: config.theme, width: config.width, checks };
}
