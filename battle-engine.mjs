import { BATTLE_ROSTER, TEAM_SIZE, MAX_EXCHANGES } from './battle-data.mjs';

export function validateTeam(ids) {
  if (!Array.isArray(ids) || ids.length !== TEAM_SIZE || new Set(ids).size !== TEAM_SIZE) {
    throw new TypeError(`서로 다른 카드 ${TEAM_SIZE}장을 순서대로 골라 주세요.`);
  }
  // Array.from also exposes sparse slots, which Array.every would skip.
  if (!Array.from(ids).every(id => typeof id === 'string' && Object.hasOwn(BATTLE_ROSTER, id))) {
    throw new TypeError('사용할 수 없는 카드가 팀에 있습니다.');
  }
  return true;
}

function createTeam(ids, side) {
  return ids.map((id, slot) => {
    const card = BATTLE_ROSTER[id];
    return {
      key: `${side}:${slot}`, side, slot, id,
      attack: card.attack, baseAttack: card.attack, hp: card.hp, maxHp: card.hp,
      ability: card.ability, shieldReady: card.ability === 'shield',
      burstReady: card.ability === 'burst',
    };
  });
}

const snapshot = teams => Object.fromEntries(
  Object.entries(teams).map(([side, cards]) => [side, cards.map(card => ({ ...card }))]),
);
const survivors = team => team.filter(card => card.hp > 0);

/** Pure, deterministic simulation. Every call owns its combatants and event snapshots.
 * Hits are serialized for playback, but BOTH attacks are scheduled before damage.
 * No target changes, death cancellation, or overkill transfer within an exchange.
 */
export function simulateBattle(playerIds, opponentIds, { maxExchanges = MAX_EXCHANGES } = {}) {
  validateTeam(playerIds);
  validateTeam(opponentIds);
  if (!Number.isInteger(maxExchanges) || maxExchanges < 1 || maxExchanges > MAX_EXCHANGES) {
    throw new RangeError(`교환 한도는 1~${MAX_EXCHANGES} 사이의 정수여야 합니다.`);
  }

  const teams = { player: createTeam(playerIds, 'player'), opponent: createTeam(opponentIds, 'opponent') };
  const effects = [];
  for (const team of Object.values(teams)) {
    for (const card of team) {
      if (card.ability !== 'support') continue;
      const target = team[card.slot + 1];
      if (target) target.attack += 1;
      effects.push({ ability: 'support', source: card.key, target: target?.key ?? null, amount: target ? 1 : 0 });
    }
  }
  const events = [{ type: 'init', effects, teams: snapshot(teams) }];
  let exchanges = 0;

  while (exchanges < maxExchanges && survivors(teams.player).length && survivors(teams.opponent).length) {
    const player = survivors(teams.player)[0];
    const opponent = survivors(teams.opponent)[0];
    const attacks = [[player, opponent], [opponent, player]].map(([source, target]) => {
      const burst = source.ability === 'burst' && source.burstReady;
      source.burstReady = false;
      return { source: source.key, target: target.key, attack: source.attack, count: burst ? 2 : 1, burst };
    });
    const active = { player: player.key, opponent: opponent.key };
    const activeCards = new Map([player, opponent].map(card => [card.key, card]));
    const hits = [];
    for (let hit = 1; hit <= Math.max(...attacks.map(attack => attack.count)); hit++) {
      for (const attack of attacks) {
        if (hit > attack.count) continue;
        const target = activeCards.get(attack.target);
        const blocked = target.ability === 'shield' && target.shieldReady;
        const hpBefore = target.hp;
        if (blocked) target.shieldReady = false;
        else target.hp = Math.max(0, target.hp - attack.attack);
        hits.push({ source: attack.source, target: attack.target, hit, attack: attack.attack,
          blocked, damage: hpBefore - target.hp, hpBefore, hpAfter: target.hp });
      }
    }
    exchanges += 1;
    events.push({ type: 'exchange', number: exchanges, active, attacks, hits,
      defeated: [player, opponent].filter(card => card.hp === 0).map(card => card.key), teams: snapshot(teams) });
  }

  const remaining = Object.fromEntries(Object.entries(teams).map(([side, team]) => [side, survivors(team).map(card => card.key)]));
  const bothAlive = remaining.player.length > 0 && remaining.opponent.length > 0;
  const outcome = bothAlive || (!remaining.player.length && !remaining.opponent.length)
    ? 'draw' : remaining.player.length ? 'win' : 'loss';
  const reason = bothAlive ? 'exchange-limit' : 'elimination';
  const finalTeams = snapshot(teams);
  events.push({ type: 'result', outcome, reason, exchanges, remaining, teams: snapshot(teams) });
  return { outcome, reason, exchanges, teams: finalTeams, events };
}
