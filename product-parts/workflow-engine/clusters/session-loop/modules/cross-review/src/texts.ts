// Texts of the cross review (spec M4 section 5): the reviewer brief, the forwarded messages and
// the reminder of a waiting side. Markers end the answers of both sides.
/** Id of a provider of the registry. */
export type ReviewProvider = string;

/**
 * Who reviews whose plan: the provider of the main session → the provider of the reviewer
 * (spec M8 section 5). The only place that pairs providers; a provider without a line here, or
 * whose reviewer is not available on this machine, gets no review.
 */
export const REVIEW_PAIRS: Readonly<Record<ReviewProvider, ReviewProvider>> = Object.freeze({ claude: 'codex', codex: 'claude', kimi: 'codex' });

/** Provider of a session key ('<provider>:<session id>'). */
export function providerOf(key: string): ReviewProvider {
  return key.slice(0, Math.max(0, key.indexOf(':')));
}

export const MAX_ROUNDS = 5;
/** Longest forwarded text; the full one stays in the sender's chat. */
export const FORWARD_MAX_CHARS = 12_000;
export const SOURCE = 'review';

const APPROVED = /REVIEW:\s*APPROVED/i;
const AGREED = /REVIEW:\s*AGREED/i;

/** Verdict of a reviewer answer: approved only with the marker. */
export function reviewerApproves(text: string): boolean {
  return APPROVED.test(text);
}

/** The main agent agrees that the documents are ready. */
export function mainAgrees(text: string): boolean {
  return AGREED.test(text);
}

export function clip(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= FORWARD_MAX_CHARS) return trimmed;
  return `${trimmed.slice(0, FORWARD_MAX_CHARS)}\n(обрезано, полный текст — в чате отправителя)`;
}

export interface BriefInput {
  projectName: string;
  projectPath: string;
  /** Title of the main session's provider (from the registry). */
  mainName: string;
  mainTitle: string;
  /** The main agent's description of the proposed plan (spec M4 section 11.2); '' when none. */
  plan: string;
}

/**
 * Continues the main turn when the review starts: scope:proposal does not show the plan's tasks,
 * so the main agent describes them for the reviewer (spec M4 section 11.2).
 */
export const PLAN_REQUEST =
  'Workflow Kit: включено «Ревью плана» — план проверит сессия другого провайдера. Она не видит задачи предложения через `scope:proposal`. Ответь одним сообщением, только описанием предложенного плана: путь к спецификации; задачи по порядку (id, название, файлы, критерии приёмки, зависимости); рекомендованный режим и причина. Ничего не меняй — ответ уйдёт ревьюеру.';

/** The first message of the reviewer session. */
export function reviewerBrief(input: BriefInput): string {
  return [
    `Ты — ревьюер плана в проекте «${input.projectName}» (${input.projectPath}). Основной агент — ${input.mainName}, сессия «${input.mainTitle}»; он написал спецификацию и предложил план.`,
    'Задача: проверить спецификацию и план до начала работы — полнота относительно запроса пользователя, противоречия, риски, порядок и размер задач, критерии приёмки, проверяемость.',
    'Контекст: `scripts/workflow recover --format text`, предложение плана (режим и причина, без задач) — `scripts/workflow scope:proposal --format text`, документы — `scripts/workflow context <путь>`.',
    input.plan
      ? `План, как его описал основной агент:\n\n${clip(input.plan)}`
      : 'Основной агент не описал состав плана: первым замечанием попроси перечислить задачи.',
    'Правила: только читай. Не меняй файлы, не выполняй команды Kit, которые меняют план или репозиторий, не коммить.',
    `Ответ — одним сообщением: замечания по пунктам (что, где, почему, как исправить). Последняя строка — \`REVIEW: APPROVED\`, если документы готовы, иначе \`REVIEW: CHANGES\`. Твои ответы Workflow Kit пересылает основному агенту, его — тебе; не больше ${MAX_ROUNDS} кругов.`,
  ].join('\n\n');
}

/** Reviewer remarks for the main agent; the first round carries the rules. */
export function toMain(reviewerName: string, round: number, text: string): string {
  const head = `Workflow Kit: ревью плана, ревьюер — ${reviewerName}, круг ${round} из ${MAX_ROUNDS}. Замечания ревьюера:`;
  const rules =
    round === 1
      ? '\n\nИсправь то, с чем согласен (при изменении плана снова `scope:propose` и новый состав задач в ответе — ревьюер видит план только из твоих сообщений), с остальным аргументированно не соглашайся. Ответь одним сообщением: что исправил, с чем не согласен и почему, ссылки на изменённые документы. Когда ревьюер написал `REVIEW: APPROVED` и ты согласен, закончи ответ строкой `REVIEW: AGREED`.'
      : '\n\nОтветь так же одним сообщением; если ревьюер одобрил и ты согласен — строкой `REVIEW: AGREED`.';
  return `${head}\n\n${clip(text)}${rules}`;
}

/** The main agent's answer for the reviewer. */
export function toReviewer(mainName: string, round: number, text: string): string {
  return `Workflow Kit: ответ основного агента (${mainName}) на круг ${round} из ${MAX_ROUNDS}:\n\n${clip(text)}\n\nПроверь исправления (изменённые документы; новый состав задач, если план менялся, — в ответе выше) и ответь так же: замечания и последняя строка \`REVIEW: APPROVED\` или \`REVIEW: CHANGES\`.`;
}

/** Reminder of a session whose plan question is still open (spec M4 12.1). */
export const QUESTION_REMINDER =
  'Workflow Kit: пользователь ещё не ответил на вопрос о спецификации и плане в панели. Ничего не делай, коротко подтверди и закончи ход — ответ придёт сюда.';

export const REMINDER =
  'Workflow Kit: ревью плана идёт, ответ другой стороны ещё не пришёл. Ничего не делай, коротко подтверди и закончи ход — ответ придёт сюда.';

export const FINISHED_FOR_REVIEWER: Record<'agreed' | 'disagreed' | 'cancelled', string> = {
  agreed: 'Workflow Kit: ревью закончено — основной агент согласен с твоей оценкой. Спасибо, больше ничего не делай.',
  disagreed: `Workflow Kit: ревью закончено — за ${MAX_ROUNDS} кругов согласия нет, решит пользователь. Спасибо, больше ничего не делай.`,
  cancelled: 'Workflow Kit: ревью остановлено пользователем. Спасибо, больше ничего не делай.',
};

export const STATUS_LABELS: Record<string, string> = {
  preparing: 'агент описывает план для ревьюера',
  starting: 'запускаем ревьюера',
  reviewing: 'ревьюер смотрит',
  answering: 'агент отвечает на замечания',
  agreed: 'ревьюер и агент согласны',
  disagreed: 'ревьюер и агент не договорились',
  failed: 'ревью не запустилось',
  cancelled: 'ревью остановлено',
};
