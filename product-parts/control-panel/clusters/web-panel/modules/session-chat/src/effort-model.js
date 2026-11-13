// @ts-check
const ORDER = ['low', 'medium', 'high', 'xhigh', 'max', 'ultra'];
/** @param {import('#provider-registry').SessionParameters | null} data */
export function effortOptions(data) {
  return [...(data?.items.find(i => i.id === 'effort')?.options ?? [])].sort((a, b) => {
    const rank = (/** @type {string} */ value) => ORDER.includes(value) ? ORDER.indexOf(value) : ORDER.length;
    return rank(a.value) - rank(b.value);
  });
}
/** @param {string | number} index @param {import('#provider-registry').ParameterOption[]} options */
export function effortChoice(index, options) {
  const number = Number(index);
  return Number.isInteger(number) && number >= 0 && number < options.length && !options[number]?.disabled ? options[number] : null;
}
