import { ARENA, BODY_DEFS } from './ringout-data.mjs';

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
const other = actor => actor === 'player' ? 'npc' : 'player';
function bodyFor(id) {
  if (!Object.hasOwn(BODY_DEFS, id)) throw new TypeError(`사용할 수 없는 몸체: ${id}`);
  return BODY_DEFS[id];
}

function randomSequence(seed) {
  let value = seed >>> 0;
  // Mulberry32: reproducible local variation, with no dependence on wall time or input.
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ mixed >>> 15, mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, mixed | 61);
    return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
  };
}

/** Pure ground simulation. Consumers read state, provide elapsed ACTIVE seconds,
 * and consume returned events once. No DOM, callbacks, promises, timers or rendering.
 * The owning UI disposes an old match before replacement and resets its frame clock
 * on pause/resume. Public state is mutable only to permit controlled physics tests.
 */
export function createMatch({ playerBody = 'tomato', opponentBody = 'sweet-potato', seed = 1 } = {}) {
  bodyFor(playerBody); bodyFor(opponentBody);
  if (!Number.isFinite(seed)) throw new TypeError('유효한 난수 시드가 필요합니다.');
  const actor = (id, bodyId, z) => ({ id, bodyId, x: 0, z, vx: 0, vz: 0, out: false, fallTime: 0 });
  const state = {
    phase: 'aiming', turn: 'player', paused: false, disposed: false,
    shots: 0, shotTime: 0, result: null,
    actors: { player: actor('player', playerBody, 2.25), npc: actor('npc', opponentBody, -2.25) },
  };
  const actors = Object.values(state.actors);
  const random = randomSequence(seed);
  let accumulator = 0, restTime = 0, npcIntent = null;

  function markOut(events) {
    for (const piece of actors) {
      if (!piece.out && piece.x ** 2 + piece.z ** 2 > ARENA.radius ** 2) {
        piece.out = true;
        piece.fallTime = 0;
        events.push({ type: 'out', actor: piece.id });
      }
    }
  }

  function collide(events) {
    const [a, b] = actors;
    if (a.out || b.out) return;
    const bodyA = bodyFor(a.bodyId), bodyB = bodyFor(b.bodyId);
    const dx = b.x - a.x, dz = b.z - a.z;
    const distance = Math.hypot(dx, dz), radii = bodyA.radius + bodyB.radius;
    if (distance >= radii) return;
    const nx = distance > 1e-10 ? dx / distance : 1;
    const nz = distance > 1e-10 ? dz / distance : 0;
    const inverseA = 1 / bodyA.mass, inverseB = 1 / bodyB.mass;
    const inverseTotal = inverseA + inverseB;
    // Separate overlaps by inverse mass even when the pieces already move apart.
    const overlap = radii - distance;
    a.x -= nx * overlap * inverseA / inverseTotal;
    a.z -= nz * overlap * inverseA / inverseTotal;
    b.x += nx * overlap * inverseB / inverseTotal;
    b.z += nz * overlap * inverseB / inverseTotal;
    const relativeSpeed = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
    if (relativeSpeed >= 0) return;
    const impulse = -(1 + ARENA.restitution) * relativeSpeed / inverseTotal;
    a.vx -= impulse * nx * inverseA;
    a.vz -= impulse * nz * inverseA;
    b.vx += impulse * nx * inverseB;
    b.vz += impulse * nz * inverseB;
    if (-relativeSpeed > .02) events.push({ type: 'collision', speed: -relativeSpeed });
  }

  function finishShot(events, timedOut) {
    for (const piece of actors) { piece.vx = 0; piece.vz = 0; }
    const { player, npc } = state.actors;
    if (player.out && npc.out) state.result = { outcome: 'draw', reason: 'both-out' };
    else if (player.out) state.result = { outcome: 'loss', reason: 'ringout' };
    else if (npc.out) state.result = { outcome: 'win', reason: 'ringout' };
    else if (state.shots >= ARENA.maxShots) state.result = { outcome: 'draw', reason: 'turn-limit' };
    if (state.result) {
      state.result = Object.freeze(state.result);
      state.phase = 'finished';
      events.push({ type: 'result', result: state.result });
    } else {
      state.turn = other(state.turn);
      state.phase = 'aiming';
      events.push({ type: 'settled', shot: state.shots, turn: state.turn, timedOut });
    }
    npcIntent = null;
    accumulator = 0;
  }

  function fixedStep(events) {
    const dt = ARENA.fixedStep;
    state.shotTime += dt;
    for (const piece of actors) {
      if (piece.out) {
        piece.fallTime = Math.min(ARENA.fallSeconds, piece.fallTime + dt);
        // A departing piece keeps some lateral animation but never collides again.
        piece.x += piece.vx * dt * .35;
        piece.z += piece.vz * dt * .35;
      } else {
        piece.x += piece.vx * dt;
        piece.z += piece.vz * dt;
      }
    }
    markOut(events);
    collide(events);
    markOut(events); // Mass-weighted separation can also push a center across the edge.
    for (const piece of actors) {
      if (piece.out) continue;
      const speed = Math.hypot(piece.vx, piece.vz);
      const nextSpeed = Math.max(0, speed - bodyFor(piece.bodyId).friction * dt);
      if (nextSpeed <= ARENA.restSpeed) { piece.vx = 0; piece.vz = 0; }
      else { piece.vx *= nextSpeed / speed; piece.vz *= nextSpeed / speed; }
    }
    const resting = actors.every(piece => piece.out || (piece.vx === 0 && piece.vz === 0));
    restTime = resting ? restTime + dt : 0;
    const timedOut = state.shotTime >= ARENA.maxShotSeconds;
    if (timedOut) for (const piece of actors) if (!piece.out) { piece.vx = 0; piece.vz = 0; }
    const fallsFinished = actors.every(piece => !piece.out || piece.fallTime >= ARENA.fallSeconds);
    // A first fall is not a result: ALL ground motion and falls must resolve together.
    if ((timedOut || restTime >= ARENA.settleHold) && fallsFinished) finishShot(events, timedOut);
  }

  return {
    state,
    snapshot: () => structuredClone(state),
    shoot(shot, actorId = 'player') {
      if (state.disposed || state.paused || state.phase !== 'aiming' || actorId !== state.turn || !shot) return false;
      const { x, z, power } = shot;
      if (![x, z, power].every(Number.isFinite) || power < ARENA.minPower) return false;
      const distance = Math.hypot(x, z);
      if (!Number.isFinite(distance) || distance < 1e-8) return false;
      const piece = state.actors[actorId];
      if (!piece || piece.out) return false;
      const body = bodyFor(piece.bodyId);
      const speed = clamp(power, 0, 1) * body.maxImpulse / body.mass;
      piece.vx = x / distance * speed;
      piece.vz = z / distance * speed;
      state.shots++;
      state.shotTime = 0;
      state.phase = 'moving';
      accumulator = 0; restTime = 0;
      return true;
    },
    advance(elapsedSeconds) {
      const events = [];
      if (state.disposed || state.paused || state.phase !== 'moving' || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return events;
      // Max legal per-step motion < .08 units, versus minimum summed collider radius
      // 1.28: bounded 120 Hz steps avoid tunneling for either body's legal impulses.
      // A long frame gap is discarded instead of becoming a backlog after hiding.
      accumulator += Math.min(elapsedSeconds, ARENA.maxFrameDelta);
      const maxSteps = Math.ceil(ARENA.maxFrameDelta / ARENA.fixedStep);
      for (let i = 0; i < maxSteps && accumulator + 1e-10 >= ARENA.fixedStep; i++) {
        accumulator = Math.max(0, accumulator - ARENA.fixedStep);
        fixedStep(events);
        if (state.phase !== 'moving') break;
      }
      return events;
    },
    planNpcShot() {
      if (state.disposed || state.paused || state.phase !== 'aiming' || state.turn !== 'npc' || state.result) return null;
      if (npcIntent) return npcIntent;
      const { player, npc } = state.actors;
      const body = bodyFor(npc.bodyId), targetBody = bodyFor(player.bodyId);
      const distance = Math.hypot(player.x - npc.x, player.z - npc.z);
      const imperfectAngle = (random() - .5) * .74 + (random() < .22 ? (random() < .5 ? -.3 : .3) : 0);
      const angle = Math.atan2(player.z - npc.z, player.x - npc.x) + imperfectAngle;
      const travel = Math.max(.15, distance - body.radius - targetBody.radius) + 1.7;
      // A heavier target calls for more power; a lighter target needs restraint.
      // This estimates only from the present board and still uses shoot's legal cap.
      const preferredPower = Math.sqrt(2 * body.friction * travel * targetBody.mass / body.mass) * body.mass / body.maxImpulse;
      npcIntent = Object.freeze({
        x: Math.cos(angle), z: Math.sin(angle),
        power: clamp(preferredPower + (random() - .5) * .26, .3, 1),
      });
      return npcIntent;
    },
    pause() { if (!state.disposed) { state.paused = true; accumulator = 0; } },
    resume() { if (!state.disposed) { state.paused = false; accumulator = 0; } },
    dispose() { state.disposed = true; state.paused = true; accumulator = 0; npcIntent = null; },
  };
}
