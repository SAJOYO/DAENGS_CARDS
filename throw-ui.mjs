import { THROW_ROSTER, SHOT_TIMING, INTRO_MS, NPC_THINK_MS, TURN_BREAK_MS } from './throw-data.mjs';
import { createMatch, beginPlayerAim, lockPlayerShot, queueNpcShot, resolveShot,
  gaugePosition, createClock, clockTime, pauseClock, resumeClock } from './throw-engine.mjs';
import { loadSubjects, createArenaRenderer } from './throw-renderer.mjs';
import { createArcadeAudio } from './throw-audio.mjs';

const $ = name => document.getElementById(`throw-${name}`);
const audio = createArcadeAudio();
const motion = matchMedia('(prefers-reduced-motion: reduce)');
let playerId = 'cabbage', npcId = 'tomato';
let match = null, scene = { phase: 'selection', at: 0, shot: null, impactAt: null };
let clock = createClock(performance.now()), matchCounter = 0;
let frame = null, draw = null, ready = false, disposed = false, spaceHeld = false, muted = false;
const activeNow = () => clockTime(clock, performance.now());
const phase = () => clock.paused && match ? 'paused' : scene.phase;
const name = side => THROW_ROSTER[match.actors[side].id].name;
const gradeText = grade => ({ hit: 'HIT', perfect: 'PERFECT', miss: 'MISS' })[grade];

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function profileText(card) {
  return `체력 ${card.hp} · 왕복 ${(card.cycleMs / 1000).toFixed(1)}초 · Hit ${card.hitDamage} / Perfect ${card.perfectDamage} · 명중 폭 ${Math.round(card.hitZone * 200)}% / 중앙 ${Math.round(card.perfectZone * 200)}%`;
}

function banner(text, kind = '') {
  $('banner').hidden = !text;
  $('banner').dataset.kind = kind;
  $('banner').firstElementChild.textContent = text;
}

function syncHp() {
  const actors = match?.actors ?? {
    player: { id: playerId, hp: THROW_ROSTER[playerId].hp },
    npc: { id: npcId, hp: THROW_ROSTER[npcId].hp },
  };
  for (const [side, actor] of Object.entries(actors)) {
    const card = THROW_ROSTER[actor.id];
    $(`${side}-name`).textContent = card.name;
    $(`${side}-hp`).max = card.hp; $(`${side}-hp`).value = actor.hp;
    $(`${side}-hp-text`).textContent = `${actor.hp} / ${card.hp}`;
  }
  $('round-number').textContent = match ? String(match.round).padStart(2, '0') : 'VS';
  $('round-caption').textContent = match ? 'ROUND / 20' : '연습 대결';
}

function configureGauge() {
  const profile = THROW_ROSTER[playerId];
  $('hit-zone').style.left = `${(0.5 - profile.hitZone) * 100}%`;
  $('hit-zone').style.width = `${profile.hitZone * 200}%`;
  $('perfect-zone').style.left = `${(0.5 - profile.perfectZone) * 100}%`;
  $('perfect-zone').style.width = `${profile.perfectZone * 200}%`;
}

function setPhaseUI() {
  const current = phase();
  $('play').dataset.phase = current;
  $('action').disabled = current !== 'player-aim';
  $('pause').textContent = current === 'paused' ? '이어 하기' : '일시정지';
  $('turn-label').textContent = ({ intro: '대결 준비', 'player-aim': '내 차례 · 지금 던지세요!',
    'player-shot': '내 채소가 날아가요', 'npc-ready': '상대가 준비 중이에요',
    'npc-shot': '상대 차례', 'player-ready': '곧 내 차례!', paused: '잠깐 쉬어가기', result: '대결 종료' })[current] ?? '';
  $('gauge').setAttribute('aria-disabled', String(current !== 'player-aim'));
}

function setScene(nextPhase, now, shot = null) {
  scene = { phase: nextPhase, at: now, shot, impactAt: null, impacted: false };
  setPhaseUI();
}

