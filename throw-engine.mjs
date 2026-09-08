import { THROW_ROSTER, NPC_POSITIONS, ROUND_LIMIT } from './throw-data.mjs';

function profileFor(id) {
  if (!Object.hasOwn(THROW_ROSTER, id)) throw new TypeError(`사용할 수 없는 캐릭터: ${id}`);
  return THROW_ROSTER[id];
}

/** One full cycle is 0 → 1 → 0. Rendering and input pass the same active clock. */
export function gaugePosition(elapsedMs, cycleMs) {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0 || !Number.isFinite(cycleMs) || cycleMs <= 0) {
    throw new RangeError('유효한 활성 시간과 왕복 주기가 필요합니다.');
  }
  const phase = (elapsedMs % cycleMs) / cycleMs * 2;
  return phase <= 1 ? phase : 2 - phase;
}

export function evaluateShot(id, position) {
  const profile = profileFor(id);
  if (!Number.isFinite(position) || position < 0 || position > 1) throw new RangeError('위치는 0~1이어야 합니다.');
  const error = Math.abs(position - .5);
  // A few ulps preserve inclusive decimal boundaries such as .56 - .5 <= .06.
  const tolerance = Number.EPSILON * 4;
  const grade = error <= profile.perfectZone + tolerance ? 'perfect'
    : error <= profile.hitZone + tolerance ? 'hit' : 'miss';
  const damage = grade === 'perfect' ? profile.perfectDamage : grade === 'hit' ? profile.hitDamage : 0;
  return { position, error, grade, damage };
}

export function createMatch(playerId, npcId, matchId) {
  const player = profileFor(playerId), npc = profileFor(npcId);
  if (typeof matchId !== 'string' || !matchId) throw new TypeError('새 대결 ID가 필요합니다.');
  return { id: matchId, phase: 'intro', round: 1, completedRounds: 0, npcIndex: 0, shotCount: 0,
    actors: { player: { id: playerId, hp: player.hp }, npc: { id: npcId, hp: npc.hp } },
    pendingShot: null, lastShot: null, outcome: null, reason: null };
}

export function beginPlayerAim(match) {
  return ['intro', 'player-ready'].includes(match.phase) ? { ...match, phase: 'player-aim' } : match;
}

function queueShot(match, actor, position) {
  const target = actor === 'player' ? 'npc' : 'player';
  const shot = evaluateShot(match.actors[actor].id, position);
  const hpBefore = match.actors[target].hp;
  return { ...match, phase: `${actor}-shot`, shotCount: match.shotCount + 1,
    pendingShot: Object.freeze({ ...shot, matchId: match.id, id: `${match.id}/${match.shotCount + 1}`,
      actor, target, characterId: match.actors[actor].id, round: match.round,
      hpBefore, hpAfter: Math.max(0, hpBefore - shot.damage), actualDamage: Math.min(hpBefore, shot.damage) }) };
}

export function lockPlayerShot(match, position) {
  return match.phase === 'player-aim' ? queueShot(match, 'player', position) : match;
}

export function queueNpcShot(match) {
  if (match.phase !== 'npc-ready') return match;
  const shot = queueShot(match, 'npc', NPC_POSITIONS[match.npcIndex % NPC_POSITIONS.length]);
  return { ...shot, npcIndex: match.npcIndex + 1 };
}

/** The renderer supplies only identity. Damage always comes from the owned pending shot.
 * Duplicate, late, cross-match, and out-of-phase notifications are no-ops.
 */
export function resolveShot(match, matchId, shotId) {
  const shot = match.pendingShot;
  if (matchId !== match.id || !shot || shot.id !== shotId || match.phase !== `${shot.actor}-shot`) return match;
  const actors = { ...match.actors, [shot.target]: { ...match.actors[shot.target], hp: shot.hpAfter } };
  const completedRounds = match.completedRounds + (shot.actor === 'npc' ? 1 : 0);
  const ko = actors[shot.target].hp === 0;
  const limited = completedRounds >= ROUND_LIMIT;
  const terminal = ko || limited;
  const outcome = !terminal ? null : actors.player.hp === actors.npc.hp ? 'draw'
    : ko ? (shot.target === 'npc' ? 'win' : 'loss') : actors.player.hp > actors.npc.hp ? 'win' : 'loss';
  return { ...match, actors, pendingShot: null, lastShot: shot, completedRounds,
    phase: terminal ? 'result' : shot.actor === 'player' ? 'npc-ready' : 'player-ready',
    round: !terminal && shot.actor === 'npc' ? match.round + 1 : match.round,
    outcome, reason: terminal ? (ko ? 'ko' : 'round-limit') : null };
}

// Immutable clock state makes hide/resume behavior testable without a browser or timers.
export const createClock = now => ({ elapsed: 0, since: now, paused: false });
export const clockTime = (clock, now) => clock.elapsed + (clock.paused ? 0 : Math.max(0, now - clock.since));
export function pauseClock(clock, now) {
  return clock.paused ? clock : { elapsed: clockTime(clock, now), since: now, paused: true };
}
export function resumeClock(clock, now) {
  return clock.paused ? { ...clock, since: now, paused: false } : clock;
}
