// No game markup or runtime code is copied. The parent loads the real page, then
// injects this same-origin module into its iframe; the UI module instance is shared.
const CHANNEL = 'daengs-ringout-browser-check';
const TEST_PROFILE_KEY = 'daengs-ringout-browser-test-profile';
const FRAME_MODE = new URL(import.meta.url).searchParams.get('frame') === '1';
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const assert = (condition, message) => { if (!condition) throw new Error(message); };
const until = async (predicate, description, timeout = 12000) => {
  const start = performance.now();
  while (!predicate()) {
    if (performance.now() - start > timeout) throw new Error(`시간 초과: ${description}`);
    await sleep(25);
  }
};

if (FRAME_MODE) {
  await frameChecks();
} else {
  await parentPage();
}

async function parentPage() {
  const $ = id => document.getElementById(id);
  const frame = $('game-frame');
  const report = [];
  let running = false, startupTimer;
  const render = current => {
    $('check-result').textContent = JSON.stringify({ report, ...(current ? { current } : {}) }, null, 2);
  };
  const stop = message => {
    clearTimeout(startupTimer); running = false;
    $('run-checks').disabled = false; $('viewport').disabled = false;
    $('check-status').textContent = message;
  };
  const resize = () => {
    const [width, height] = $('viewport').value.split(',').map(Number);
    frame.style.width = `${width}px`; frame.style.height = `${height}px`;
  };
  $('viewport').addEventListener('change', resize);
  resize();

  if (location.hostname !== 'localhost' || !/^https?:$/.test(location.protocol)) {
    $('run-checks').disabled = true;
    $('check-status').textContent = 'localhost HTTP 주소에서만 실행할 수 있습니다. 127.0.0.1의 사용자 프로필은 검사하지 않습니다.';
    return;
  }

  window.addEventListener('message', event => {
    if (!running || event.origin !== location.origin || event.source !== frame.contentWindow || event.data?.channel !== CHANNEL) return;
    const message = event.data;
    if (message.type === 'ready') {
      clearTimeout(startupTimer);
      const profile = message.current.profile;
      if (profile.bytes !== 0 || profile.revision !== 0 || profile.name !== '네오') {
        report.push({ failed: '테스트용 네오 프로필이 아닙니다. 사진이나 이름을 변경하지 않았습니다.' });
        render(); stop('검사 중단'); return;
      }
      try { sessionStorage.setItem(TEST_PROFILE_KEY, profile.id); }
      catch {
        report.push({ failed: '테스트 프로필 식별자를 세션 저장소에 기록할 수 없습니다.' });
        render(); stop('검사 중단'); return;
      }
      $('check-status').textContent = '실행 중 — 이 탭을 계속 보이게 유지하세요';
      frame.contentWindow.postMessage({ channel: CHANNEL, type: 'run' }, location.origin);
    } else if (message.type === 'progress') {
      report.length = 0; report.push(...message.report);
      render(message.current);
      const passed = report.filter(entry => entry.pass).length;
      $('check-status').textContent = `${passed} / 8 검사 통과`;
    } else if (message.type === 'complete') {
      report.length = 0; report.push(...message.report);
      render(message.current); stop(message.ok ? '8 / 8 검사 완료' : '검사 실패 — 아래 결과 확인');
    }
  });

  $('run-checks').addEventListener('click', async () => {
    if (running) return;
    running = true; report.length = 0;
    $('run-checks').disabled = true; $('viewport').disabled = true;
    $('check-status').textContent = '테스트 저장소 확인 중'; render();
    try {
      // Reading before loading the game prevents an existing user's profile from
      // being changed. Only this tab's fresh, photo-free test identity can rerun.
      const { createIndexedDBStorage } = await import('../ringout-profile.mjs');
      const stored = await createIndexedDBStorage().read();
      const ownedId = sessionStorage.getItem(TEST_PROFILE_KEY);
      assert(!stored || (stored.id === ownedId && !stored.faceBlob && stored.faceRevision === 0 && stored.displayName === '네오'),
        '이 localhost 주소에 기존 프로필이 있습니다. 새 localhost 포트나 별도 브라우저 저장소를 사용하세요. 기존 데이터는 삭제하지 않았습니다.');
      frame.hidden = false;
      frame.onload = () => {
        if (!running) return;
        const script = frame.contentDocument.createElement('script');
        script.type = 'module';
        script.src = new URL('./ringout-browser.mjs?frame=1', import.meta.url).href;
        script.onerror = () => { report.push({ failed: 'iframe 검사 모듈을 불러오지 못했습니다.' }); render(); stop('검사 실패'); };
        frame.contentDocument.head.append(script);
      };
      startupTimer = setTimeout(() => {
        report.push({ failed: '게임 초기화 또는 검사 모듈 응답이 20초 안에 완료되지 않았습니다.' });
        render(); stop('검사 실패');
      }, 20000);
      frame.src = new URL(`../ringout.html?browser-check=${Date.now()}`, import.meta.url).href;
    } catch (error) {
      report.push({ failed: error.message }); render(); stop('검사 중단');
    }
  });
}