function selectionChanged() {
  if (match) return;
  // Selection has no pending match. Incrementing also invalidates any prior match identity.
  matchCounter++;
  for (const button of $('roster').children) {
    const on = button.dataset.id === playerId;
    button.setAttribute('aria-checked', String(on));
    button.querySelector('.throw-choice-selected').textContent = on ? '1P' : '';
  }
  $('opponent-profile').textContent = `상대: ${profileText(THROW_ROSTER[npcId])}`;
  syncHp(); configureGauge();
  $('canvas').setAttribute('aria-label', `${THROW_ROSTER[playerId].name}와 ${THROW_ROSTER[npcId].name}, 시장 바닥에 마주 선 누끼 캐릭터`);
}

function renderChoices() {
  for (const card of Object.values(THROW_ROSTER)) {
    const button = element('button', undefined, 'throw-choice');
    button.type = 'button'; button.dataset.id = card.id; button.setAttribute('role', 'radio');
    const img = element('img'); img.src = `./${card.subject}`; img.alt = `${card.name} 누끼 캐릭터`; img.draggable = false;
    const info = element('span'); info.append(element('strong', card.name), element('small', card.style));
    button.append(img, info, element('span', `왕복 ${card.cycleMs / 1000}초 · 체력 ${card.hp}\nHit ${card.hitDamage} / Perfect ${card.perfectDamage}\n명중 ${Math.round(card.hitZone * 200)}% · 중앙 ${Math.round(card.perfectZone * 200)}%`, 'throw-choice-stats'), element('span', '', 'throw-choice-selected'));
    button.addEventListener('click', () => { if (!match) { playerId = card.id; selectionChanged(); } });
    $('roster').append(button);
    const option = element('option', card.name); option.value = card.id; $('opponent').append(option);
  }
  $('opponent').value = npcId;
  $('opponent').addEventListener('change', event => { if (!match) { npcId = event.target.value; selectionChanged(); } });
  $('roster').addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key) || match) return;
    event.preventDefault();
    const buttons = [...$('roster').children], index = buttons.findIndex(button => button.dataset.id === playerId);
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length];
    next.click(); next.focus();
  });
  selectionChanged();
}

function addLog(text) { $('log').append(element('li', text)); }

function startMatch() {
  if (!ready || disposed) return;
  audio.stop(); audio.unlock(); spaceHeld = false;
  clock = createClock(performance.now());
  match = createMatch(playerId, npcId, `throw-${++matchCounter}`);
  $('play').dataset.matchId = match.id;
  $('selection').hidden = true; $('controls').hidden = false; $('result').hidden = true;
  $('record').hidden = false; $('record').open = false; $('log').replaceChildren();
  $('feedback').textContent = '내가 먼저 던져요. 중앙 노랑은 Perfect, 초록은 Hit!';
  $('shot-label').textContent = `왕복 ${THROW_ROSTER[playerId].cycleMs / 1000}초 · 중앙을 노려요`;
  setScene('intro', 0); syncHp(); configureGauge(); banner('VS', 'intro');
  $('marker').style.left = '0%'; $('gauge').setAttribute('aria-valuenow', '0');
  $('play').scrollIntoView({ block: 'start', behavior: 'instant' });
  $('play').tabIndex = -1; $('play').focus({ preventScroll: true });
  if (document.hidden) pauseMatch();
  schedule();
}

function editSelection() {
  matchCounter++; match = null; spaceHeld = false; audio.stop();
  clock = createClock(performance.now()); setScene('selection', 0);
  $('selection').hidden = false; $('controls').hidden = true; $('result').hidden = true;
  $('record').hidden = true; $('log').replaceChildren();
  $('feedback').textContent = '캐릭터와 연습 상대를 바꿔 볼까요?'; banner('CHOOSE YOUR NEO');
  delete $('play').dataset.matchId;
  selectionChanged(); schedule();
  $('roster').querySelector('[aria-checked="true"]').focus({ preventScroll: true });
  $('selection').scrollIntoView({ block: 'nearest' });
}

function shoot() {
  if (!match || phase() !== 'player-aim' || document.hidden) return;
  const now = activeNow();
  const position = gaugePosition(now - scene.at, THROW_ROSTER[playerId].cycleMs);
  const next = lockPlayerShot(match, position);
  if (next === match) return;
  match = next; setScene('player-shot', now, match.pendingShot);
  $('marker').style.left = `${position * 100}%`;
  $('gauge').setAttribute('aria-valuenow', String(Math.round(position * 100)));
  $('shot-label').textContent = `내 ${gradeText(scene.shot.grade)} · ${scene.shot.damage} 피해`;
  $('feedback').textContent = `${gradeText(scene.shot.grade)}! ${name('player')} 투척 준비!`;
  banner(gradeText(scene.shot.grade), scene.shot.grade); audio.unlock(); audio.play('throw');
}

