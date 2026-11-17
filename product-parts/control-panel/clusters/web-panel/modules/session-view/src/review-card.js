// @ts-check
// «Ревью плана» in the session sidebar (spec M4 section 6): the reviewer, the round, who answers,
// the journal; the reviewer's screen points to the reviewed session. Moved out of session-view.js
// (M40 T008) to keep the file within the size limit.

/** @typedef {import('../../panel-shell/src/slots.js').SlotContext} SlotContext */
/** @typedef {import('../../panel-shell/src/slots.js').SessionContext} SessionContext */

/**
 * The reviewer's chat in its app (M12): a computer asks the service to open the desktop link, a
 * touch device follows the mobile one.
 * @param {import('./session-view.js').Shell} shell
 * @param {Record<string, string>} links
 */
function openReviewerChat(shell, links) {
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  const link = touch ? (links['mobile'] ?? links['web']) : (links['desktop'] ?? links['web']);
  if (!link) return;
  if (touch) window.location.assign(link);
  else void shell.api('POST', '/api/open-link', { url: link }).catch(() => window.location.assign(link));
}

/**
 * «Ревью плана» (spec M4 section 6): the reviewer, the round, who answers, the journal; the
 * reviewer's screen points to the reviewed session.
 * @param {import('./session-view.js').Shell} shell
 * @param {import('./session-model.js').CrossReviewView} review
 * @param {SessionContext} session
 * @param {SlotContext} ctx
 * @param {Map<string, boolean>} journalOpen which journal entries the user opened
 */
export function crossReviewCard(shell, review, session, ctx, journalOpen) {
  const { h } = shell.dom;
  /** @param {string} label @param {() => void} action @param {string} [cls] @returns {HTMLButtonElement} */
  const button = (label, action, cls = 'btn') => {
    const node = /** @type {HTMLButtonElement} */ (h('button', { type: 'button', class: cls }, [label]));
    node.addEventListener('click', action);
    return node;
  };
  const projectId = session.project.id;
  const open = (/** @type {string} */ key) => (ctx.openSession ? ctx.openSession(projectId, key) : ctx.navigate({ screen: 'session', projectId, key }));
  const other = review.role === 'main' ? review.reviewerKey : review.mainKey;
  const head = review.role === 'main' ? `Ревьюер — ${review.reviewerName}` : `Эта сессия — ревьюер плана сессии «${review.mainTitle}»`;
  const state = review.active
    ? `Круг ${Math.max(review.round, 1)} из ${review.maxRounds} · ${review.turn}`
    : `${review.statusLabel}${review.reason ? `: ${review.reason}` : ''}`;
  const buttons = [
    other && review.canOpenOther ? button(review.role === 'main' ? 'Открыть сессию ревьюера' : 'Открыть основную сессию', () => open(other), 'btn') : null,
    review.reviewerLinks ? button('Открыть чат ревьюера', () => openReviewerChat(shell, review.reviewerLinks ?? {}), 'btn') : null,
    review.active && review.role === 'main'
      ? button('Прервать ревью', async () => {
          try {
            await shell.api('POST', `/api/projects/${encodeURIComponent(projectId)}/reviews/${encodeURIComponent(review.mainKey)}/cancel`);
          } catch (error) {
            ctx.say('error', 'Не удалось прервать ревью', error);
          } finally {
            ctx.requestRefresh();
          }
        }, 'btn')
      : null,
  ].filter((n) => n !== null);
  // The newest entry (the first: newest on top) is open, the rest fold.
  const journal = review.entries.map((entry, index) => {
    const key = JSON.stringify([projectId, session.session.key, entry.from, entry.round, entry.text]);
    const opened = journalOpen.get(key) ?? index === 0;
    const node = h('details', { class: `sv-xr-entry ${entry.from}`, ...(opened ? { open: '' } : {}) }, [h('summary', {}, [`${entry.who}${entry.round ? ` · круг ${entry.round}` : ''}`]), h('p', {}, [entry.text])]);
    node.addEventListener('toggle', () => journalOpen.set(key, /** @type {HTMLDetailsElement} */ (node).open));
    return node;
  });
  const tone = review.status === 'agreed' ? ' ok' : review.active ? '' : ' muted';
  return h('div', { class: `panel sv-xreview${tone}` }, [
    h('h2', {}, ['Ревью плана']),
    h('p', {}, [head]),
    h('p', { class: 'sv-xr-state' }, [state]),
    review.note ? h('p', { class: 'sv-muted' }, [review.note]) : null,
    buttons.length ? h('div', { class: 'sv-xr-buttons' }, buttons) : null,
    journal.length ? h('div', { class: 'sv-xr-journal' }, journal) : null,
  ].filter((n) => n !== null));
}
