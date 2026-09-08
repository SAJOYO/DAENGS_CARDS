import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS } from '../cards.mjs';
import { THROW_ROSTER, NPC_POSITIONS, ROUND_LIMIT } from '../throw-data.mjs';
import { gaugePosition, evaluateShot, createMatch, beginPlayerAim, lockPlayerShot,
  queueNpcShot, resolveShot, createClock, clockTime, pauseClock, resumeClock } from '../throw-engine.mjs';

const ids = Object.keys(THROW_ROSTER);
const resolve = match => resolveShot(match, match.id, match.pendingShot.id);
function freeze(value) {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
}
function play(player, npc, position, id = 'script') {
  let match = createMatch(player, npc, id);
  const events = [];
  for (let round = 0; round < ROUND_LIMIT && !match.outcome; round++) {
    match = resolve(lockPlayerShot(beginPlayerAim(freeze(match)), position));
    events.push(match.lastShot);
    if (!match.outcome) { match = resolve(queueNpcShot(freeze(match))); events.push(match.lastShot); }
  }
  assert.ok(['win', 'loss', 'draw'].includes(match.outcome), 'finite valid result');
  assert.ok(match.completedRounds <= ROUND_LIMIT);
  for (const actor of Object.values(match.actors)) assert.ok(actor.hp >= 0 && actor.hp <= THROW_ROSTER[actor.id].hp);
  assert.equal(new Set(events.map(event => event.id)).size, events.length);
  return { match, events };
}

for (const id of ids) test(`${id}: inclusive Perfect/Hit boundaries on both sides`, () => {
  const profile = THROW_ROSTER[id];
  for (const sign of [-1, 1]) {
    assert.equal(evaluateShot(id, .5 + sign * profile.perfectZone).grade, 'perfect');
    assert.equal(evaluateShot(id, .5 + sign * (profile.perfectZone + 1e-8)).grade, 'hit');
    assert.equal(evaluateShot(id, .5 + sign * profile.hitZone).grade, 'hit');
    assert.equal(evaluateShot(id, .5 + sign * (profile.hitZone + 1e-8)).grade, 'miss');
  }
  assert.equal(evaluateShot(id, .5).damage, profile.perfectDamage);
  assert.equal(evaluateShot(id, .5 + (profile.perfectZone + profile.hitZone) / 2).damage, profile.hitDamage);
  for (const p of [0, 1]) assert.equal(evaluateShot(id, p).damage, 0);
});

test('invalid roster IDs, positions, clocks and missing match identities are rejected', () => {
  for (const id of ['lettuce', 'missing', '__proto__', null]) {
    assert.throws(() => createMatch(id, 'tomato', 'invalid'), TypeError);
    assert.throws(() => createMatch('tomato', id, 'invalid'), TypeError);
    assert.throws(() => evaluateShot(id, .5), TypeError);
  }
  for (const p of [-.01, 1.01, NaN, Infinity, '0.5']) assert.throws(() => evaluateShot('cabbage', p), RangeError);
  assert.throws(() => createMatch('cabbage', 'tomato', ''), TypeError);
  for (const [elapsed, cycle] of [[-1, 1800], [Infinity, 1800], [0, 0], [0, NaN]]) {
    assert.throws(() => gaugePosition(elapsed, cycle), RangeError);
  }
});

test('gauge uses full elapsed-time cycles, independent of render frequency', () => {
  for (const { cycleMs } of Object.values(THROW_ROSTER)) {
    assert.deepEqual([0, .25, .5, .75, 1, 1.25].map(t => gaugePosition(t * cycleMs, cycleMs)), [0, .5, 1, .5, 0, .5]);
    for (const fps of [30, 60, 120, 144]) {
      // Intermediate samples have no state; the same final input time has the same result.
      for (let t = 0; t < 2379; t += 1000 / fps) gaugePosition(t, cycleMs);
      assert.equal(gaugePosition(2379, cycleMs), gaugePosition(2379 + cycleMs * 10, cycleMs));
    }
  }
});

test('paused time does not advance the gauge or accumulate hidden-tab time', () => {
  const clock = createClock(100);
  const paused = pauseClock(freeze(clock), 550);
  assert.equal(clockTime(paused, 50_000), 450);
  assert.equal(gaugePosition(clockTime(paused, 50_000), 1800), .5);
  assert.equal(pauseClock(paused, 60_000), paused);
  const resumed = resumeClock(freeze(paused), 60_000);
  assert.equal(clockTime(resumed, 60_000), 450);
  assert.equal(clockTime(resumed, 60_100), 550);
  assert.equal(resumeClock(resumed, 70_000), resumed);
  assert.equal(clockTime(pauseClock(resumed, 60_100), 100_000), 550);
});

test('input locks immediately; duplicate, late and cross-match impact events are ignored', () => {
  const intro = freeze(createMatch('cabbage', 'tomato', 'first'));
  assert.equal(lockPlayerShot(intro, .5), intro);
  assert.equal(queueNpcShot(intro), intro);
  const aimed = beginPlayerAim(intro);
  const queued = freeze(lockPlayerShot(aimed, .5));
  assert.equal(queued.actors.npc.hp, 30, 'HP changes at impact, not input');
  assert.equal(lockPlayerShot(queued, 0), queued);
  assert.equal(queueNpcShot(queued), queued);
  assert.equal(resolveShot(queued, 'old-match', queued.pendingShot.id), queued);
  assert.equal(resolveShot(queued, queued.id, 'old-shot'), queued);
  const impacted = freeze(resolve(queued));
  assert.equal(impacted.actors.npc.hp, 21);
  assert.equal(resolveShot(impacted, queued.id, queued.pendingShot.id), impacted);
  assert.equal(lockPlayerShot(impacted, .5), impacted);
  const npc = freeze(queueNpcShot(impacted));
  assert.equal(queueNpcShot(npc), npc);
  assert.equal(resolveShot(npc, queued.id, queued.pendingShot.id), npc);
  const retry = freeze(lockPlayerShot(beginPlayerAim(createMatch('cabbage', 'tomato', 'retry')), .5));
  assert.equal(resolveShot(retry, queued.id, queued.pendingShot.id), retry);
});

