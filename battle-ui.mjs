import { ABILITIES, BATTLE_ROSTER, PRACTICE_NPCS, TEAM_SIZE } from './battle-data.mjs';
import { simulateBattle, validateTeam } from './battle-engine.mjs';
import { dash } from './battle-fx.mjs';

const $ = id => document.getElementById(`battle-${id}`);
const selected = [];
let npc = PRACTICE_NPCS[0];
let phase = 'setup';
let playback = null;
const units = new Map();
const sideName = side => side === 'player' ? '우리' : '상대';
const cardName = id => BATTLE_ROSTER[id].name;

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function art(card, className = 'battle-art') {
  const image = element('img', className);
  image.src = `./${card.art}`;
  image.alt = `${card.name} 카드 원화`;
  image.width = card.w;
  image.height = card.h;
  image.draggable = false;
  image.decoding = 'async';
  return image;
}

function artwork(card) {
  const wrap = element('span', 'battle-art-wrap');
  wrap.append(art(card));
  return wrap;
}

function abilityBadge(ability) {
  const badge = element('span', 'battle-ability', ABILITIES[ability].label);
  badge.dataset.ability = ability;
  return badge;
}

function plannedBonus(lineup, slot) {
  return slot > 0 && BATTLE_ROSTER[lineup[slot - 1]].ability === 'support' ? 1 : 0;
}

function renderRoster() {
  for (const card of Object.values(BATTLE_ROSTER)) {
    const button = element('button', 'battle-pick');
    button.type = 'button';
    button.dataset.cardId = card.id;
    button.setAttribute('aria-pressed', 'false');
    button.append(artwork(card), element('span', 'battle-pick-name', card.name));
    const stats = element('span', 'battle-pick-stats');
    stats.append(element('span', '', `공격 ${card.attack}`), element('span', '', `체력 ${card.hp}`));
    button.append(stats, abilityBadge(card.ability),
      element('span', 'battle-pick-description', ABILITIES[card.ability].description),
      element('span', 'battle-pick-status', '+ 선택'));
    button.addEventListener('click', () => {
      if (phase !== 'setup') return;
      const slot = selected.indexOf(card.id);
      if (slot >= 0) selected.splice(slot, 1);
      else if (selected.length < TEAM_SIZE) selected.push(card.id);
      else {
        $('selection-note').textContent = '이미 세 장을 골랐어요. 한 장을 해제하면 바꿀 수 있어요.';
        return;
      }
      renderSelection(`${card.name} ${slot >= 0 ? '선택 해제' : '선택'}.`);
    });
    $('roster').append(button);
  }
  for (const ability of Object.values(ABILITIES)) {
    $('abilities').append(element('li', '', `${ability.label} — ${ability.description}`));
  }
}

function orderButton(text, label, action, disabled, handler) {
  const button = element('button', '', text);
  button.type = 'button';
  button.dataset.action = action;
  button.disabled = disabled;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', handler);
  return button;
}

function moveCard(id, direction) {
  if (phase !== 'setup') return;
  const from = selected.indexOf(id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= selected.length) return;
  [selected[from], selected[to]] = [selected[to], selected[from]];
  renderSelection(`${cardName(id)} 카드를 ${to + 1}번으로 옮겼어요.`);
  const row = $('team').querySelector(`[data-card-id="${CSS.escape(id)}"]`);
  const button = row.querySelector(`[data-action="${direction < 0 ? 'front' : 'back'}"]`);
  (button.disabled ? row.querySelector('button:not(:disabled)') : button).focus({ preventScroll: true });
}