function finish(now, shot) {
  setScene('result', now, shot); scene.impactAt = now;
  const labels = { win: ['VICTORY', '오늘 시장의 주인공!'], loss: ['DEFEAT', '이번엔 상대의 승리!'], draw: ['DRAW', '막상막하, 무승부!'] };
  const [stamp, title] = labels[match.outcome];
  banner(match.reason === 'ko' ? 'KO!' : 'TIME UP', 'intro');
  $('controls').hidden = true; $('result').hidden = false;
  $('result').dataset.outcome = match.outcome;
  $('result-stamp').textContent = stamp; $('result-title').textContent = title;
  $('result-detail').textContent = `${match.round}라운드 · 내 체력 ${match.actors.player.hp} : 상대 ${match.actors.npc.hp} · ${match.reason === 'ko' ? '체력이 0이 되어 종료' : '20라운드, 남은 체력으로 판정'}`;
  $('feedback').textContent = match.outcome === 'win' ? '좋은 한 방이었어요! 다른 네오로도 도전해 보세요.' : '다음 한 방은 달라질 거예요. 한 판 더 해 볼까요?';
  addLog(`${stamp} · ${$('result-detail').textContent}`);
  audio.play('result', match.outcome);
  $('result').scrollIntoView({ block: 'nearest', behavior: 'instant' });
  $('result-title').focus({ preventScroll: true });
}

function advance(now) {
  if (!match || clock.paused) return;
  const elapsed = now - scene.at;
  if (scene.phase === 'intro') {
    banner(elapsed < 900 ? 'VS' : 'READY!', 'intro');
    if (elapsed >= INTRO_MS) {
      match = beginPlayerAim(match); setScene('player-aim', now); banner('THROW!');
      $('feedback').textContent = '내 차례예요. 게이지를 보고 던지기 또는 Space!';
    }
  } else if (scene.phase === 'player-ready' && elapsed >= TURN_BREAK_MS) {
    match = beginPlayerAim(match); setScene('player-aim', now); banner('YOUR TURN');
    $('feedback').textContent = '다시 내 차례! 중앙을 노려 던져 보세요.';
    $('shot-label').textContent = `왕복 ${THROW_ROSTER[playerId].cycleMs / 1000}초 · 중앙을 노려요`;
  } else if (scene.phase === 'npc-ready' && elapsed >= NPC_THINK_MS) {
    match = queueNpcShot(match); setScene('npc-shot', now, match.pendingShot);
    banner('CPU THROW'); $('feedback').textContent = `${name('npc')}의 차례. 어떤 한 방이 날아올까요?`;
    $('shot-label').textContent = '상대의 투척을 지켜보세요';
    audio.play('throw');
  } else if (scene.phase.endsWith('-shot')) {
    if (!scene.impacted && elapsed >= SHOT_TIMING.windup + SHOT_TIMING.flight) {
      const shot = scene.shot;
      const next = resolveShot(match, shot.matchId, shot.id);
      if (next === match) return;
      match = next; scene.impacted = true; scene.impactAt = now; syncHp();
      const whose = shot.actor === 'player' ? '내' : '상대';
      $('shot-label').textContent = `${whose} ${gradeText(shot.grade)} · ${shot.actualDamage} 피해`;
      const line = `${shot.round}R ${whose} ${THROW_ROSTER[shot.characterId].name} · ${gradeText(shot.grade)} · ${shot.actualDamage} 피해 · ${shot.target === 'player' ? '내' : '상대'} HP ${shot.hpAfter}`;
      addLog(line); $('feedback').textContent = line; banner(gradeText(shot.grade), shot.grade);
      if (shot.grade !== 'miss') audio.play(shot.grade);
      if (match.phase === 'result') { finish(now, shot); return; }
    }
    const duration = SHOT_TIMING.windup + SHOT_TIMING.flight + SHOT_TIMING.impact + SHOT_TIMING.recovery;
    if (scene.impacted && elapsed >= duration) {
      setScene(match.phase, now); banner(match.phase === 'npc-ready' ? 'CPU READY' : 'NEXT TURN');
    }
  }
}

