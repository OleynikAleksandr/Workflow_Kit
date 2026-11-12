import {
  type DocumentRef,
  PLAN_PATH,
} from "../../workflow-plan/src/workflow-plan-facade.js";
import {
  byteLength,
  KIT_COMMAND,
  type PacketSection,
  RECOVERY_SCHEMA,
  type RecoveryInput,
  type RecoveryPacket,
} from "./recovery-model.js";
import { schemaSection } from "./recovery-schema.js";
import {
  changesSection,
  decisionsSection,
  focusTask,
  nextSection,
  objectiveSection,
  recentSection,
  roundsSection,
  stateSection,
  taskSection,
  upcomingSection,
  verificationSection,
} from "./recovery-sections.js";

interface Part extends PacketSection {
  order: number;
}

interface Candidate {
  part: Part;
  reference: string;
}

const DOCUMENT_PREFIX = "document ";
const RULES_POINTER =
  "rules: follow the Workflow Kit section of AGENTS.md (managed by the kit).";
const TASK_CAPS = [2000, 1000, 500, 250, 120, 60];
const HEADING_PATTERN = /^(#{1,6})\s+(.+?)\s*#*\s*$/u;
const SLUG_DROP = /[^\p{L}\p{N}\s-]/gu;
const SLUG_SPACE = /\s+/gu;

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(SLUG_DROP, "")
    .trim()
    .replace(SLUG_SPACE, "-");
}

/** Returns the Markdown section under a heading (text or slug match), or null. */
export function extractHeading(text: string, heading: string): string | null {
  const lines = text.split("\n");
  const wanted = slug(heading);
  let start = -1;
  let level = 0;
  for (const [index, line] of lines.entries()) {
    const match = HEADING_PATTERN.exec(line);
    if (!match?.[1] || match[2] === undefined) {
      continue;
    }
    if (start === -1 && slug(match[2]) === wanted) {
      start = index;
      level = match[1].length;
    } else if (start !== -1 && match[1].length <= level) {
      return lines.slice(start, index).join("\n").trimEnd();
    }
  }
  return start === -1 ? null : lines.slice(start).join("\n").trimEnd();
}

function render(
  input: RecoveryInput,
  parts: Part[],
  references: string[],
  omitted: string[],
  bytes: number
): string {
  const sorted = [...parts].sort((left, right) => left.order - right.order);
  const head = [
    "# Workflow recovery packet",
    `bytes: ${bytes} / budget: ${input.budgetBytes}${bytes > input.budgetBytes ? " (over budget)" : ""}`,
    `included: ${sorted.map((part) => part.name).join(", ")}`,
    `omitted: ${omitted.length > 0 ? omitted.join(", ") : "none"}`,
    RULES_POINTER,
  ].join("\n");
  const body = sorted.map((part) => `## ${part.name}\n${part.text}`);
  const refs = `## references\n${references.length > 0 ? references.map((line) => `- ${line}`).join("\n") : "- none"}`;
  return `${[head, ...body, refs].join("\n\n")}\n`;
}

/** Renders until the byte count printed in the header matches the text. */
function settle(
  input: RecoveryInput,
  parts: Part[],
  references: string[],
  omitted: string[]
): { bytes: number; text: string } {
  let bytes = 0;
  let text = render(input, parts, references, omitted, bytes);
  for (
    let attempt = 0;
    attempt < 4 && byteLength(text) !== bytes;
    attempt += 1
  ) {
    bytes = byteLength(text);
    text = render(input, parts, references, omitted, bytes);
  }
  return { bytes: byteLength(text), text };
}

/**
 * Scope and task documents in order: a whole-document reference replaces
 * the heading references of its path; references of one path and heading
 * merge, required if any of them says so.
 */
function documentRefs(input: RecoveryInput): DocumentRef[] {
  const scope = input.plan.scope;
  const refs: DocumentRef[] = [];
  if (scope?.spec) {
    refs.push({ path: scope.spec, required: true });
  }
  refs.push(
    ...(scope?.context ?? []),
    ...(focusTask(input.plan)?.context ?? [])
  );
  const byKey = new Map<string, DocumentRef>();
  for (const ref of refs) {
    const whole = refs.some((item) => item.path === ref.path && !item.heading);
    const key = whole ? ref.path : `${ref.path}#${ref.heading ?? ""}`;
    byKey.set(key, {
      path: ref.path,
      ...(whole || !ref.heading ? {} : { heading: ref.heading }),
      required: (byKey.get(key)?.required ?? false) || ref.required,
    });
  }
  return [...byKey.values()];
}

/**
 * Required documents as mandatory parts: the whole file, or the section of
 * a heading reference (the whole file when the heading is absent). Missing
 * and optional documents become references.
 */
