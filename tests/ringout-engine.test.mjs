import test from 'node:test';
import assert from 'node:assert/strict';
import { ARENA, BODY_DEFS } from '../ringout-data.mjs';
import { createMatch } from '../ringout-engine.mjs';

function settle(match, schedule = [1 / 60]) {
  const events = [];
  let frames = 0;
  while (match.state.phase === 'moving' && frames < 6000) {
    events.push(...match.advance(schedule[frames % schedule.length]));
    frames++;
  }
  assert.notEqual(match.state.phase, 'moving', 'every shot must settle within bounded active time');
  return events;
}

// Controlled positions/velocities isolate consequential edge and settlement rules.
function scenario(player, npc, shots = 0) {
  const match = createMatch({ seed: 17 });
  match.state.shots = shots;
  assert.equal(match.shoot({ x: 1, z: 0, power: .2 }), true);
  Object.assign(match.state.actors.player, { x: 0, z: 0, vx: 0, vz: 0 }, player);
  Object.assign(match.state.actors.npc, { x: 0, z: -2, vx: 0, vz: 0 }, npc);
  return match;
}

test('body IDs reject accidental prototype properties and data is immutable', () => {
  for (const bodyId of ['cabbage', '__proto__', 'toString', null]) {
    assert.throws(() => createMatch({ playerBody: bodyId }), TypeError);
    assert.throws(() => createMatch({ opponentBody: bodyId }), TypeError);
  }
  assert.ok(Object.isFrozen(BODY_DEFS));
  for (const body of Object.values(BODY_DEFS)) {
    assert.ok(Object.isFrozen(body));
    for (const key of ['mass', 'maxImpulse', 'friction', 'radius', 'visualScale']) assert.ok(body[key] > 0);
  }
});

test('mirror actors and separate matches never share mutable runtime state', () => {
  const a = createMatch({ playerBody: 'tomato', opponentBody: 'tomato' });
  const b = createMatch({ playerBody: 'tomato', opponentBody: 'tomato' });
  assert.notEqual(a.state.actors.player, a.state.actors.npc);
  assert.notEqual(a.state.actors.player, b.state.actors.player);
  a.state.actors.player.x = 1;
  assert.equal(a.state.actors.npc.x, 0);
  assert.equal(b.state.actors.player.x, 0);
});

test('one legal impulse immediately locks a turn; tiny, malformed and wrong-turn input cancel', () => {
  const match = createMatch();
  for (const shot of [null, {}, { x: 0, z: 0, power: 1 }, { x: NaN, z: -1, power: 1 },
    { x: 0, z: -1, power: Infinity }, { x: 0, z: -1, power: -1 },
    { x: 0, z: -1, power: ARENA.minPower / 2 }]) assert.equal(match.shoot(shot), false);
  assert.equal(match.shoot({ x: 0, z: -1, power: 1 }, 'npc'), false);
  assert.equal(match.state.shots, 0);
  assert.equal(match.shoot({ x: 0, z: -100, power: 5 }), true);
  const expectedSpeed = BODY_DEFS.tomato.maxImpulse / BODY_DEFS.tomato.mass;
  assert.equal(match.state.actors.player.vz, -expectedSpeed);
  const before = match.snapshot();
  assert.equal(match.shoot({ x: 1, z: 0, power: 1 }), false);
  assert.deepEqual(match.snapshot(), before);
  assert.equal(match.state.shots, 1);
});

for (const playerBody of Object.keys(BODY_DEFS)) for (const opponentBody of Object.keys(BODY_DEFS)) {
  test(`${playerBody} → ${opponentBody}: maximum power resolves a real collision without tunneling`, () => {
    const match = createMatch({ playerBody, opponentBody, seed: 4 });
    match.shoot({ x: 0, z: -1, power: 1 });
    const events = settle(match);
    assert.ok(events.some(event => event.type === 'collision'));
    assert.ok(match.state.actors.npc.z < -2.25);
    assert.ok(events.filter(event => event.type === 'result').length <= 1);
  });
}

test('lighter tomato has higher maximum launch speed and longer unobstructed travel', () => {
  const travel = bodyId => {
    const match = createMatch({ playerBody: bodyId });
    match.state.actors.player.z = 0;
    match.shoot({ x: 1, z: 0, power: .4 });
    const speed = match.state.actors.player.vx;
    settle(match);
    return { speed, distance: match.state.actors.player.x };
  };
  const tomato = travel('tomato'), sweet = travel('sweet-potato');
  assert.ok(tomato.speed > sweet.speed);
  assert.ok(tomato.distance > sweet.distance);
});