function renderSelection(message = '') {
  $('selected-count').textContent = `${selected.length} / ${TEAM_SIZE}`;
  for (const button of $('roster').children) {
    const slot = selected.indexOf(button.dataset.cardId);
    button.setAttribute('aria-pressed', String(slot >= 0));
    button.setAttribute('aria-disabled', String(slot < 0 && selected.length === TEAM_SIZE));
    button.querySelector('.battle-pick-status').textContent = slot >= 0 ? `✓ ${slot + 1}번 · 선택됨` : '+ 선택';
  }
  $('team').replaceChildren();
  for (let slot = 0; slot < TEAM_SIZE; slot++) {
    const id = selected[slot];
    const row = element('li', `battle-team-slot${id ? '' : ' is-empty'}`);
    row.append(element('span', 'battle-slot-number', String(slot + 1)));
    if (!id) row.append(element('span', '', slot === 0 ? '먼저 나갈 카드를 골라 주세요' : '함께할 카드를 골라 주세요'));
    else {
      const card = BATTLE_ROSTER[id];
      row.dataset.cardId = id;
      const info = element('div', 'battle-team-info');
      info.append(element('strong', '', card.name));
      const bonus = plannedBonus(selected, slot);
      const attack = bonus ? `${card.attack} → ${card.attack + bonus} (지원 +1)` : String(card.attack);
      info.append(element('span', '', `공격 ${attack} · 체력 ${card.hp}`));
      if (card.ability === 'support') {
        info.append(element('small', '', selected[slot + 1]
          ? `지원 → ${cardName(selected[slot + 1])}` : slot === TEAM_SIZE - 1 ? '마지막 칸: 지원 대상 없음' : '지원: 뒤에 카드가 오면 공격 +1'));
      }
      const controls = element('div', 'battle-order-controls');
      controls.append(
        orderButton('← 앞', `${card.name} 앞으로`, 'front', slot === 0, () => moveCard(id, -1)),
        orderButton('뒤 →', `${card.name} 뒤로`, 'back', slot === selected.length - 1, () => moveCard(id, 1)),
        orderButton('해제', `${card.name} 선택 해제`, 'remove', false, () => {
          if (phase !== 'setup') return;
          selected.splice(selected.indexOf(id), 1);
          renderSelection(`${card.name} 선택을 해제했어요.`);
          $('roster').querySelector(`[data-card-id="${CSS.escape(id)}"]`).focus({ preventScroll: true });
        }),
      );
      row.append(art(card, 'battle-team-thumb'), info, controls);
    }
    $('team').append(row);
  }
  const ready = selected.length === TEAM_SIZE;
  $('start').disabled = !ready;
  $('start').textContent = ready ? `${npc.name} · 대결 시작 →` : `카드 ${TEAM_SIZE}장을 골라 주세요`;
  $('selection-note').textContent = message || (ready ? '준비됐어요. 순서를 확인하고 시작하세요.' : `${TEAM_SIZE - selected.length}장 더 고르면 시작할 수 있어요.`);
}

function renderNpcPreview() {
  $('npc-note').textContent = npc.note;
  $('npc-preview').replaceChildren();
  npc.lineup.forEach((id, slot) => {
    const card = BATTLE_ROSTER[id];
    const bonus = plannedBonus(npc.lineup, slot);
    const row = element('li');
    row.dataset.cardId = id;
    row.append(artwork(card), element('strong', '', `${slot + 1}. ${card.name}`),
      element('small', '', `공격 ${card.attack + bonus}${bonus ? '(+1)' : ''} · 체력 ${card.hp}`), abilityBadge(card.ability));
    $('npc-preview').append(row);
  });
}

function renderNpcs() {
  $('npcs').setAttribute('role', 'radiogroup');
  $('npcs').setAttribute('aria-label', '연습 상대 선택');
  for (const opponent of PRACTICE_NPCS) {
    const label = element('label', 'battle-npc-option');
    const input = element('input');
    input.type = 'radio';
    input.name = 'practice-npc';
    input.value = opponent.id;
    input.checked = opponent === npc;
    input.addEventListener('change', () => {
      if (phase !== 'setup') return;
      npc = opponent;
      renderNpcPreview();
      renderSelection();
    });
    label.append(input, element('span', '', opponent.name));
    $('npcs').append(label);
  }
  renderNpcPreview();
}

function mountTeams(teams) {
  units.clear();
  for (const [side, team] of Object.entries(teams)) {
    const lineup = $(`${side}-lineup`);
    lineup.replaceChildren();
    for (const state of team) {
      const card = BATTLE_ROSTER[state.id];
      const row = element('li', 'battle-unit');
      row.dataset.key = state.key;
      const status = element('span', 'battle-unit-state');
      const stats = element('div', 'battle-unit-stats');
      const attack = element('b');
      const hp = element('span');
      stats.append(attack, document.createTextNode(' · '), hp);
      const bar = element('progress', 'battle-hp');
      bar.max = state.maxHp;
      bar.setAttribute('aria-label', `${sideName(side)} ${state.slot + 1}번 ${card.name} 체력`);
      const ability = element('span', 'battle-unit-ability');
      const note = element('span', 'battle-hit-note');
      row.append(status, artwork(card), element('strong', 'battle-unit-name', card.name), stats, bar, ability, note);
      units.set(state.key, { row, status, attack, hp, bar, ability, note, state: { ...state } });
      lineup.append(row);
    }
  }
  updateTeams(teams);
}

function updateHp(unit, hp) {
  unit.state.hp = hp;
  unit.hp.textContent = `HP ${hp}/${unit.state.maxHp}`;
  unit.bar.value = hp;
}

