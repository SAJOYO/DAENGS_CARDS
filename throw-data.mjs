import { CARDS } from './cards.mjs';

export const ROUND_LIMIT = 20;
export const NPC_POSITIONS = Object.freeze([0.60, 0.10, 0.38, 0.61, 0.52, 0.95]);
export const SHOT_TIMING = Object.freeze({ windup: 700, flight: 900, impact: 240, recovery: 860 });
export const INTRO_MS = 2200;
export const NPC_THINK_MS = 1100;
export const TURN_BREAK_MS = 500;

// This mode owns these values. Printed stat and visual rarity are never consulted.
const profiles = {
  cabbage: { hp: 30, cycleMs: 1800, hitZone: .22, perfectZone: .06, hitDamage: 6, perfectDamage: 9,
    style: '균형 잡힌 한 방', color: '#bade6c', projectile: 'cabbage' },
  tomato: { hp: 30, cycleMs: 1300, hitZone: .28, perfectZone: .08, hitDamage: 5, perfectDamage: 8,
    style: '빠르고 넓은 타이밍', color: '#ff8e7d', projectile: 'tomato' },
  'sweet-potato': { hp: 30, cycleMs: 2200, hitZone: .16, perfectZone: .04, hitDamage: 8, perfectDamage: 12,
    style: '느리지만 묵직하게', color: '#d5a6ed', projectile: 'sweet-potato' },
};

export const THROW_ROSTER = Object.freeze(Object.fromEntries(Object.entries(profiles).map(([id, profile]) => {
  const card = CARDS.find(card => card.id === id);
  const subject = (card?.pop ?? card?.scene)?.subject;
  if (!subject) throw new Error(`투척 캐릭터 누끼가 없습니다: ${id}`);
  return [id, Object.freeze({ id, name: card.ko, art: card.art, w: card.w, h: card.h, subject, ...profile })];
})));