test('ground center at the radius is in; crossing the same visible outer radius is out', () => {
  const match = scenario({ x: ARENA.radius, z: 0 }, {});
  match.advance(ARENA.fixedStep);
  assert.equal(match.state.actors.player.out, false);
  match.state.actors.player.x += .0001;
  const events = match.advance(ARENA.fixedStep);
  assert.equal(match.state.actors.player.out, true);
  assert.ok(events.some(event => event.type === 'out' && event.actor === 'player'));
});

for (const [outcome, player, npc] of [
  ['win', {}, { x: 4.19, z: 0, vx: 1 }],
  ['loss', { x: 4.19, z: 0, vx: 1 }, {}],
  ['draw', { x: 4.19, z: 0, vx: 1 }, { x: -4.19, z: 0, vx: -1 }],
]) test(`whole-shot ${outcome} resolves once after all movement/falls`, () => {
  const match = scenario(player, npc);
  const events = settle(match);
  assert.equal(match.state.result.outcome, outcome);
  assert.equal(events.filter(event => event.type === 'result').length, 1);
  assert.deepEqual(match.advance(100), []);
  assert.equal(match.shoot({ x: 0, z: -1, power: 1 }), false);
  assert.equal(match.planNpcShot(), null);
});

test('early opponent fall cannot award a win while player is still sliding out', () => {
  const match = scenario({ x: 3.6, z: 0, vx: 1.6 }, { x: -4.19, z: 0, vx: -1 });
  match.advance(.1);
  assert.equal(match.state.actors.npc.out, true);
  assert.equal(match.state.actors.player.out, false);
  assert.equal(match.state.result, null);
  settle(match);
  assert.equal(match.state.result.outcome, 'draw');
  assert.equal(match.state.result.reason, 'both-out');
});

test('twenty individual shots end a finite match; a final ringout has priority', () => {
  const match = createMatch();
  for (let shot = 0; shot < ARENA.maxShots; shot++) {
    assert.equal(match.state.turn, shot % 2 ? 'npc' : 'player');
    assert.equal(match.shoot({ x: 1, z: 0, power: ARENA.minPower + .001 }, match.state.turn), true);
    settle(match);
  }
  assert.equal(match.state.shots, 20);
  assert.deepEqual(match.state.result, { outcome: 'draw', reason: 'turn-limit' });
  const finalRingout = scenario({}, { x: 4.19, z: 0, vx: 1 }, 19);
  settle(finalRingout);
  assert.deepEqual(finalRingout.state.result, { outcome: 'win', reason: 'ringout' });
});

test('identical input and seed settle identically under tested elapsed-time render schedules', () => {
  const schedules = [[1 / 30], [1 / 60], [1 / 144], [1 / 120, 1 / 40, 1 / 72, 1 / 24]];
  const snapshots = schedules.map(schedule => {
    const match = createMatch({ seed: 123 });
    match.shoot({ x: .12, z: -1, power: .72 });
    settle(match, schedule);
    if (!match.state.result) {
      assert.equal(match.shoot(match.planNpcShot(), 'npc'), true);
      settle(match, schedule);
    }
    return match.snapshot();
  });
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
});

test('equal active elapsed time also gives equal moving positions before shot settlement', () => {
  const snapshots = [[1 / 30], [1 / 60], [1 / 144], [1 / 24, 1 / 100, 1 / 72]].map(schedule => {
    const match = createMatch({ seed: 53 });
    match.shoot({ x: .2, z: -1, power: 1 });
    let elapsed = 0, frame = 0;
    while (elapsed < .9 - 1e-12) {
      const delta = Math.min(.9 - elapsed, schedule[frame++ % schedule.length]);
      match.advance(delta);
      elapsed += delta;
    }
    assert.equal(match.state.phase, 'moving');
    return match.snapshot();
  });
  for (const snapshot of snapshots.slice(1)) assert.deepEqual(snapshot, snapshots[0]);
});

test('pause discards elapsed hidden time and oversized frame gaps never become a backlog', () => {
  const paused = createMatch(), baseline = createMatch();
  for (const match of [paused, baseline]) {
    match.shoot({ x: .2, z: -1, power: .8 });
    match.advance(.1);
  }
  paused.pause();
  const before = paused.snapshot();
  assert.deepEqual(paused.advance(1000), []);
  assert.deepEqual(paused.snapshot(), before);
  assert.equal(paused.shoot({ x: 0, z: -1, power: 1 }), false);
  paused.resume();
  paused.advance(ARENA.fixedStep);
  baseline.advance(ARENA.fixedStep);
  assert.deepEqual(paused.snapshot(), baseline.snapshot());
  paused.advance(60);
  baseline.advance(ARENA.maxFrameDelta);
  assert.deepEqual(paused.snapshot(), baseline.snapshot());
  paused.advance(ARENA.fixedStep);
  baseline.advance(ARENA.fixedStep);
  assert.deepEqual(paused.snapshot(), baseline.snapshot());
});