function updateTeams(teams) {
  for (const team of Object.values(teams)) {
    for (const state of team) {
      const unit = units.get(state.key);
      unit.state = { ...state };
      updateHp(unit, state.hp);
      unit.attack.textContent = `공격 ${state.attack}${state.attack > state.baseAttack ? '(+1)' : ''}`;
      unit.ability.textContent = state.ability === 'shield' ? `방어 ${state.shieldReady ? '준비' : '사용함'}`
        : state.ability === 'burst' ? `연타 ${state.burstReady ? '준비' : '사용함'}`
          : state.slot === TEAM_SIZE - 1 ? '지원 대상 없음' : '지원 적용됨';
      unit.row.classList.toggle('is-defeated', state.hp === 0);
      unit.status.textContent = `${state.slot + 1}번 · ${state.hp === 0 ? '쓰러짐' : '대기'}`;
      unit.row.classList.remove('is-active');
    }
  }
}

function nameFor(key) {
  const { state } = units.get(key);
  return `${sideName(state.side)} ${cardName(state.id)}`;
}

function log(text) {
  $('log').append(element('li', '', text));
}

function clearEffects() {
  for (const unit of units.values()) {
    unit.row.classList.remove('battle-strike', 'battle-impact', 'is-blocked');
    unit.note.textContent = '';
  }
}

