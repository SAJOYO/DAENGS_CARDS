# 네오 채소 도감 (DAENGS_CARDS)

강아지 네오가 채소가 된 트레이딩 카드 12장을, 포켓몬 카드 게임 포켓처럼 기울이고
반짝이게 만든 데모입니다. **HTML · CSS · JS 만으로 되어 있고 빌드 단계가 없습니다.**

원래 [`SAJOYO/DAENGS_dev`](https://github.com/SAJOYO/DAENGS_dev) 의
`frontend/public/neo-hologram/` 에 있던 폴더를, GitHub Pages 로 따로 서빙하려고
떼어낸 저장소입니다. 분리한 이유와 그때 정한 것들은 [docs/decisions.md](docs/decisions.md) 에 있습니다.

> **현재 상태: 이관 전입니다.** 이 저장소에는 아직 도감 코드가 없습니다.
> 원본 폴더를 **커밋 히스토리를 살려서** 옮기는 절차가
> [docs/migration.md](docs/migration.md) 에 있습니다. 복붙하지 마세요.
> 이관이 끝나면 이 인용 블록을 지우고 아래 '주소' 에 실제 URL 을 넣으세요.

## 주소

| 환경 | 주소 |
| --- | --- |
| Pages (기본) | `https://sajoyo.github.io/DAENGS_CARDS/` — 이관·Pages 활성화 후 |
| 커스텀 도메인 | 미정. 서브도메인 이름이 아직 안 정해졌습니다 ([docs/deploy.md](docs/deploy.md) 2단계) |

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

`localhost` 는 secure context 라 **개발 중에는 자이로가 켜집니다.** 폰으로 확인하려면
같은 LAN 에서 PC IP 로 접속해야 하는데 그건 secure context 가 아니라 안 켜집니다 —
방법은 도감 문서의 '폰에서 확인하기' 절을 보세요.

## 구성 (이관 후)

| 경로 | 내용 |
| --- | --- |
| `index.html` | 도감. **CSS 링크 순서가 중요합니다** |
| `studio.html` | 홀로 스튜디오. 올린 이미지에 포일 12종을 입혀 봅니다 |
| `cards.mjs` `main.js` `style.css` `rarity.css` `touch.css` | 도감 본체 |
| `immersive.css` `immersive.mjs` | No.01 전용 이머시브 뷰 |
| `tilt-engine.js` | 스튜디오와 내보낸 HTML 이 같이 쓰는 기울기 엔진 (자이로 포함) |
| `vendor/cards-css/` | [@kongyo2/cards-css](https://github.com/kongyo2/cards-css) 0.5.0 (MIT). **원본 그대로** |
| `art/` | 카드 그림 (webp 16장). 원본 PNG 는 이 저장소에 없습니다 |
| `.nojekyll` | Pages 가 `_` 로 시작하는 파일을 삼키지 않게 합니다 |
| `docs/` | [문서 색인](docs/README.md) |

각 파일이 무엇을 하고 왜 그렇게 되어 있는지는 이관해 온 도감 문서
(`docs/hologram.md`) 에 있습니다 — 600줄이 넘고, **다시 밟지 말 것** 목록이 거기 있습니다.

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

`vendor/` 를 뺀 나머지(카드 그림 `art/` 포함)는 이 저장소의 라이선스를 따릅니다.