test('NPC follows its own profile and fixed repeating sequence; a new match resets it', () => {
  const first = play('tomato', 'cabbage', 0, 'first');
  const npcEvents = first.events.filter(event => event.actor === 'npc');
  assert.equal(npcEvents.length, 7, 'includes the first sequence wrap');
  for (const [index, event] of npcEvents.entries()) {
    assert.equal(event.position, NPC_POSITIONS[index % NPC_POSITIONS.length]);
    assert.equal(event.damage, evaluateShot('cabbage', event.position).damage);
  }
  const retry = createMatch('tomato', 'cabbage', 'retry');
  assert.equal(retry.npcIndex, 0);
  assert.equal(retry.round, 1);
  assert.equal(retry.pendingShot, null);
  assert.equal(retry.lastShot, null);
  assert.equal(retry.outcome, null);
  assert.equal(retry.shotCount, 0);
  assert.deepEqual(Object.values(retry.actors).map(actor => actor.hp), [30, 30]);
  // A different player shot still gives the NPC the same first position.
  const next = queueNpcShot(resolve(lockPlayerShot(beginPlayerAim(retry), .5)));
  assert.equal(next.pendingShot.position, NPC_POSITIONS[0]);
});

test('mirror actors are independent; input, catalog and profiles remain unchanged', () => {
  const catalog = JSON.stringify(CARDS), profiles = JSON.stringify(THROW_ROSTER);
  const initial = freeze(createMatch('cabbage', 'cabbage', 'mirror'));
  assert.notEqual(initial.actors.player, initial.actors.npc);
  const afterPlayer = resolve(lockPlayerShot(beginPlayerAim(initial), .5));
  assert.equal(afterPlayer.actors.player.hp, 30);
  assert.equal(afterPlayer.actors.npc.hp, 21);
  const afterNpc = resolve(queueNpcShot(afterPlayer));
  assert.equal(afterNpc.actors.player.hp, 24);
  assert.equal(afterNpc.actors.npc.hp, 21);
  assert.equal(initial.actors.npc.hp, 30);
  assert.equal(JSON.stringify(CARDS), catalog);
  assert.equal(JSON.stringify(THROW_ROSTER), profiles);
});

test('lethal shot clamps HP, reports actual damage and prevents retaliation', () => {
  const { match, events } = play('sweet-potato', 'cabbage', .5);
  assert.equal(match.outcome, 'win');
  assert.equal(match.reason, 'ko');
  assert.equal(match.actors.npc.hp, 0);
  assert.equal(events.at(-1).damage, 12);
  assert.equal(events.at(-1).actualDamage, 6);
  assert.equal(events.at(-1).actor, 'player');
  assert.equal(events.filter(event => event.actor === 'npc').length, 2);
  assert.equal(queueNpcShot(match), match);
  assert.equal(beginPlayerAim(match), match);
  assert.equal(lockPlayerShot(match, .5), match);
});

test('20 completed rounds compare remaining HP, including a draw', () => {
  for (const [playerHp, npcHp, outcome] of [[20, 15, 'win'], [15, 20, 'loss'], [15, 15, 'draw']]) {
    // Boundary fixture: 19 completed rounds; the next fixed NPC position is a miss.
    const nearLimit = freeze({ ...createMatch('cabbage', 'tomato', `limit-${outcome}`),
      phase: 'player-ready', round: 20, completedRounds: 19, npcIndex: 1,
      actors: { player: { id: 'cabbage', hp: playerHp }, npc: { id: 'tomato', hp: npcHp } } });
    const player = resolve(lockPlayerShot(beginPlayerAim(nearLimit), 0));
    assert.equal(player.phase, 'npc-ready', 'player half-round does not trigger the limit');
    const result = resolve(queueNpcShot(player));
    assert.equal(result.completedRounds, 20);
    assert.equal(result.phase, 'result');
    assert.equal(result.reason, 'round-limit');
    assert.equal(result.outcome, outcome);
  }
});

test('all 9 pairings × scripted Hit/Perfect/Miss terminate and replay deterministically', t => {
  const counts = {}, catalogBefore = JSON.stringify(CARDS);
  let scenarios = 0, maxRounds = 0;
  for (const grade of ['hit', 'perfect', 'miss']) {
    counts[grade] = { win: 0, draw: 0, loss: 0 };
    for (const player of ids) for (const npc of ids) {
      const profile = THROW_ROSTER[player];
      const position = grade === 'hit' ? .5 + (profile.perfectZone + profile.hitZone) / 2 : grade === 'perfect' ? .5 : 0;
      const first = play(player, npc, position);
      assert.deepEqual(first, play(player, npc, position));
      counts[grade][first.match.outcome]++;
      maxRounds = Math.max(maxRounds, first.match.round);
      scenarios++;
    }
  }
  assert.equal(JSON.stringify(CARDS), catalogBefore);
  assert.equal(scenarios, ids.length ** 2 * 3);
  t.diagnostic(JSON.stringify({ scenarios, counts, maxRounds }));
});
