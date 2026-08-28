# DAENGS_CARDS

네오 채소 도감. **빌드가 없는 정적 사이트**를 GitHub Pages 로 서빙합니다.
`SAJOYO/DAENGS_dev` 의 `frontend/public/neo-hologram/` 을 떼어낸 저장소입니다.

```
main 브랜치 (root)  →  GitHub Pages  →  https://sajoyo.github.io/DAENGS_CARDS/
                                        (커스텀 도메인은 미정 — docs/deploy.md)
```

## 폴더

| 경로 | 내용 |
| --- | --- |
| `index.html` | 도감. `<link>` **순서가 곧 CSS 우선순위**입니다 (아래 규칙) |
| `studio.html` | 홀로 스튜디오 (별도 페이지) |
| `cards.mjs` | 카드 12장의 데이터 |
| `main.js` `style.css` `rarity.css` `touch.css` | 도감 그리드 · 확대 뷰 · 표면 |
| `immersive.css` `immersive.mjs` | No.01 전용 이머시브 뷰 |
| `tilt-engine.js` | 기울기 입력(포인터 · 키보드 · 자이로). 모듈이 아닙니다 |
| `vendor/cards-css/` | 남의 MIT 라이브러리. **원본 그대로, 손대지 않습니다** |
| `art/` | 카드 그림 webp. 원본 PNG 는 여기 없습니다 |
| `.nojekyll` | Pages 의 Jekyll 처리를 끕니다 |
| `CNAME` | 커스텀 도메인의 **정본**. 아직 없습니다 (docs/deploy.md 2단계) |
| `docs/decisions.md` | 이 저장소의 의사결정 기록 (`CARDS-001 ~`) |
| `docs/deploy.md` | Pages · DNS · HTTPS 절차와 함정 |
| `docs/migration.md` | 원본 폴더를 히스토리 살려 옮기는 절차 |
| `docs/hologram.md` | 이관해 온 도감 문서. **작업 전에 읽어야 하는 것은 이쪽입니다** |

## 명령어

```powershell
py -m http.server 5173     # 또는 npx serve .  — 빌드도 install 도 없습니다
```

`file://` 로 열지 마세요. ES 모듈과 `fetch` 가 막혀서, 코드는 멀쩡한데 화면만 빕니다.

## 규칙

- **`main` 이 배포 브랜치입니다.** `DAENGS_dev` · `DAENGS_APP` 과 **반대**입니다
  (저쪽은 `dev` 가 default, `main` 이 릴리즈 스냅샷). 여기는 Pages 가 `main` 의 루트를
  그대로 서빙하므로 **머지가 곧 배포**입니다. 작업 브랜치는 `main` 에서 따고 `main` 으로
  머지합니다. 습관적으로 `git switch -c ... dev` 를 치면 브랜치가 없습니다.
- **빌드를 도입하지 마세요.** 번들러도 `node_modules` 도 없는 것이 이 저장소의 전제입니다.
  npm 패키지가 필요하면 `import` 가 아니라 `vendor/` 로 복사해 옵니다.
  이 전제를 깨는 변경은 `docs/decisions.md` 에 남기고 하세요.
- **경로는 전부 상대 경로로.** `./style.css` · `./vendor/...` 처럼 씁니다.
  ⚠️ 절대 경로(`/foo`)를 쓰면 **Pages 기본 주소(`/DAENGS_CARDS/` 서브패스)에서만 깨지고
  커스텀 도메인에서는 멀쩡합니다.** 즉 도메인을 붙이기 전에는 잘 되다가 나중에 터지거나,
  그 반대가 됩니다. 이관 시점 기준 절대 경로 에셋은 0건이었습니다 — 그 상태를 유지하세요.
- **DAENGS 본체로 돌아가는 링크는 절대 URL 이어야 합니다.** 원본에서는 `index.html` 의
  `<a class="back" href="/">← DAENGS</a>` 였는데, 이 저장소에서 `/` 는 **도감 자기 자신**입니다.
  이 저장소에서 유일하게 절대 URL 이 허용되는 자리입니다.
  ⚠️ **그 주소가 `http://daengs.weareithero.cloud/` 인 것은 의도입니다.** 본체는 nginx `:80`
  평문이라 TLS 가 없습니다. 도감은 HTTPS 인데 링크만 http 라 "고쳐야 할 것"처럼 보이지만,
  `https://` 로 바꾸면 **연결 자체가 안 됩니다.** 링크 이동(top-level navigation)은 mixed
  content 차단 대상이 아니라 그대로 동작합니다 — 막히는 건 스크립트·스타일·이미지 같은
  하위 리소스입니다. 다만 크롬은 http 주소를 **자동으로 https 로 한 번 시도했다가 실패 후
  되돌아오므로** 이동이 살짝 느립니다. 본체에 TLS 가 붙는 날 같이 바꾸세요.
