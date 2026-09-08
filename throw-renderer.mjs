import { THROW_ROSTER, SHOT_TIMING } from './throw-data.mjs';

export async function loadSubjects() {
  return new Map(await Promise.all(Object.values(THROW_ROSTER).map(async card => {
    const image = new Image();
    image.src = `./${card.subject}`;
    await image.decode();
    return [card.id, image];
  })));
}

function market(ctx, w, h) {
  ctx.fillStyle = '#30353e'; ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#252b36'; ctx.fillRect(0, h * .24, w, h * .53);
  const awning = ['#6b796d', '#b6aa8b'];
  for (let i = 0; i < 14; i++) {
    ctx.fillStyle = awning[i % 2]; ctx.fillRect(i * w / 14, 0, w / 14 + 1, h * .13);
    ctx.fillRect(i * w / 14, h * .13, w / 14 + 1, 7);
  }
  ctx.fillStyle = '#8f8571'; ctx.fillRect(0, h * .13 + 6, w, 3);
  ctx.fillStyle = '#4f5d59'; ctx.fillRect(w * .36, h * .22, w * .28, h * .27);
  ctx.fillStyle = '#2b3939'; ctx.fillRect(w * .37, h * .24, w * .26, h * .23);
  ctx.fillStyle = '#afb294'; ctx.textAlign = 'center'; ctx.font = `bold ${Math.max(10, w * .025)}px monospace`;
  ctx.fillText('NEO MARKET', w / 2, h * .33);
  ctx.font = `${Math.max(8, w * .012)}px monospace`; ctx.fillStyle = '#7f9a8c';
  ctx.fillText('FRESH / LOCAL / DAILY', w / 2, h * .40);
  for (const x of [w * .01, w * .72]) {
    ctx.fillStyle = '#45413c'; ctx.fillRect(x, h * .49, w * .27, h * .24);
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = '#655c49'; ctx.fillRect(x + i * w * .089, h * .52, w * .085, h * .17);
      ctx.fillStyle = '#433d36'; ctx.fillRect(x + i * w * .089, h * .59, w * .085, 3);
      ctx.fillStyle = i % 2 ? '#667753' : '#996950';
      for (let j = 0; j < 3; j++) {
        ctx.beginPath(); ctx.ellipse(x + i * w * .089 + w * (.017 + j * .024), h * .52, w * .014, h * .026, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.fillStyle = '#73684f'; ctx.fillRect(0, h * .77, w, h * .23);
  ctx.fillStyle = '#b0a185'; ctx.fillRect(0, h * .77, w, 3);
  ctx.strokeStyle = '#8b7f63'; ctx.lineWidth = 1;
  for (let i = -3; i < 10; i++) {
    ctx.beginPath(); ctx.moveTo(w / 2 + i * w * .16, h * .77); ctx.lineTo(w / 2 + i * w * .25, h); ctx.stroke();
  }
  for (const y of [.83, .93]) { ctx.beginPath(); ctx.moveTo(0, h * y); ctx.lineTo(w, h * y); ctx.stroke(); }
}

function actorPose(side, match, scene, time, reduced) {
  const pose = { x: 0, lift: 0, angle: 0, alpha: 1 };
  const facing = side === 'player' ? 1 : -1;
  if (match.actors[side].hp === 0) {
    pose.angle = facing * .35; pose.alpha = .6;
    return pose;
  }
  if (scene.phase === 'result') {
    const winner = match.outcome === (side === 'player' ? 'win' : 'loss');
    if (winner && !reduced) { pose.lift = Math.abs(Math.sin((time - scene.at) / 230)) * 9; pose.angle = Math.sin(time / 200) * .035; }
    return pose;
  }
  if (reduced) return pose;
  const shot = scene.shot;
  const t = time - scene.at;
  if (shot && scene.phase.endsWith('-shot') && shot.actor === side) {
    if (t < SHOT_TIMING.windup) {
      const anticipation = Math.sin(t / SHOT_TIMING.windup * Math.PI / 2);
      pose.x = -facing * 8 * anticipation; pose.angle = -facing * .10 * anticipation;
    } else {
      const recovery = Math.max(0, 1 - (t - SHOT_TIMING.windup) / 900);
      pose.x = facing * 9 * recovery; pose.angle = facing * .13 * recovery;
    }
  } else {
    pose.lift = Math.max(0, Math.sin(time / 390 + (side === 'npc' ? 1 : 0))) * 2;
  }
  if (shot?.target === side && scene.impactAt !== null && shot.grade !== 'miss') {
    const age = time - scene.impactAt;
    if (age >= 0 && age < 320) { pose.x += -facing * Math.sin(age / 45) * 5; pose.angle = -facing * .07 * (1 - age / 320); }
  }
  return pose;
}

/** Replace this one presentation function when real sprite frames exist.
 * These are the unmodified photographic cutouts, uniformly scaled and floor-pivoted.
 */
function drawCutout(ctx, image, point, pose, facing) {
  ctx.fillStyle = '#171d2577'; ctx.beginPath();
  ctx.ellipse(point.x, point.floor + 1, point.width * .39, 7, 0, 0, Math.PI * 2); ctx.fill();
  ctx.save();
  ctx.translate(point.x + pose.x, point.floor - pose.lift);
  ctx.rotate(pose.angle); ctx.scale(facing, 1); ctx.globalAlpha = pose.alpha;
  ctx.drawImage(image, -point.width / 2, -point.height, point.width, point.height);
  ctx.restore();
}

function projectile(ctx, kind, x, y, size, rotation) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
  ctx.lineWidth = 2; ctx.strokeStyle = '#302433';
  if (kind === 'sweet-potato') {
    ctx.fillStyle = '#b877af'; ctx.beginPath();
    ctx.moveTo(-size, 0); ctx.bezierCurveTo(-size * .3, -size, size * .8, -size * .6, size, 0);
    ctx.bezierCurveTo(size * .4, size * .9, -size * .7, size * .5, -size, 0); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#eccab2'; ctx.beginPath(); ctx.moveTo(-size * .5, 0); ctx.lineTo(size * .35, -size * .17); ctx.stroke();
  } else {
    ctx.fillStyle = kind === 'tomato' ? '#ef755e' : '#acd66f'; ctx.beginPath();
    ctx.ellipse(0, 0, size * .85, size, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (kind === 'cabbage') {
      ctx.strokeStyle = '#59864d';
      for (const dx of [-.35, .25]) { ctx.beginPath(); ctx.ellipse(size * dx, 0, size * .34, size * .8, dx, 0, Math.PI * 2); ctx.stroke(); }
    } else {
      ctx.fillStyle = '#628b4e'; ctx.beginPath(); ctx.moveTo(0, -size * 1.25);
      for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; ctx.lineTo(Math.cos(a) * size * .65, -size * .75 + Math.sin(a) * size * .35); }
      ctx.fill();
    }
  }
  ctx.restore();
}

export function createArenaRenderer(canvas, subjects) {
  const ctx = canvas.getContext('2d');
  let width = 0, height = 0;
  return function render(match, scene, time, reduced = false) {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (w !== width || h !== height || canvas.width !== Math.round(w * dpr)) {
      width = w; height = h; canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    ctx.save();
    const shot = scene.shot;
    const impactAge = scene.impactAt === null ? -1 : time - scene.impactAt;
    // Hold the impact pose briefly. This affects presentation only, never the aim clock.
    const held = shot?.grade !== 'miss' && impactAge >= 0 ? Math.min(impactAge, SHOT_TIMING.impact) : 0;
    const visualTime = time - held, age = impactAge < 0 ? -1 : impactAge - held;
    if (!reduced && shot?.grade === 'perfect' && impactAge >= 0 && impactAge < 170) ctx.translate(Math.sin(impactAge / 14) * 2.5, Math.cos(impactAge / 19) * 1.5);
    market(ctx, w, h);
    const points = {};
    for (const side of ['player', 'npc']) {
      const actor = match.actors[side], image = subjects.get(actor.id);
      const scale = Math.min(w * .36 / image.naturalWidth, h * .68 / image.naturalHeight);
      const point = { x: w * (side === 'player' ? .22 : .78), floor: h * .83,
        width: image.naturalWidth * scale, height: image.naturalHeight * scale };
      points[side] = point;
      drawCutout(ctx, image, point, actorPose(side, match, scene, visualTime, reduced), side === 'player' ? 1 : -1);
    }
    if (shot && scene.phase.endsWith('-shot')) {
      const travel = (time - scene.at - SHOT_TIMING.windup) / SHOT_TIMING.flight;
      if (travel >= 0 && travel < 1) {
        const start = points[shot.actor], target = points[shot.target];
        const facing = shot.actor === 'player' ? 1 : -1;
        const x0 = start.x + facing * start.width * .29, y0 = start.floor - start.height * .55;
        const short = shot.position < .5;
        const x1 = shot.grade !== 'miss' ? target.x : short ? (start.x + target.x) / 2 : w * (facing > 0 ? .96 : .04);
        const y1 = shot.grade !== 'miss' ? target.floor - target.height * .48 : h * .87;
        const x = x0 + (x1 - x0) * travel;
        const y = y0 + (y1 - y0) * travel - Math.sin(Math.PI * travel) * h * .34;
        projectile(ctx, THROW_ROSTER[shot.characterId].projectile, x, y, Math.max(9, w * .02), reduced ? 0 : facing * travel * 6);
      }
    }
    if (shot && age >= 0 && age < 650) {
      const target = points[shot.target], start = points[shot.actor];
      const x = shot.grade !== 'miss' ? target.x : shot.position < .5 ? (start.x + target.x) / 2 : w * (shot.actor === 'player' ? .96 : .04);
      const y = shot.grade !== 'miss' ? target.floor - target.height * .48 : h * .87;
      const strength = shot.grade === 'perfect' ? 12 : shot.grade === 'hit' ? 7 : 4;
      if (!reduced) for (let i = 0; i < strength; i++) {
        const a = i / strength * Math.PI * 2;
        const spread = 8 + age * .07;
        ctx.fillStyle = i % 2 ? '#ffe7a4' : shot.grade === 'miss' ? '#b8a98b' : '#e6b3b4';
        ctx.globalAlpha = 1 - age / 650;
        ctx.fillRect(x + Math.cos(a) * spread, y + Math.sin(a) * spread + age * age * .00006, 3, 3);
      }
      ctx.globalAlpha = 1;
      ctx.font = `bold ${Math.max(17, w * .036)}px monospace`; ctx.textAlign = 'center';
      ctx.fillStyle = shot.grade === 'perfect' ? '#ffed9e' : '#fff3e5'; ctx.strokeStyle = '#302433'; ctx.lineWidth = 4;
      const label = shot.grade === 'miss' ? 'MISS' : `−${shot.actualDamage}`;
      const labelY = y - 25 - (reduced ? 0 : age * .025);
      ctx.strokeText(label, x, labelY); ctx.fillText(label, x, labelY);
    }
    ctx.restore();
  };
}
