import test from 'node:test';
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { CARDS } from '../cards.mjs';
import { ABILITIES, BATTLE_ROSTER, MAX_EXCHANGES, PRACTICE_NPCS } from '../battle-data.mjs';
import { simulateBattle, validateTeam } from '../battle-engine.mjs';

const defense = PRACTICE_NPCS.find(npc => npc.id === 'defense').lineup;
const burst = PRACTICE_NPCS.find(npc => npc.id === 'burst').lineup;
const exchanges = report => report.events.filter(event => event.type === 'exchange');

test('playable metadata resolves to existing art without using printed power', async () => {
  for (const [id, card] of Object.entries(BATTLE_ROSTER)) {
    const original = CARDS.find(item => item.id === id);
    assert.equal(card.id, id);
    assert.equal(card.art, original.art);
    assert.deepEqual([card.w, card.h], [original.w, original.h]);
    assert.ok(Number.isInteger(card.attack) && card.attack > 0);
    assert.ok(Number.isInteger(card.hp) && card.hp > 0);
    assert.ok(Object.hasOwn(ABILITIES, card.ability));
    assert.equal(Object.hasOwn(card, 'stat'), false);
    assert.equal(Object.hasOwn(card, 'rarity'), false);
    await access(new URL(`../${card.art}`, import.meta.url));
  }
});

test('Shield blocks only the first individual Burst hit and never refreshes', () => {
  const report = simulateBattle(defense, burst);
  const [first, second] = exchanges(report);
  const received = first.hits.filter(hit => hit.target === 'player:0');
  assert.deepEqual(received.map(hit => [hit.hit, hit.blocked, hit.damage, hit.hpAfter]), [
    [1, true, 0, 7], [2, false, 4, 3],
  ]);
  assert.equal(first.teams.player[0].shieldReady, false);
  assert.equal(second.hits.find(hit => hit.target === 'player:0').blocked, false);
  assert.equal(second.attacks.find(attack => attack.source === 'opponent:0').count, 1);
});

test('Support targets only the original immediately following slot, once, on both teams', () => {
  const lineup = ['lettuce', 'broccoli', 'tomato'];
  const report = simulateBattle(lineup, lineup);
  const init = report.events[0];
  for (const side of ['player', 'opponent']) {
    assert.deepEqual(init.teams[side].map(card => card.attack), [2, 2, 5]);
    assert.deepEqual(report.teams[side].map(card => card.attack), [2, 2, 5]);
    assert.deepEqual(init.effects.filter(effect => effect.source.startsWith(side)).map(effect => effect.target),
      [`${side}:1`, `${side}:2`]);
  }
  // A defeated Support card never re-targets or grants a second bonus.
  assert.ok(exchanges(report).some(event => event.teams.player[0].hp === 0));
  assert.ok(exchanges(report).every(event => event.teams.player[2].attack === 5));
});

test('Support in the last slot has no target or self-bonus', () => {
  const report = simulateBattle(['cabbage', 'tomato', 'lettuce'], defense);
  assert.deepEqual(report.events[0].teams.player.map(card => card.attack), [2, 4, 2]);
  assert.deepEqual(report.events[0].effects.find(effect => effect.source === 'player:2'),
    { ability: 'support', source: 'player:2', target: null, amount: 0 });
});

test('lethal damage cannot cancel a scheduled Burst hit; overkill never reaches successors', () => {
  const report = simulateBattle(['tomato', 'cabbage', 'danhobak'], ['sweet-potato', 'cabbage', 'danhobak']);
  const [first, second] = exchanges(report);
  assert.equal(first.hits.length, 4);
  assert.deepEqual(first.defeated, ['player:0', 'opponent:0']);
  const lateHit = first.hits.find(hit => hit.source === 'player:0' && hit.hit === 2);
  assert.equal(lateHit.damage, 1); // Tomato was already dead after the first hit wave.
  assert.equal(lateHit.hpAfter, 0);
  for (const side of ['player', 'opponent']) {
    assert.equal(first.teams[side][1].hp, 7);
    assert.equal(first.teams[side][1].shieldReady, true);
    assert.equal(first.teams[side][2].hp, 10);
  }
  assert.deepEqual(second.active, { player: 'player:1', opponent: 'opponent:1' });
});

test('a surviving combatant retains HP and spent abilities when a successor enters', () => {
  const report = simulateBattle(['cabbage', 'danhobak', 'broccoli'], ['lettuce', 'tomato', 'danhobak']);
  const rounds = exchanges(report);
  const replacementIndex = rounds.findIndex((event, i) => i > 0
    && event.active.player === rounds[i - 1].active.player
    && event.active.opponent !== rounds[i - 1].active.opponent);
  assert.ok(replacementIndex > 0);
  const previous = rounds[replacementIndex - 1].teams.player[0];
  const next = rounds[replacementIndex];
  const hit = next.hits.find(hit => hit.target === 'player:0');
  assert.equal(hit.hpBefore, previous.hp);
  assert.equal(previous.shieldReady, false);
  assert.equal(hit.blocked, false);
});

test('simultaneous final elimination is a draw', () => {
  const report = simulateBattle(burst, burst);
  assert.equal(report.outcome, 'draw');
  assert.equal(report.reason, 'elimination');
  assert.ok(Object.values(report.teams).flat().every(card => card.hp === 0));
  assert.equal(exchanges(report).at(-1).defeated.length, 2);
});

