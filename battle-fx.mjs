// 대결 타격 연출 — 돌진 → 충돌.
//
// 규칙(battle-engine.mjs)은 여기서 한 줄도 안 본다. 재생 루프(battle-ui.mjs 의 play)가
// 타격마다 dash() 를 부르고, 충돌 순간에 돌려받은 impact() 를 부른다. 그 사이 220ms 는
// 재생 루프의 것이라 여기서는 정하지 않는다.
//
// 방향은 실제 좌표(getBoundingClientRect)로 매번 잰다. 850px 아래에서 .battle-field 가
// 한 열로 접히면 두 진영이 좌우가 아니라 위아래로 놓이는데, 실측이라 그대로 따라간다.
// 고정 방향으로 바꾸면 폰에서 어긋난다.
//
// ⚠️ prefers-reduced-motion 은 CSS 로 막지 않는다. battle.css 끝의
//    `animation: none !important` 는 CSS 애니메이션만 끄는데, 여기 이펙트는 opacity 0 에서
//    시작해 애니메이션으로 나타났다 사라지므로 애니메이션이 꺼지면 화면에 영원히 남는다.
//    그래서 매체 질의를 JS 에서 보고 **노드를 아예 만들지 않는다.** 움직임은 Web
//    Animations API 라 CSS `animation: none` 의 영향도 안 받는다 — 둘 다 아래 한 줄에 걸린다.

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const live = new Set();      // 진행 중인 Animation. 재생 취소 때 한 번에 cancel 한다
const dashing = new Set();   // is-dashing 을 단 행. 취소 때 벗긴다
let layer = null;

function overlay() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'battle-fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.append(layer);
  }
  return layer;
}

function center(node) {
  const rect = node.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height };
}

function track(animation, cleanup) {
  live.add(animation);
  animation.finished.catch(() => {}).finally(() => {
    live.delete(animation);
    cleanup?.();
  });
  return animation;
}

function spawn(className, x, y, power) {
  const node = document.createElement('span');
  node.className = className;
  node.style.setProperty('--fx-power', power);
  node.style.left = `${x}px`;
  node.style.top = `${y}px`;
  overlay().append(node);
  return node;
}

/** 재생 취소(중단 · 재도전) 때 남은 연출을 전부 걷는다. 재생 루프의 signal 에 걸린다. */
export function cancelBattleFx() {
  for (const animation of live) animation.cancel();
  live.clear();
  for (const row of dashing) row.classList.remove('is-dashing');
  dashing.clear();
  layer?.replaceChildren();
}

// 탭이 숨으면 애니메이션 타임라인이 멈춰 finished 가 안 온다 — 재생 루프(setTimeout)는
// 계속 돌아서 링·파편이 쌓였다가 돌아온 순간 한꺼번에 터진다. 숨는 순간 그냥 걷는다.
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') cancelBattleFx();
});

/**
 * 공격하는 카드의 원화를 상대 쪽으로 밀어낸다. 충돌은 돌려받은 impact() 로 만든다.
 *
 * @param {HTMLElement} sourceRow  공격하는 .battle-unit
 * @param {HTMLElement} targetRow  맞는 .battle-unit
 * @param {{ damage: number, blocked: boolean, signal: AbortSignal }} hit
 * @returns {{ impact: () => void }}
 */
