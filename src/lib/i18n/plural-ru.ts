/*
 * Русское склонение количественных существительных.
 *
 *   pluralRu(1,  ['группа', 'группы', 'групп'])   // 'группа'
 *   pluralRu(4,  ['группа', 'группы', 'групп'])   // 'группы'
 *   pluralRu(12, ['группа', 'группы', 'групп'])   // 'групп' (11-14 exception)
 *   pluralRu(22, ['группа', 'группы', 'групп'])   // 'группы'
 *   pluralRu(54, ['группа', 'группы', 'групп'])   // 'группы'
 *   pluralRu(0,  ['группа', 'группы', 'групп'])   // 'групп'
 *
 * Формы: [nominative-1, paucal-2..4, genitive-plural-5+/11..14].
 */
export function pluralRu(
  n: number,
  forms: readonly [string, string, string],
): string {
  const abs = Math.abs(Math.trunc(n));
  const mod10 = abs % 10;
  const mod100 = abs % 100;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
