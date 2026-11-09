// Messages to the agent after the user answered its plan question (spec M4 section 12.1).
import type { PlanChoice } from './toggles.ts';

export const ANSWER_MESSAGES: Record<PlanChoice, string> = {
  review:
    'Workflow Kit: пользователь выбрал спецификацию и план с ревью. Напиши спецификацию и предложи план (`scripts/workflow scope:propose`); после предложения его проверит ревьюер другого провайдера.',
  plan: 'Workflow Kit: пользователь выбрал спецификацию и план без ревью. Напиши спецификацию и предложи план (`scripts/workflow scope:propose`).',
  talk: 'Workflow Kit: пользователь выбрал «Просто обсуждаем»: без спецификации и плана. Продолжай разговор и не начинай их, пока пользователь сам не попросит.',
};