async function frameChecks() {
  assert(window.parent !== window && location.hostname === 'localhost', 'localhost의 검증 iframe에서만 실행합니다.');
  const send = message => window.parent.postMessage({ channel: CHANNEL, ...message }, location.origin);
  const runtimeErrors = [];
  window.addEventListener('error', event => runtimeErrors.push(event.message || '브라우저 실행 오류'));
  window.addEventListener('unhandledrejection', event => runtimeErrors.push(String(event.reason)));
  try {
    // Resolves to the same URL imported by the original ringout.html script tag.
    const { inspectGame } = await import('../ringout-ui.mjs');
    const $ = id => document.getElementById(id);
    const report = [];
    const show = () => send({ type: 'progress', report, current: inspectGame() });
    const check = async (name, run) => {
      await run();
      assert(runtimeErrors.length === 0, runtimeErrors.join('\n'));
      report.push({ name, pass: true }); show();
    };
    const input = (id, value) => { $(id).value = value; $(id).dispatchEvent(new Event('input', { bubbles: true })); };
    const key = (value, repeat = false) => $('arena').dispatchEvent(new KeyboardEvent('keydown', {
      key: value, code: value === ' ' ? 'Space' : value, bubbles: true, cancelable: true, repeat,
    }));
    const readyToShoot = () => until(() => !$('launch').disabled, '플레이어 입력 허용');
    await until(() => inspectGame().ready || inspectGame().failed, '3D 게임 준비');
    assert(inspectGame().ready && !inspectGame().failed, 'WebGL 게임을 초기화하지 못했습니다.');

    let started = false;
    window.addEventListener('message', async event => {
      if (started || event.origin !== location.origin || event.source !== window.parent || event.data?.channel !== CHANNEL || event.data.type !== 'run') return;
      started = true;
      try {
        assert(!document.hidden, '검증 탭을 보이게 유지해야 합니다.');
        const before = inspectGame().profile;
        await check('1. 미러 대결 얼굴·재질 분리와 몸체 변경 시 프로필 재사용', async () => {
          for (const id of ['photo', 'display-name', 'save-name', 'clear-profile']) assert(!$(id).disabled, `${id}: 준비 후 입력 잠금이 풀리지 않았습니다.`);
          assert($('display-name').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true })), '이름 입력의 방향 키를 게임이 가로챕니다.');
          $('opponent').value = 'tomato'; $('opponent').dispatchEvent(new Event('change'));
          for (let i = 0; i < 8; i++) document.querySelector(`[data-body="${i % 2 ? 'tomato' : 'sweet-potato'}"]`).click();
          await sleep(100);
          const current = inspectGame();
          assert(current.graphics.faceIsolated && current.graphics.npcUsesDemo && current.graphics.playerUsesDemo, '데모 얼굴이나 재질이 분리되지 않았습니다.');
          assert(current.profile.id === before.id && current.profile.revision === before.revision, '몸체 선택이 얼굴 기록을 변경했습니다.');
        });

        $('start').click(); await readyToShoot();
        await check('2. 키보드 한 번 발사·중복 잠금·잠금 중 기본 스크롤 방지', async () => {
          input('power', 100);
          assert(key(' ') === false, '발사 키의 브라우저 기본 동작이 취소되지 않았습니다.');
          assert(key(' ', true) === false && key('ArrowDown') === false, '턴 잠금 중 반복 키가 페이지를 스크롤할 수 있습니다.');
          key(' ');
          assert(inspectGame().state.shots === 1, '한 차례에 두 번 발사했습니다.');
        });

        await check('3. 일시정지 중 위치 고정·재개와 재시작', async () => {
          await until(() => inspectGame().state.shotTime > .08, '실제 이동 시작');
          $('pause').click();
          const beforePause = inspectGame().state;
          await sleep(400);
          assert(JSON.stringify(inspectGame().state) === JSON.stringify(beforePause), '정지 중 물리가 진행됐습니다.');
          $('resume').click();
          assert(inspectGame().state.shotTime === beforePause.shotTime, '재개 직후 대기 시간을 따라잡았습니다.');
          await sleep(80);
          const resumed = inspectGame().state.shotTime - beforePause.shotTime;
          assert(resumed > 0 && resumed < .2, `재개 후 0.08초 동안 진행된 활성 시간이 ${resumed.toFixed(3)}초입니다. 정지한 0.4초를 몰아서 처리했거나 진행하지 않았습니다.`);
          $('retry').click(); await readyToShoot();
          assert(inspectGame().state.shots === 0, '재시작에 이전 발사가 남았습니다.');
        });

        await check('4. 이동 중 재시작 무효화·반복 키 취소', async () => {
          assert(key(' ', true) === false, '반복 Space 기본 동작이 취소되지 않았습니다.');
          assert(inspectGame().state.shots === 0, '반복 키가 새 대결을 발사했습니다.');
          const generation = inspectGame().matchGeneration;
          key(' ');
          await until(() => inspectGame().state.shotTime > .08, '재시작 전 실제 이동');
          $('retry').click(); await readyToShoot();
          assert(inspectGame().matchGeneration > generation, '재시작이 대결 세대를 바꾸지 않았습니다.');
          await sleep(600);
          assert(inspectGame().state.shots === 0 && inspectGame().state.turn === 'player', '이전 작업이 새 대결을 진행시켰습니다.');
        });

        await check('5. 합성 터치 취소·미세 드래그 취소·단일 발사', async () => {
          const canvas = $('arena'), point = inspectGame().graphics.actorScreen;
          const fire = (type, x, y) => canvas.dispatchEvent(new PointerEvent(type, {
            pointerId: 23, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, bubbles: true,
          }));
          // Synthetic events do not create a native active pointer. Restore capture
          // even after failure; genuine browser capture needs a separate real drag.
          const capture = canvas.setPointerCapture;
          canvas.setPointerCapture = () => {};
          try {
            fire('pointerdown', point.x, point.y); fire('pointercancel', point.x, point.y);
            assert(inspectGame().state.shots === 0, '포인터 취소가 발사됐습니다.');
            fire('pointerdown', point.x, point.y); fire('pointermove', point.x + 1, point.y + 1); fire('pointerup', point.x + 1, point.y + 1);
            assert(inspectGame().state.shots === 0, '미세 드래그가 발사됐습니다.');
            fire('pointerdown', point.x, point.y); fire('pointermove', point.x, point.y + 110); fire('pointerup', point.x, point.y + 110);
            assert(inspectGame().state.shots === 1, '터치 방향 드래그가 한 번 발사되지 않았습니다.');
          } finally { canvas.setPointerCapture = capture; }
          $('retry').click(); await readyToShoot();
        });

        await check('6. 실제 시뮬레이션 패배·종료 후 NPC 정지·재대결', async () => {
          input('direction', 180); input('power', 100); $('launch').click();
          await until(() => inspectGame().state.phase === 'finished', '자기 탈락 결과');
          const state = inspectGame().state;
          assert(state.result.outcome === 'loss', '자기 탈락이 패배가 아닙니다.');
          await sleep(1200);
          assert(inspectGame().state.shots === state.shots, '종료 후 NPC가 발사했습니다.');
          assert(inspectGame().profile.wins.tomato === before.wins.tomato, '패배에 승리를 기록했습니다.');
          $('replay').click(); await readyToShoot();
          assert(inspectGame().state.shots === 0, '재대결이 새 판이 아닙니다.');
        });

        $('select').click(); document.querySelector('[data-body="sweet-potato"]').click();
        $('opponent').value = 'tomato'; $('opponent').dispatchEvent(new Event('change'));
        const initialWins = inspectGame().profile.wins['sweet-potato'];
        await check('7. 세 판 완주·판당 승리 한 번·몸체별 장식 해금', async () => {
          for (let i = 0; i < 3; i++) {
            $('start').click();
            const deadline = performance.now() + 60000;
            while (inspectGame().state.phase !== 'finished') {
              assert(performance.now() < deadline, '대결이 60초 안에 끝나지 않았습니다. 탭이 숨겨졌는지 확인하세요.');
              if (!$('launch').disabled) {
                const { player, npc } = inspectGame().state.actors;
                input('direction', Math.atan2(npc.x - player.x, -(npc.z - player.z)) * 180 / Math.PI);
                input('power', 100); $('launch').click();
              }
              await sleep(40);
            }
            assert(inspectGame().state.result.outcome === 'win', '검증 정책의 대결이 예상한 승리로 끝나지 않았습니다.');
            assert(inspectGame().profile.wins['sweet-potato'] === initialWins + i + 1, '판당 승리가 정확히 한 번 기록되지 않았습니다.');
            $('result-select').click();
          }
          await sleep(100);
          const profile = inspectGame().profile;
          assert(profile.id === before.id && profile.wins.tomato === before.wins.tomato, '다른 프로필 또는 다른 몸체에 승리를 기록했습니다.');
          assert(profile.wins['sweet-potato'] === initialWins + 3 && $('reward-note').textContent.includes('얻었어요'), '승리 수 또는 장식 해금이 잘못됐습니다.');
        });

        await check('8. 반복 몸체 선택 후 렌더 자원 수 안정', async () => {
          const cycle = async () => {
            for (let i = 0; i < 12; i++) {
              document.querySelector(`[data-body="${i % 2 ? 'tomato' : 'sweet-potato'}"]`).click(); await sleep(35);
            }
            const { geometries, textures } = inspectGame().graphics;
            return { geometries, textures };
          };
          const first = await cycle(), second = await cycle();
          assert(first.geometries === second.geometries && first.textures === second.textures, '몸체 교체마다 렌더 자원이 누적됩니다.');
          report.push({ rendererResources: second });
        });

        const urls = performance.getEntriesByType('resource').map(entry => entry.name);
        assert(urls.every(value => ['data:', 'blob:'].some(prefix => value.startsWith(prefix)) || new URL(value).origin === location.origin), '외부 런타임 요청을 발견했습니다.');
        report.push({
          observedResources: urls.length, network: '관측된 리소스 요청은 모두 같은 로컬 출처',
          iframeViewport: { width: innerWidth, height: innerHeight },
          coverage: '원본 게임 DOM, 합성 키보드/터치, 실제 3D 렌더·물리. 네이티브 포인터 캡처·실물 휴대전화·서로 다른 사진 검증은 별도.',
          startupCoverage: '준비 완료 후 입력 활성화 확인. 느린 초기 로드·페이지 종료 경합은 이 후주입 검사에 포함하지 않음.',
          complete: true,
        });
        send({ type: 'complete', ok: true, report, current: inspectGame() });
      } catch (error) {
        report.push({ failed: error.message, stack: error.stack });
        send({ type: 'complete', ok: false, report, current: inspectGame() });
      }
    });
    send({ type: 'ready', current: inspectGame() });
  } catch (error) {
    send({ type: 'complete', ok: false, report: [{ failed: error.message }] });
  }
}
