// Texts of the cross review (spec M4 section 5): the reviewer brief, the forwarded messages and
// the reminder of a waiting side. Markers end the answers of both sides.
export type ReviewProvider = 'claude' | 'codex';

export const MAX_ROUNDS = 5;
/** Longest forwarded text; the full one stays in the sender's chat. */
export const FORWARD_MAX_CHARS = 12_000;
export const SOURCE = 'review';

export const PROVIDER_NAMES: Record<ReviewProvider, string> = { claude: 'Claude', codex: 'ChatGPT' };

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
  mainProvider: ReviewProvider;
  mainTitle: string;
}

/** The first message of the reviewer session. */
export function reviewerBrief(input: BriefInput): string {
  return [
    `Ты — ревьюер плана в проекте «${input.projectName}» (${input.projectPath}). Основной агент — ${PROVIDER_NAMES[input.mainProvider]}, сессия «${input.mainTitle}»; он написал спецификацию и предложил план.`,
    'Задача: проверить спецификацию и план до начала работы — полнота относительно запроса пользователя, противоречия, риски, порядок и размер задач, критерии приёмки, проверяемость.',
    'Контекст: `scripts/workflow recover --format text`, предложение плана — `scripts/workflow scope:proposal --format text`, документы — `scripts/workflow context <путь>` (спецификация названа в предложении).',
    'Правила: только читай. Не меняй файлы, не выполняй команды Kit, которые меняют план или репозиторий, не коммить.',
    `Ответ — одним сообщением: замечания по пунктам (что, где, почему, как исправить). Последняя строка — \`REVIEW: APPROVED\`, если документы готовы, иначе \`REVIEW: CHANGES\`. Твои ответы Workflow Kit пересылает основному агенту, его — тебе; не больше ${MAX_ROUNDS} кругов.`,
  ].join('\n\n');
}

/** Reviewer remarks for the main agent; the first round carries the rules. */
export function toMain(reviewer: ReviewProvider, round: number, text: string): string {
  const head = `Workflow Kit: ревью плана, ревьюер — ${PROVIDER_NAMES[reviewer]}, круг ${round} из ${MAX_ROUNDS}. Замечания ревьюера:`;
  const rules =
    round === 1
      ? '\n\nИсправь то, с чем согласен (при изменении плана снова `scope:propose`), с остальным аргументированно не соглашайся. Ответь одним сообщением: что исправил, с чем не согласен и почему, ссылки на изменённые документы. Когда ревьюер написал `REVIEW: APPROVED` и ты согласен, закончи ответ строкой `REVIEW: AGREED`.'
      : '\n\nОтветь так же одним сообщением; если ревьюер одобрил и ты согласен — строкой `REVIEW: AGREED`.';
  return `${head}\n\n${clip(text)}${rules}`;
}

/** The main agent's answer for the reviewer. */
export function toReviewer(main: ReviewProvider, round: number, text: string): string {
  return `Workflow Kit: ответ основного агента (${PROVIDER_NAMES[main]}) на круг ${round} из ${MAX_ROUNDS}:\n\n${clip(text)}\n\nПроверь исправления (\`scripts/workflow scope:proposal --format text\`, изменённые документы) и ответь так же: замечания и последняя строка \`REVIEW: APPROVED\` или \`REVIEW: CHANGES\`.`;
}

export const REMINDER =
  'Workflow Kit: ревью плана идёт, ответ другой стороны ещё не пришёл. Ничего не делай, коротко подтверди и закончи ход — ответ придёт сюда.';

export const FINISHED_FOR_REVIEWER: Record<'agreed' | 'disagreed' | 'cancelled', string> = {
  agreed: 'Workflow Kit: ревью закончено — основной агент согласен с твоей оценкой. Спасибо, больше ничего не делай.',
  disagreed: `Workflow Kit: ревью закончено — за ${MAX_ROUNDS} кругов согласия нет, решит пользователь. Спасибо, больше ничего не делай.`,
  cancelled: 'Workflow Kit: ревью остановлено пользователем. Спасибо, больше ничего не делай.',
};

export const STATUS_LABELS: Record<string, string> = {
  starting: 'запускаем ревьюера',
  reviewing: 'ревьюер смотрит',
  answering: 'агент отвечает на замечания',
  agreed: 'ревьюер и агент согласны',
  disagreed: 'ревьюер и агент не договорились',
  failed: 'ревью не запустилось',
  cancelled: 'ревью остановлено',
};
