// M33 T013: the card of an asynchronous question of Codex (spec M33 section 2.7) in the dialogue.
// The real session-chat extension on a fake shell: the feed GET returns window.m33.page, the message
// POST is recorded and answered by window.m33.mode. Checks the place after its message, no header
// chip, the status line untouched, one click never sends, «Отправить» and Ctrl/⌘+Enter, the text
// of one and of two parts, an error with the choice kept, «Ответ отправлен сообщением», the close by
// a user message, a blocking question beside it, touch targets, both themes, narrow width.
async (page, config) => {
  const errors = [], checks = [];
  const check = (v, name) => { if (!v) throw Error(name); checks.push(name); };
  page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message));
  await page.setViewportSize({ width: config.width ?? 1280, height: config.height ?? 860 });
  await page.route('**/m33-async-test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html data-theme="dark"><head><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/session-chat/session-chat.css"></head><body><main class="m33"></main></body></html>' }));
  await page.goto('http://127.0.0.1:48762/m33-async-test');
  const COLOR = { id: 'q1', header: '', question: 'Which color do you prefer?', options: [{ label: 'Blue', description: '' }, { label: 'Red', description: '' }], multiSelect: false, allowOther: true };
  const SIZE = { id: 'q2', header: '', question: 'Which size?', options: [{ label: 'S', description: '' }, { label: 'L', description: '' }], multiSelect: false, allowOther: true };
  const messages = [{ id: 'u1', role: 'user', text: 'Спроси меня', at: '2026-11-15T09:00:00.000Z' }, { id: 'a1', role: 'assistant', text: 'Уточню цвет.', at: '2026-11-15T09:00:05.000Z' }, { id: 'a2', role: 'assistant', text: 'Пока смотрю файлы.', at: '2026-11-15T09:00:09.000Z' }];
  const asked = (over = {}) => ({ id: 'async:a1', at: '2026-11-15T09:00:05.000Z', afterMessageId: 'a1', state: 'pending', parts: [COLOR], answerable: true, reply: 'message', ...over });
  await page.evaluate(async ({ theme, messages, first }) => {
    document.documentElement.dataset.theme = theme;
    const { h } = await import('/dom.js'); const { install } = await import('/session-chat/session-chat.js');
    window.m33 = { page: { messages, truncated: false, questions: [first] }, posts: [], answers: [], mode: 'accept' };
    let slot;
    const shell = { dom: { h }, registerSlot: (_n, d) => { slot = d; }, api: async (method, url, body) => {
      if (method === 'GET' && url.endsWith('/messages')) return structuredClone(window.m33.page);
      if (method === 'GET') return { supported: false };
      if (url.endsWith('/answer')) { window.m33.answers.push(structuredClone(body)); return { answered: true, outcome: 'unknown' }; }
      if (url.endsWith('/message')) {
        window.m33.posts.push(structuredClone(body));
        if (window.m33.mode === 'error') { const e = new Error('Агент сейчас не принимает сообщения'); e.status = 409; e.code = 'busy'; throw e; }
        return { queued: true };
      }
      return {};
    } };
    install(shell);
    const session = { project: { id: 'p1' }, session: { key: 'codex:t1', provider: 'codex', providerLabel: 'ChatGPT' }, link: 'codex://threads/t1' };
    const node = slot.render(slot.select({}, session), { }, session, { requestRefresh() { window.m33.refreshed = (window.m33.refreshed ?? 0) + 1; } });
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
  await card.locator('.sc-q-option', { hasText: 'Blue' }).click();
  check((await page.evaluate(() => window.m33.posts.length)) === 0, 'one click on an option sends nothing');
  check(await send.isEnabled(), '«Отправить» is on');
  const sizes = await page.locator('.sc-q-option, .sc-q-send').evaluateAll(nodes => nodes.filter(n => n.offsetParent).map(n => Math.round(n.getBoundingClientRect().height)));
  check(sizes.every(s => s >= 44), `touch targets ≥ 44 px: ${sizes.join(',')}`);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check(overflow <= 0, 'no horizontal scroll');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-pending.png') });
  // An error of the message route: the line under the card, the choice kept, the same button again.
  await page.evaluate(() => { window.m33.mode = 'error'; });
  await send.click();
  await card.locator('.sc-q-status[data-tone="error"]', { hasText: 'не принимает сообщения' }).waitFor({ timeout: 3000 });
  check(await card.locator('.sc-q-option', { hasText: 'Blue' }).locator('input').isChecked(), 'the choice survives an error');
  check(await send.isEnabled(), 'a new try with the same button');
  // Ctrl/⌘+Enter sends the text of the choice through the message route, never the answer route.
  await page.evaluate(() => { window.m33.mode = 'accept'; window.m33.posts = []; });
  await card.locator('.sc-q-option', { hasText: 'Blue' }).locator('input').focus();
  await page.keyboard.press(config.mac ? 'Meta+Enter' : 'Control+Enter');
  await card.locator('.sc-q-status', { hasText: 'Ответ отправлен сообщением' }).waitFor({ timeout: 3000 });
  const posts = await page.evaluate(() => window.m33.posts);
  check(posts.length === 1 && JSON.stringify(posts[0]) === JSON.stringify({ text: 'Blue' }), `the message body is { text: "Blue" }: ${JSON.stringify(posts)}`);
  check((await page.evaluate(() => window.m33.answers.length)) === 0, 'the answer route is not used');
  check(await send.isHidden(), 'no button after the message went out');
  check((await page.evaluate(() => window.m33.refreshed ?? 0)) >= 1, 'the shell refreshes the queue');
  // The user message in the feed closes the card: «Ответ дан сообщением».
  await page.evaluate(({ q }) => { window.m33.page.messages.push({ id: 'u2', role: 'user', text: 'Blue', at: '2026-11-15T09:00:20.000Z' }); window.m33.page.questions = [{ ...q, state: 'answered', answerable: false }]; }, { q: asked() });
  const closed = page.locator('.sc-question-closed[data-question="async:a1"]');
  await closed.waitFor({ timeout: 5000 });
  check((await closed.textContent()).includes('Ответ дан сообщением'), 'the closed card says the answer was a message');
  if (config.shot) await page.screenshot({ path: config.shot.replace('.png', '-answered.png') });
  // Two parts: one message with a line per question; a blocking question beside it keeps its place.
  await page.evaluate(({ two, blocking }) => { window.m33.posts = []; window.m33.page.questions = [two, blocking]; }, {
    two: asked({ id: 'async:a2', afterMessageId: 'a2', parts: [COLOR, SIZE] }),
    blocking: { id: 'item-1', at: '2026-11-15T09:00:30.000Z', afterMessageId: 'u2', state: 'pending', parts: [{ ...COLOR, header: 'Color' }], answerable: true },
  });
  const both = page.locator('.sc-question[data-question="async:a2"]');
  await both.waitFor({ timeout: 5000 });
  check((await page.locator('.sc-feed > *').last().getAttribute('data-question')) === 'item-1', 'the blocking question stands at the end');
  check(await page.locator('.sc-state', { hasText: 'Агент ждёт вашего ответа' }).isVisible(), 'the blocking question sets the waiting line');
  await both.locator('.sc-q-option', { hasText: 'Red' }).click();
  await both.locator('.sc-q-other').nth(1).click();
  await both.locator('.sc-q-other-text').nth(1).fill('XL');
  await both.locator('.sc-q-send').click();
  await both.locator('.sc-q-status', { hasText: 'Ответ отправлен сообщением' }).waitFor({ timeout: 3000 });
  const text = await page.evaluate(() => window.m33.posts[0]?.text);
  check(text === 'Which color do you prefer? — Red\nWhich size? — XL', `two parts — a line each: ${JSON.stringify(text)}`);
  check(await page.locator('.sc-input').isEditable(), 'the input of the dialogue works as before');
  check(errors.length === 0, `no browser errors: ${errors.join('; ')}`);
  return { name: config.name, theme: config.theme, width: config.width, checks };
}