test('a finite exchange limit returns an explicit draw and rejects invalid limits', () => {
  const report = simulateBattle(defense, defense, { maxExchanges: 1 });
  assert.equal(report.outcome, 'draw');
  assert.equal(report.reason, 'exchange-limit');
  assert.equal(report.exchanges, 1);
  assert.equal(report.events.at(-1).reason, 'exchange-limit');
  for (const maxExchanges of [0, -1, 1.5, Infinity, NaN, 101, '10']) {
    assert.throws(() => simulateBattle(defense, defense, { maxExchanges }), RangeError);
  }
});

test('teams must contain exactly three distinct, playable IDs (also for opponents)', () => {
  const sparse = ['cabbage', 'danhobak', 'tomato'];
  delete sparse[1];
  const invalid = [null, undefined, 'cabbage', [], ['cabbage'], [...defense, 'tomato'],
    ['cabbage', 'cabbage', 'tomato'], ['cabbage', 'pepper', 'tomato'],
    ['cabbage', 'toString', 'tomato'], ['cabbage', '__proto__', 'tomato'],
    ['cabbage', null, 'tomato'], sparse];
  for (const team of invalid) {
    assert.throws(() => validateTeam(team), TypeError);
    assert.throws(() => simulateBattle(team, defense), TypeError);
    assert.throws(() => simulateBattle(defense, team), TypeError);
  }
  assert.equal(validateTeam(defense), true);
});

test('identical lineups replay deterministically, including every event', () => {
  assert.deepEqual(simulateBattle(defense, burst), simulateBattle([...defense], [...burst]));
});

test('each side, event snapshot, and repeated battle has independent state', () => {
  const catalogBefore = JSON.stringify(CARDS);
  const rosterBefore = JSON.stringify(BATTLE_ROSTER);
  const input = Object.freeze(['lettuce', 'cabbage', 'tomato']);
  const report = simulateBattle(input, input);
  const expected = simulateBattle(input, input);
  const init = report.events[0];
  assert.notStrictEqual(init.teams.player[1], init.teams.opponent[1]);
  assert.notEqual(init.teams.player[1].key, init.teams.opponent[1].key);
  assert.equal(init.teams.player[1].hp, 7);
  assert.equal(init.teams.player[1].shieldReady, true);
  report.teams.player[1].hp = 999;
  report.events[1].teams.player[1].attack = 999;
  assert.equal(init.teams.player[1].attack, 3);
  assert.notEqual(report.teams.opponent[1].hp, 999);
  assert.deepEqual(simulateBattle(input, input), expected);
  assert.equal(JSON.stringify(CARDS), catalogBefore);
  assert.equal(JSON.stringify(BATTLE_ROSTER), rosterBefore);
  assert.deepEqual(input, ['lettuce', 'cabbage', 'tomato']);
});

function orderedTeams(ids) {
  return ids.flatMap(a => ids.filter(b => b !== a).flatMap(b =>
    ids.filter(c => c !== a && c !== b).map(c => [a, b, c])));
}

test('every ordered team terminates against every NPC; changing order can change outcome', () => {
  const ids = Object.keys(BATTLE_ROSTER);
  const teams = orderedTeams(ids);
  assert.equal(teams.length, ids.length * (ids.length - 1) * (ids.length - 2));
  const counts = [];
  const examples = [];
  let total = 0;
  let maxExchanges = 0;
  for (const npc of PRACTICE_NPCS) {
    const count = { npc: npc.id, win: 0, draw: 0, loss: 0 };
    const seen = new Map();
    for (const team of teams) {
      const report = simulateBattle(team, npc.lineup);
      assert.ok(['win', 'draw', 'loss'].includes(report.outcome));
      assert.ok(report.exchanges > 0 && report.exchanges <= MAX_EXCHANGES);
      assert.equal(report.reason, 'elimination');
      assert.equal(report.events.at(-1).type, 'result');
      const alive = Object.fromEntries(Object.entries(report.teams).map(([side, cards]) =>
        [side, cards.filter(card => card.hp > 0).length]));
      if (report.outcome === 'win') assert.ok(alive.player > 0 && alive.opponent === 0);
      if (report.outcome === 'loss') assert.ok(alive.player === 0 && alive.opponent > 0);
      if (report.outcome === 'draw') assert.equal(alive.player + alive.opponent, 0);
      for (const event of report.events) {
        for (const card of Object.values(event.teams).flat()) {
          assert.ok(Number.isInteger(card.hp) && card.hp >= 0 && card.hp <= card.maxHp);
        }
      }
      for (const event of exchanges(report)) {
        for (const hit of event.hits) {
          assert.ok(Object.values(event.active).includes(hit.target));
          assert.ok(hit.hpAfter >= 0 && hit.hpAfter <= hit.hpBefore);
        }
      }
      assert.deepEqual(report, simulateBattle(team, npc.lineup));
      count[report.outcome]++;
      total++;
      maxExchanges = Math.max(maxExchanges, report.exchanges);
      const group = [...team].sort().join(',');
      const previous = seen.get(group);
      if (previous && previous.outcome !== report.outcome && !examples.some(example => example.npc === npc.id)) {
        examples.push({ npc: npc.id, first: previous, reordered: { team, outcome: report.outcome } });
      }
      if (!previous) seen.set(group, { team, outcome: report.outcome });
    }
    assert.equal(count.win + count.draw + count.loss, teams.length);
    counts.push(count);
  }
  assert.ok(examples.length > 0, 'at least one identical set of three cards changes outcome by order');
  console.log(JSON.stringify({ orderedTeams: teams.length, simulations: total, maxExchanges, counts, orderExamples: examples }, null, 2));
});