test('dispose during motion invalidates old match work and cannot affect a replay', () => {
  const old = createMatch(), replay = createMatch();
  old.shoot({ x: 0, z: -1, power: 1 });
  old.advance(.1);
  old.dispose();
  const before = old.snapshot(), fresh = replay.snapshot();
  assert.deepEqual(old.advance(100), []);
  assert.equal(old.shoot({ x: 0, z: -1, power: 1 }), false);
  assert.equal(old.planNpcShot(), null);
  old.resume();
  assert.deepEqual(old.snapshot(), before);
  assert.deepEqual(replay.snapshot(), fresh);
});

test('NPC intent is seeded, cached, bounded by player physics, and can miss', () => {
  let misses = 0;
  const directions = new Set();
  for (let seed = 1; seed <= 48; seed++) {
    const match = createMatch({ seed }), same = createMatch({ seed });
    for (const current of [match, same]) current.state.turn = 'npc';
    const shot = match.planNpcShot();
    assert.deepEqual(shot, same.planNpcShot());
    assert.deepEqual(shot, match.planNpcShot(), 'repeated reads cannot reroll the NPC');
    assert.ok(shot.power >= ARENA.minPower && shot.power <= 1);
    assert.ok(Math.abs(Math.hypot(shot.x, shot.z) - 1) < 1e-12);
    directions.add(shot.x.toFixed(5));
    assert.equal(match.shoot(shot, 'npc'), true);
    const actor = match.state.actors.npc, body = BODY_DEFS[actor.bodyId];
    assert.ok(Math.hypot(actor.vx, actor.vz) <= body.maxImpulse / body.mass + 1e-12);
    if (!settle(match).some(event => event.type === 'collision')) misses++;
  }
  assert.ok(directions.size > 10);
  assert.ok(misses > 0, 'bounded aiming error must allow genuine simulated misses');
  const finished = scenario({ x: 5, z: 0 }, { x: -5, z: 0 });
  settle(finished);
  assert.equal(finished.planNpcShot(), null);
});

test('shot timeout safely ends pathological drift and elapsed input is validated', () => {
  const match = createMatch();
  for (const delta of [NaN, Infinity, -1, '1']) assert.deepEqual(match.advance(delta), []);
  match.shoot({ x: 1, z: 0, power: .2 });
  match.state.shotTime = ARENA.maxShotSeconds;
  match.state.actors.player.vx = .1;
  settle(match);
  assert.equal(match.state.actors.player.vx, 0);
  assert.equal(match.state.phase, 'aiming');
});

test('192 complete seeded matches are finite, award once, and both bodies can beat either opponent', () => {
  for (const playerBody of Object.keys(BODY_DEFS)) for (const opponentBody of Object.keys(BODY_DEFS)) {
    let wins = 0;
    for (let seed = 1; seed <= 48; seed++) {
      const match = createMatch({ playerBody, opponentBody, seed });
      let inputSeed = seed + 12345, awards = 0;
      const random = () => ((inputSeed = Math.imul(inputSeed, 1664525) + 1013904223 >>> 0) / 4294967296);
      while (!match.state.result) {
        const { player, npc } = match.state.actors;
        const angle = Math.atan2(npc.z - player.z, npc.x - player.x) + (random() - .5) * .44;
        const shot = match.state.turn === 'npc' ? match.planNpcShot()
          : { x: Math.cos(angle), z: Math.sin(angle), power: .75 + random() * .25 };
        assert.equal(match.shoot(shot, match.state.turn), true);
        awards += settle(match).filter(event => event.type === 'result').length;
        assert.ok(match.state.shots <= ARENA.maxShots);
        for (const piece of Object.values(match.state.actors)) {
          for (const value of [piece.x, piece.z, piece.vx, piece.vz, piece.fallTime]) assert.ok(Number.isFinite(value));
        }
      }
      assert.equal(awards, 1);
      if (match.state.result.outcome === 'win') wins++;
    }
    assert.ok(wins > 0, `${playerBody} must remain viable against ${opponentBody}`);
  }
});