function documentParts(input: RecoveryInput, references: string[]): Part[] {
  const parts: Part[] = [];
  for (const ref of documentRefs(input)) {
    const label = ref.heading ? `${ref.path}#${ref.heading}` : ref.path;
    const text = input.readDocument(ref.path);
    if (text === null) {
      references.push(`${label}: missing file`);
      continue;
    }
    if (!ref.required) {
      references.push(
        `${label} (${byteLength(text)} bytes, optional): read the file when needed`
      );
      continue;
    }
    const section = ref.heading ? extractHeading(text, ref.heading) : null;
    if (ref.heading && section === null) {
      references.push(
        `${label}: heading not found, the whole file is included`
      );
    }
    parts.push(
      section === null
        ? {
            name: `${DOCUMENT_PREFIX}${ref.path}`,
            order: 12,
            text: text.trimEnd(),
          }
        : { name: `${DOCUMENT_PREFIX}${label}`, order: 12, text: section }
    );
  }
  return parts;
}

/** Optional sections; the earlier a candidate, the longer it is kept. */
function optionalCandidates(input: RecoveryInput): Candidate[] {
  const candidates: Candidate[] = [];
  const add = (
    name: string,
    order: number,
    text: string | null,
    reference: (bytes: number) => string
  ) => {
    if (text !== null) {
      candidates.push({
        part: { name, order, text },
        reference: reference(byteLength(text)),
      });
    }
  };
  add(
    "documents",
    13,
    input.documents?.text || null,
    (bytes) =>
      `documents (${bytes} bytes): run \`${KIT_COMMAND} context --list\``
  );
  add(
    "rounds",
    8,
    roundsSection(input),
    (bytes) => `rounds (${bytes} bytes): run \`${KIT_COMMAND} history\``
  );
  add(
    "decisions",
    9,
    decisionsSection(input),
    (bytes) => `decisions (${bytes} bytes): scope.decisions in ${PLAN_PATH}`
  );
  add(
    "verification",
    11,
    verificationSection(input),
    (bytes) =>
      `verification (${bytes} bytes): .harness/workflow/local/verification/last.json`
  );
  return candidates;
}

/** Sections that always stay; `schema` only when the next step has an input. */
function mandatoryParts(input: RecoveryInput, cap: number | null): Part[] {
  const schema = schemaSection(input);
  return [
    { name: "state", order: 1, text: stateSection(input) },
    { name: "next", order: 2, text: nextSection(input) },
    { name: "objective", order: 3, text: objectiveSection(input) },
    { name: "task", order: 4, text: taskSection(input, cap) },
    ...(schema === null ? [] : [{ name: "schema", order: 5, text: schema }]),
    { name: "upcoming", order: 6, text: upcomingSection(input) },
    { name: "recent", order: 7, text: recentSection(input) },
    { name: "changes", order: 10, text: changesSection(input) },
  ];
}

function assembleWithCap(
  input: RecoveryInput,
  cap: number | null
): RecoveryPacket {
  const references: string[] = [];
  const omitted: string[] = [];
  const candidates = optionalCandidates(input);
  const fits = (parts: Part[]) =>
    settle(input, parts, references, omitted).bytes <= input.budgetBytes;
  let parts = [
    ...mandatoryParts(input, cap),
    ...documentParts(input, references),
  ];
  const optional: { candidate: Candidate; part: Part }[] = [];
  for (const candidate of candidates) {
    if (fits([...parts, candidate.part])) {
      parts = [...parts, candidate.part];
      optional.push({ candidate, part: candidate.part });
    } else {
      omitted.push(candidate.part.name);
      references.push(candidate.reference);
    }
  }
  while (!fits(parts) && optional.length > 0) {
    const last = optional.pop();
    if (last) {
      parts = parts.filter((part) => part !== last.part);
      omitted.push(last.part.name);
      references.push(last.candidate.reference);
    }
  }
  const { bytes, text } = settle(input, parts, references, omitted);
  const sorted = [...parts].sort((left, right) => left.order - right.order);
  return {
    budget: input.budgetBytes,
    bytes,
    event: input.event,
    included: sorted.map((part) => part.name),
    omitted,
    overBudget: bytes > input.budgetBytes,
    references,
    schema: RECOVERY_SCHEMA,
    sections: sorted.map(({ name, text: sectionText }) => ({
      name,
      text: sectionText,
    })),
    text,
    truncated: cap !== null && taskSection(input, cap) !== taskSection(input),
  };
}

/** True when the packet exceeds the budget even without required documents. */
function overWithoutDocuments(packet: RecoveryPacket): boolean {
  const documents = packet.sections
    .filter((section) => section.name.startsWith(DOCUMENT_PREFIX))
    .reduce(
      (sum, section) =>
        sum + byteLength(`\n\n## ${section.name}\n${section.text}`),
      0
    );
  return packet.bytes - documents > packet.budget;
}

/**
 * Assembles the packet by priority within `budgetBytes`. Mandatory sections
 * and required documents always stay; when the mandatory sections alone do
 * not fit, long task fields are shortened with a marker, step by step.
 * Optional sections move to references when they do not fit, the last added
 * first. Nothing is cut silently: an oversized packet says so.
 */
export function assemblePacket(input: RecoveryInput): RecoveryPacket {
  let packet = assembleWithCap(input, null);
  for (const cap of TASK_CAPS) {
    if (!(packet.overBudget && overWithoutDocuments(packet))) {
      break;
    }
    packet = assembleWithCap(input, cap);
  }
  return packet;
}