function renderFrame() {
  frame = null;
  if (disposed || document.hidden) return;
  const now = activeNow(); advance(now);
  const preview = match ?? createMatch(playerId, npcId, 'preview');
  draw?.(preview, scene, now, motion.matches);
  if (match && phase() === 'player-aim') {
    const position = gaugePosition(now - scene.at, THROW_ROSTER[playerId].cycleMs);
    $('marker').style.left = `${position * 100}%`;
    $('gauge').setAttribute('aria-valuenow', String(Math.round(position * 100)));
  }
  if (!clock.paused) schedule();
}

function schedule() { if (frame === null && !disposed && !document.hidden) frame = requestAnimationFrame(renderFrame); }

function pauseMatch() {
  if (!match || scene.phase === 'result' || clock.paused) return;
  clock = pauseClock(clock, performance.now()); spaceHeld = false; audio.suspend();
  if (frame !== null) cancelAnimationFrame(frame); frame = null;
  setPhaseUI(); banner('PAUSED', 'paused');
  $('feedback').textContent = '대결과 게이지가 멈췄어요. 이어 하기를 누르면 계속해요.';
}

function resumeMatch() {
  if (!match || !clock.paused || document.hidden) return;
  clock = resumeClock(clock, performance.now()); audio.unlock(); setPhaseUI();
  banner(scene.phase === 'player-aim' ? 'YOUR TURN' : 'PLAY!');
  $('feedback').textContent = '멈췄던 순간부터 이어가요.'; schedule();
}

$('start').addEventListener('click', startMatch);
for (const id of ['restart', 'retry']) $(id).addEventListener('click', startMatch);
for (const id of ['edit', 'select']) $(id).addEventListener('click', editSelection);
$('action').addEventListener('click', shoot); // Touch and mouse share exactly this input path.
$('pause').addEventListener('click', () => clock.paused ? resumeMatch() : pauseMatch());
$('mute').disabled = !audio.supported;
if (!audio.supported) $('mute').textContent = '무음 플레이';
$('mute').addEventListener('click', () => {
  muted = !muted; audio.setMuted(muted); $('mute').setAttribute('aria-pressed', String(muted));
  $('mute').textContent = muted ? '소리 꺼짐' : '소리 켜짐';
});
document.addEventListener('keydown', event => {
  if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || !match || scene.phase === 'result') return;
  const control = event.target.closest?.('a,button,input,select,textarea,[contenteditable="true"]');
  if (control && control !== $('action')) return;
  event.preventDefault();
  if (event.repeat || spaceHeld) return;
  spaceHeld = true; shoot();
});
document.addEventListener('keyup', event => { if (event.code === 'Space' && spaceHeld) { event.preventDefault(); spaceHeld = false; } });
window.addEventListener('blur', () => { spaceHeld = false; });
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    pauseMatch(); audio.suspend();
    if (frame !== null) cancelAnimationFrame(frame); frame = null;
  } else {
    // An explicit resume avoids a surprise CPU shot as the tab becomes visible.
    if (match && clock.paused) { setPhaseUI(); banner('PAUSED', 'paused'); }
    schedule();
  }
});
window.addEventListener('pagehide', () => {
  disposed = true; matchCounter++; match = null; spaceHeld = false;
  if (frame !== null) cancelAnimationFrame(frame); frame = null;
  audio.close();
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {
    disposed = false; editSelection();
    if (!ready) initializeAssets();
  }
});
window.addEventListener('resize', schedule);
motion.addEventListener('change', schedule);
// Reuse decoded subjects even if loading finishes while the page is in BFCache.
const subjectsPromise = loadSubjects();
async function initializeAssets() {
  try {
    const subjects = await subjectsPromise;
    if (disposed) return;
    draw = createArenaRenderer($('canvas'), subjects); ready = true;
    $('start').disabled = false; $('start').textContent = '대결 시작 →';
    $('load-status').textContent = '버튼 한 번 또는 Space · 시작하면 짧은 효과음이 나와요';
    schedule();
  } catch {
    if (disposed) return;
    $('load-status').textContent = '캐릭터를 불러오지 못했어요. HTTP 서버로 열었는지 확인하고 새로고침해 주세요.';
    $('start').textContent = '캐릭터 로드 실패';
  }
}
renderChoices();
initializeAssets();
