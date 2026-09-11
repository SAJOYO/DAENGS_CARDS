# 네오 채소 도감 (DAENGS_CARDS)

강아지 네오가 채소가 된 트레이딩 카드 12장을, 포켓몬 카드 게임 포켓처럼 기울이고
반짝이게 만든 데모입니다. **HTML · CSS · JS 만으로 되어 있고 빌드 단계가 없습니다.**

원래 [`SAJOYO/DAENGS_dev`](https://github.com/SAJOYO/DAENGS_dev) 의
`frontend/public/neo-hologram/` 에 있던 폴더를, GitHub Pages 로 따로 서빙하려고
떼어낸 저장소입니다. 분리한 이유와 그때 정한 것들은 [docs/decisions.md](docs/decisions.md) 에 있습니다.

## 주소

| 환경 | 주소 |
| --- | --- |
| **정식 주소** | <https://cards.weareithero.cloud/> |
| Pages 기본 주소 | `https://sajoyo.github.io/DAENGS_CARDS/` — 위 주소로 301 리다이렉트됩니다 |

**둘 다 HTTPS 입니다.** 그게 이 저장소를 판 실질적인 이유입니다 — 폰의 자이로
기울기(`deviceorientation`)는 secure context 에서만 켜지는데, DAENGS 본체 배포는
nginx `:80` 이라 에러도 경고도 없이 조용히 안 켜졌습니다.

## 로컬에서 보기

빌드가 없으니 정적 서버 하나면 됩니다. **`file://` 로 열면 안 됩니다** —
ES 모듈과 `fetch` 가 `file:` 오리진에서 막힙니다.

```powershell
py -m http.server 5173        # 또는: npx serve .
```

- 도감 → `http://localhost:5173/index.html`
- 홀로 스튜디오 → `http://localhost:5173/studio.html`
- 3장 자동 대결 → `http://localhost:5173/battle.html` — 카드 선택·순서 변경·NPC 연습·재도전
- 채소 투척전 → `http://localhost:5173/throw.html` — 캐릭터 선택·버튼/Space 타이밍 투척·NPC·재도전
- 우당탕 식탁대전 → `http://localhost:5173/ringout.html` — 내 사진·3D 토마토/고구마·드래그 밀어내기·NPC

`py` 명령이 없는 PC에서는 `python -m http.server 5173 --bind 127.0.0.1`로 실행하고
`http://127.0.0.1:5173/battle.html`을 엽니다. 게임 규칙과 검증 방법은
[docs/battle.md](docs/battle.md)에 있습니다. 설치나 빌드는 필요하지 않습니다.

기존 미리보기가 5173을 사용 중이면 새 체크아웃에서
`python -m http.server 5175 --bind 127.0.0.1`을 실행합니다.
투척전은 `http://127.0.0.1:5175/throw.html`에서 열 수 있습니다.
캐릭터별 타이밍과 조작·검증 방법은 [docs/throw.md](docs/throw.md)에 있습니다.

식탁대전은 별도 미리보기가 필요하면 `python -m http.server 5177 --bind 127.0.0.1`로 실행하고
`http://127.0.0.1:5177/ringout.html`을 엽니다. 사진은 이 기기에만 저장하며,
조작·로컬 프로필·3D 런타임·비용 가정·실제 검증 범위는 [docs/ringout.md](docs/ringout.md)에 있습니다.

`localhost` 는 secure context 라 **개발 중에는 자이로가 켜집니다.** 폰으로 확인하려면
같은 LAN 에서 PC IP 로 접속해야 하는데 그건 secure context 가 아니라 안 켜집니다 —
방법은 도감 문서의 '폰에서 확인하기' 절을 보세요.

## 구성

| 경로 | 내용 |
| --- | --- |
| `index.html` | 도감. **CSS 링크 순서가 중요합니다** |
| `studio.html` | 홀로 스튜디오. 올린 이미지에 포일 12종을 입혀 봅니다 |
| `battle.html` `battle.css` `battle-ui.mjs` | 3장 자동 대결의 팀 편성·이벤트 재생·결과 화면 |
| `battle-data.mjs` `battle-engine.mjs` | ID 기반 전투 목록·연습 상대와 순수 전투 시뮬레이션 |
| `tests/battle.test.mjs` | Node 기본 테스트 러너로 전투 경계·모든 순서 팀 검증 |
| `throw.html` `throw.css` `throw-ui.mjs` | 채소 투척전의 선택·게이지·턴 재생·결과·일시정지 |
| `throw-data.mjs` `throw-engine.mjs` | ID 기반 타이밍 프로필·순수 판정·턴 전이·활성 시간 |
| `throw-renderer.mjs` `throw-audio.mjs` | 기존 누끼의 Canvas 연출과 선택적 Web Audio 합성 |
| `tests/throw.test.mjs` | 판정 경계·중복 이벤트·재시작·9대진 스크립트 검증 |
| `ringout.html` `ringout.css` `ringout-*.mjs` | 내 사진을 재사용하는 3D 채소 밀어내기·평면 물리·로컬 프로필 |
| `vendor/three/` | 고정된 Three.js 0.180.0 ES 모듈·MIT 라이선스·출처. 런타임 CDN 없음 |
| `cards.mjs` `main.js` `style.css` `rarity.css` `touch.css` | 도감 본체 |
| `immersive.css` `immersive.mjs` | No.01 전용 이머시브 뷰 |
| `tilt-engine.js` | 스튜디오와 내보낸 HTML 이 같이 쓰는 기울기 엔진 (자이로 포함) |
| `vendor/cards-css/` | [@kongyo2/cards-css](https://github.com/kongyo2/cards-css) 0.5.0 (MIT). **원본 그대로** |
| `art/` | 카드 그림 (webp 16장). 원본 PNG 는 이 저장소에 없습니다 |
| `.nojekyll` | Pages 가 `_` 로 시작하는 파일을 삼키지 않게 합니다 |
| `docs/` | [문서 색인](docs/README.md) |

각 파일이 무엇을 하고 왜 그렇게 되어 있는지는 [docs/hologram.md](docs/hologram.md) 에
있습니다 — 670줄이고, **다시 밟지 말 것** 목록이 거기 있습니다.

## 이 저장소의 전제

**빌드 단계를 두지 않습니다.** 그래서 npm 패키지를 `import` 할 수 없고, 필요한 건
`vendor/` 로 복사해 옵니다. Pages 도 워크플로우 없이 브랜치에서 그대로 서빙합니다.

이 전제를 깨는 변경(번들러 · 프레임워크 도입)은 저장소의 성격을 바꾸는 결정이라
[docs/decisions.md](docs/decisions.md) 에 남기고 하세요.

## 작업 방식

작업은 [`SAJOYO/projects/3`](https://github.com/orgs/SAJOYO/projects/3) 의 카드 한 장 =
PR 한 개 단위입니다. 팀 협업 규칙(우선순위 · Iteration · PR 을 먼저 여는 순서 · 회고)은
`DAENGS_dev` 의 `docs/collaboration.md` 가 정본이고, 여기서 **다른 점만**
[CLAUDE.md](CLAUDE.md) 에 적었습니다. 가장 중요한 차이는 이것입니다:

> ⚠️ **이 저장소는 `main` 이 배포 브랜치입니다.** `DAENGS_dev` · `DAENGS_APP` 은
> `dev` 가 default 이고 `main` 이 릴리즈 스냅샷인데, 여기는 반대입니다.
> Pages 가 `main` 을 그대로 서빙하므로 **`main` 에 머지되는 순간 배포됩니다.**

## 라이선스

MIT — [LICENSE](LICENSE). `vendor/cards-css/` 는 @kongyo2/cards-css 0.5.0 (MIT) 이고
같은 폴더에 원본 `LICENSE` 를 함께 둡니다.

`vendor/three/`는 Three.js 0.180.0 (MIT)이며 해당 폴더의 라이선스와 출처 기록을 함께 유지합니다.

`vendor/` 를 뺀 나머지(카드 그림 `art/` 포함)는 이 저장소의 라이선스를 따릅니다.
