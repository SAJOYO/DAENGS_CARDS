import { CARDS } from './cards.mjs';

export const TEAM_SIZE = 3;
export const MAX_EXCHANGES = 100;

export const ABILITIES = Object.freeze({
  shield: Object.freeze({ label: '방어', description: '처음 받는 타격 1회를 완전히 막아요.' }),
  support: Object.freeze({ label: '지원', description: '시작할 때 바로 뒤 카드의 공격 +1. 마지막 칸에서는 효과가 없어요.' }),
  burst: Object.freeze({ label: '연타', description: '처음 맞붙을 때 2번 공격해요. 방어는 첫 타격만 막아요.' }),
});

// Playable roster, keyed by stable catalog ID. Printed stat/rarity are NOT combat power.
// An additional card with an existing ability needs only its catalog entry/art and this row.
const combatValues = {
  cabbage: { attack: 2, hp: 7, ability: 'shield' },
  danhobak: { attack: 1, hp: 10, ability: 'shield' },
  lettuce: { attack: 2, hp: 4, ability: 'support' },
  broccoli: { attack: 1, hp: 7, ability: 'support' },
  'sweet-potato': { attack: 3, hp: 5, ability: 'burst' },
  tomato: { attack: 4, hp: 3, ability: 'burst' },
};

export const BATTLE_ROSTER = Object.freeze(Object.fromEntries(
  Object.entries(combatValues).map(([id, values]) => {
    const card = CARDS.find(card => card.id === id);
    if (!card) throw new Error(`전투 카드의 도감 정보가 없습니다: ${id}`);
    if (!Object.hasOwn(ABILITIES, values.ability)) throw new Error(`알 수 없는 능력: ${values.ability}`);
    const { ko: name, art, w, h } = card;
    return [id, Object.freeze({ id, name, art, w, h, ...values })];
  }),
));

export const PRACTICE_NPCS = Object.freeze([
  { id: 'defense', name: '방어 연습', note: '첫 타격을 막는 단단한 앞줄', lineup: ['cabbage', 'danhobak', 'broccoli'] },
  { id: 'support', name: '지원 연습', note: '뒤 카드에 힘을 보태는 배치', lineup: ['lettuce', 'sweet-potato', 'cabbage'] },
  { id: 'burst', name: '연타 연습', note: '첫 교환에 몰아치는 공격', lineup: ['tomato', 'sweet-potato', 'lettuce'] },
].map(npc => Object.freeze({ ...npc, lineup: Object.freeze(npc.lineup) })));