- **`vendor/cards-css/` 는 업스트림 원본입니다.** 세기를 조절하고 싶으면 그 파일이 아니라
  `rarity.css` 의 '다리' 블록에서 하세요. 원본을 고치면 버전을 올릴 때 조용히 되돌아갑니다.
  `LICENSE` 를 같은 폴더에서 빼지 마세요 — MIT 의 조건입니다.
- **`index.html` 의 `<link>` 순서를 바꾸지 마세요.** 특정도가 같아서 **순서로만** 갈립니다.
  `rarity.css` → `vendor/cards-css/*` → `touch.css` 순이고, `touch.css` 는 켜는 규칙을 끄는
  쪽이라 반드시 맨 뒤입니다. 포일을 추가할 때는 **`<link>` · `vendor/` 의 파일 ·
  `cards.mjs` 의 `CARDS_CSS_EFFECTS` 셋이 다 맞아야** 화면에 나옵니다. 하나만 빠지면
  에러 없이 그냥 안 보입니다.
- **`CNAME` 파일을 지우지 마세요.** 커스텀 도메인의 정본은 UI 가 아니라 저장소 루트의
  이 파일이고, GitHub 이 UI 설정을 그 파일로 커밋합니다. `--force` push 나 폴더 통째
  덮어쓰기로 날리면 **도메인이 조용히 풀립니다.** 같은 이유로 이 저장소에는
  force push 를 하지 않습니다.
- **`.nojekyll` 을 지우지 마세요.** 지금은 `_` 로 시작하는 파일이 0건이라 없어도 돌지만,
  나중에 하나만 생겨도 그 파일이 배포에서 조용히 빠져 404 가 됩니다.
- **이 저장소가 도감의 정본입니다.** 같은 코드의 사본이 최소 둘 더 있습니다 —
  개인 저장소 `choiyc05/gohome` 의 `projects/neo-hologram/`(webp 변환기가 **거기에만**
  있습니다) 과 `SAJOYO/DAENGS_APP` 의 Compose 이식본입니다. 셋을 양방향으로 고치면
  분리한 의미가 없어집니다. 여기서 고치고, 필요한 것만 저쪽으로 내보내세요.
  `DAENGS_APP` 쪽 카드들이 `immersive.mjs` 를 '저쪽' 이라고 부르며 옛 경로를 가리키고
  있으니, 만나면 그 본문의 위치 설명도 같이 고쳐 주세요.
- **원본 아트(PNG)는 이 저장소에 없습니다.** `art/` 의 webp 만 옵니다. 원본은
  `DAENGS_dev` 의 `tools/art-src/`(gitignore) 에 있고, webp 변환기는 `gohome` 에 있습니다.
  그림을 새로 넣어야 하면 먼저 그 둘의 위치부터 확인하세요.
- **되돌리기 번거로운 결정은 `docs/decisions.md` 에 `CARDS-0xx` 로 남깁니다.**
  접두사가 `D-` 가 아닌 것은 의도입니다 — `DAENGS_dev` 의 `D-` 와 번호가 겹치면서
  뜻이 남남이 되는 일을 저쪽에서 이미 한 번 겪었습니다.
- **작업 단위는 `SAJOYO/projects/3` 의 카드이고, 이슈는 쓰지 않습니다.** PR 을 작업 '후'가
  아니라 '전'에 엽니다 (빈 커밋 → push → draft PR → 작업). 협업 규칙의 정본은
  `DAENGS_dev` 의 `docs/collaboration.md` 이고, **여기서 다른 것은 배포 브랜치뿐**입니다.
  작업 전에 `gh pr view --json title,body -q '.title, .body'` 로 PR 본문을 먼저 읽으세요.
  (`gh auth refresh -h github.com -s project` 를 한 번 해 두어야 `gh project` 가 돕니다.)
- **이 저장소는 public 입니다.** SAJOYO 가 Free 플랜이라 private 에는 Pages 를 못 켜서
  그렇게 정했습니다 (`CARDS-001`). 키 · 토큰 · 내부 주소가 커밋에 섞이지 않게 하세요.
  DAENGS 본체의 API 주소를 여기 하드코딩할 일이 생기면 그때 다시 판단해야 합니다.