export function dash(sourceRow, targetRow, { damage, blocked, signal }) {
  // 숨은 탭도 같이 건너뛴다 — 타임라인이 멈춰 finished 가 안 오는데 재생 루프는 계속 돌기 때문.
  if (reduced.matches || document.visibilityState === 'hidden') return { impact() {} };
  signal?.addEventListener('abort', cancelBattleFx, { once: true });

  const wrap = sourceRow.querySelector('.battle-art-wrap');
  const from = center(wrap);
  const to = center(targetRow.querySelector('.battle-art-wrap') ?? targetRow);
  const dist = Math.hypot(to.x - from.x, to.y - from.y) || 1;
  // 거리의 절반 조금 못 미치게. 양쪽이 **동시에** 공격하는 게 기본이라 상대 자리까지 가면
  // 서로를 지나쳐 자리를 바꾼 것처럼 보인다 — 절반 못 미쳐야 가운데서 부딪힌다.
  // 너무 짧으면 흔들림과 구분이 안 되고, 너무 길면 화면을 가로지른다.
  const travel = Math.min(Math.max(dist * 0.42, 36), 220);
  const ux = (to.x - from.x) / dist;
  const uy = (to.y - from.y) / dist;
  const dx = ux * travel;
  const dy = uy * travel;
  // 피해량으로 세기를 정한다. 공격 1~4 에 지원 +1 이니 5 가 만점이고, 막히거나 0 이면 바닥값.
  const power = blocked ? 0.3 : Math.min(1, Math.max(0.25, damage / 5));

  sourceRow.classList.add('is-dashing');
  dashing.add(sourceRow);
  // fill: forwards 라 200ms 에 끝나도 밀린 자리에 머문다. 되돌리는 건 impact() 의 몫.
  // ⚠️ 끝난 순간 live 에서 빠지므로 '취소됐는지' 를 live 로 판단하면 안 된다 — signal 을 본다.
  const out = track(wrap.animate(
    [{ transform: 'translate(0, 0)' }, { transform: `translate(${dx}px, ${dy}px)` }],
    { duration: 200, easing: 'cubic-bezier(.55, 0, 1, .55)', fill: 'forwards' },
  ));
  let struck = false;

  return {
    impact() {
      if (struck || signal?.aborted) return;
      struck = true;
      out.cancel();
      track(wrap.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 260, easing: 'cubic-bezier(0, .6, .3, 1)' },
      ), () => {
        sourceRow.classList.remove('is-dashing');
        dashing.delete(sourceRow);
      });

      // 충돌 지점 = 밀려간 원화의 앞쪽 끝. 링과 파편은 fixed 레이어에 뷰포트 좌표로 둔다.
      const hx = from.x + dx + ux * from.w * 0.3;
      const hy = from.y + dy + uy * from.h * 0.3;
      const ring = spawn(`battle-fx-ring${blocked ? ' is-blocked' : ''}`, hx, hy, power);
      track(ring.animate(
        [{ transform: 'translate(-50%, -50%) scale(.25)', opacity: .95 },
         { transform: 'translate(-50%, -50%) scale(1)', opacity: 0 }],
        { duration: 360 + 240 * power, easing: 'cubic-bezier(.1, .8, .3, 1)' },
      ), () => ring.remove());

      const shards = blocked ? 0 : Math.round(5 + 7 * power);
      for (let i = 0; i < shards; i++) {
        // 진행 방향 ±70° 부채꼴. 각도는 인덱스로 퍼뜨린다 — 난수 없이도 매번 다르게 보일 만큼 넓다.
        const angle = Math.atan2(uy, ux) + ((i / (shards - 1 || 1)) - 0.5) * 2.4;
        const reach = 30 + 60 * power + (i % 3) * 12;
        const shard = spawn('battle-fx-shard', hx, hy, power);
        track(shard.animate(
          [{ transform: 'translate(-50%, -50%) scale(1)', opacity: 1 },
           { transform: `translate(calc(-50% + ${Math.cos(angle) * reach}px), calc(-50% + ${Math.sin(angle) * reach}px)) scale(.2)`, opacity: 0 }],
          { duration: 300 + 200 * power, easing: 'cubic-bezier(.2, .7, .3, 1)' },
        ), () => shard.remove());
      }

      // 화면 흔들림. 막힌 타격은 안 흔든다 — 막았다는 게 화면으로도 읽혀야 한다.
      const field = targetRow.closest('.battle-field');
      const amp = blocked ? 0 : 2 + 8 * power;
      if (field && amp) {
        track(field.animate(
          [{ transform: 'translate(0, 0)' },
           { transform: `translate(${amp}px, ${-amp * .6}px)` },
           { transform: `translate(${-amp * .8}px, ${amp * .4}px)` },
           { transform: `translate(${amp * .4}px, ${amp * .2}px)` },
           { transform: 'translate(0, 0)' }],
          { duration: 220 + 120 * power, easing: 'ease-out' },
        ));
      }
    },
  };
}