function delay(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new DOMException('재생 취소', 'AbortError'));
    const abort = () => {
      clearTimeout(timer);
      reject(new DOMException('재생 취소', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', abort);
      resolve();
    }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}

function cancelPlayback() {
  playback?.abort();
  playback = null;
  clearEffects();
}

function editTeam() {
  cancelPlayback();
  phase = 'setup';
  $('arena').hidden = true;
  $('setup').hidden = false;
  $('result').hidden = true;
  $('log').replaceChildren();
  renderSelection();
  $('team-title').scrollIntoView({ block: 'start' });
  $('team').querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
}

function showResult(result) {
  phase = 'result';
  const titles = { win: '우리 팀 승리!', loss: '이번엔 우리 팀 패배', draw: '팽팽한 무승부!' };
  $('arena-title').textContent = '대결 종료';
  $('result-title').textContent = titles[result.outcome];
  $('result').dataset.outcome = result.outcome;
  const left = result.teams.player.filter(card => card.hp > 0);
  const right = result.teams.opponent.filter(card => card.hp > 0);
  const ending = result.reason === 'exchange-limit' ? `${result.exchanges}번 교환 한도에 도달해 무승부예요.`
    : !left.length && !right.length ? '마지막 교환에서 두 팀이 함께 쓰러졌어요.'
      : result.outcome === 'win' ? '상대 카드가 모두 쓰러졌어요.' : '우리 카드가 모두 쓰러졌어요.';
  $('result-summary').textContent = `${ending} ${result.exchanges}번 교환 · 남은 카드 ${left.length} : ${right.length}`;
  const remainingText = cards => cards.length ? cards.map(card => `${cardName(card.id)} HP ${card.hp}`).join(', ') : '없음';
  $('survivors').textContent = `우리: ${remainingText(left)} / 상대: ${remainingText(right)}`;
  $('feedback').textContent = result.outcome === 'win' ? '이번 배치로 이겼어요! 다른 연습 상대에게도 도전해 보세요.'
    : '같은 카드도 순서에 따라 결과가 달라져요. 지원 카드 바로 뒤와 연타가 만날 상대를 살펴보세요.';
  log(`${titles[result.outcome]} ${$('result-summary').textContent}`);
  $('result').hidden = false;
  $('retry').disabled = false;
  $('exit').textContent = '팀 편집';
  $('result').scrollIntoView({ block: 'nearest' });
  $('result-title').focus({ preventScroll: true });
}

async function play(report, signal) {
  const init = report.events[0];
  const supportNotes = init.effects.map(effect => effect.target
    ? `${nameFor(effect.source)} 지원 → ${nameFor(effect.target)} 공격 +${effect.amount}`
    : `${nameFor(effect.source)}: 마지막 칸이라 지원 대상 없음`);
  log('대결 시작. 체력과 능력을 새로 준비했어요.');
  for (const note of supportNotes) log(note);
  $('feedback').textContent = supportNotes.length ? supportNotes.join(' · ') : '체력과 능력을 새로 준비했어요. 선두부터 출발!';
  await delay(1200, signal);

  for (const event of report.events) {
    if (event.type !== 'exchange') continue;
    clearEffects();
    $('arena-title').textContent = `${event.number}번째 교환`;
    for (const key of Object.values(event.active)) {
      const unit = units.get(key);
      unit.row.classList.add('is-active');
      unit.status.textContent = `${unit.state.slot + 1}번 · 대결 중`;
    }
    const burst = event.attacks.filter(attack => attack.burst).map(attack => `${nameFor(attack.source)} 연타!`);
    const intro = `${event.number}교환 · ${nameFor(event.active.player)} ↔ ${nameFor(event.active.opponent)}`;
    log(`${intro}${burst.length ? ` · ${burst.join(' · ')}` : ''}`);
    for (let wave = 1; wave <= Math.max(...event.attacks.map(attack => attack.count)); wave++) {
      clearEffects();
      const hits = event.hits.filter(hit => hit.hit === wave);
      $('feedback').textContent = `${intro}${burst.length ? ` · ${burst.join(' · ')} ${wave}번째 타격` : ''}`;
      // 돌진은 여기서 출발시키고, 220ms 뒤 충돌 순간에 impact() 를 부른다 (battle-fx.mjs).
      const dashes = hits.map(hit => dash(units.get(hit.source).row, units.get(hit.target).row,
        { damage: hit.damage, blocked: hit.blocked, signal }));
      for (const hit of hits) units.get(hit.source).row.classList.add('battle-strike');
      await delay(220, signal);
      clearEffects();
      for (const fx of dashes) fx.impact();
      const notes = [];
      // Both sides' HP is updated together for this wave, even after a lethal hit.
      for (const hit of hits) {
        const target = units.get(hit.target);
        updateHp(target, hit.hpAfter);
        target.row.classList.add(hit.blocked ? 'is-blocked' : 'battle-impact');
        target.note.textContent = hit.blocked ? '방어! 피해 0' : hit.hpBefore === 0 ? '초과 피해 없음' : `−${hit.damage} HP`;
        if (hit.blocked) target.ability.textContent = '방어 사용함';
        const note = `${nameFor(hit.target)} ${target.note.textContent}`;
        notes.push(note);
        log(`${event.number}교환 ${wave}타 · ${nameFor(hit.source)} → ${note} (HP ${hit.hpAfter})`);
      }
      $('feedback').textContent = `${event.number}교환${burst.length ? ` · 연타 ${wave}타` : ''} | ${notes.join(' · ')}`;
      await delay(580, signal);
    }
    clearEffects();
    updateTeams(event.teams);
    if (event.defeated.length) {
      const continues = Object.values(event.teams).every(team => team.some(card => card.hp > 0));
      const note = `${event.defeated.map(nameFor).join(' · ')} 쓰러짐. ${continues ? '다음 카드가 이어가요.' : '예약된 타격까지 모두 처리했어요.'}`;
      $('feedback').textContent = note;
      log(`${event.number}교환 종료 · ${note}`);
    }
    await delay(360, signal);
  }
  showResult(report);
}

async function startBattle() {
  if (phase === 'playing') return;
  let report;
  try {
    validateTeam(selected);
    report = simulateBattle(selected, npc.lineup);
  } catch (error) {
    $('selection-note').textContent = error.message;
    return;
  }
  cancelPlayback();
  const controller = new AbortController();
  playback = controller;
  phase = 'playing';
  $('start').disabled = true;
  $('retry').disabled = true;
  $('setup').hidden = true;
  $('arena').hidden = false;
  $('result').hidden = true;
  $('history').open = false;
  $('log').replaceChildren();
  $('arena-title').textContent = '대결 준비';
  $('opponent-label').textContent = npc.name;
  $('exit').textContent = '중단하고 팀 편집';
  mountTeams(report.events[0].teams);
  window.scrollTo({ top: 0, behavior: 'instant' });
  $('arena-title').focus({ preventScroll: true });
  try {
    await play(report, controller.signal);
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error(error);
      editTeam();
      $('selection-note').textContent = '대결을 재생하지 못했어요. 다시 시작해 주세요.';
    }
  } finally {
    if (playback === controller) playback = null;
  }
}

$('start').addEventListener('click', startBattle);
$('retry').addEventListener('click', startBattle);
$('exit').addEventListener('click', editTeam);
$('edit').addEventListener('click', editTeam);
window.addEventListener('pagehide', cancelPlayback);
// A page restored from the back/forward cache must not retain an aborted arena.
window.addEventListener('pageshow', event => {
  if (event.persisted && phase === 'playing') editTeam();
});
renderRoster();
renderNpcs();
renderSelection();
