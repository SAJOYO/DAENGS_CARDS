# 이관 절차 — `frontend/public/neo-hologram/` → 이 저장소

`SAJOYO/DAENGS_dev` 의 `frontend/public/neo-hologram/` 을 **커밋 히스토리를 살려서**
이 저장소의 루트로 옮깁니다. 왜 복붙하면 안 되는지는 [CARDS-002](decisions.md#cards-002).

> **아직 아무것도 실행하지 않았습니다.** 이 문서는 절차이고, 실행은 카드
> `build: 홀로그램 도감을 GitHub Pages 로 분리` 의 PR 안에서 합니다.

## 0. 전제 확인

```powershell
gh repo view SAJOYO/DAENGS_CARDS --json visibility,defaultBranchRef
# visibility=PUBLIC · defaultBranchRef=main 이어야 합니다 (CARDS-001)
git -C <DAENGS_dev 경로> switch dev
git -C <DAENGS_dev 경로> pull
```

`dev` 가 최신이 아니면 최근 커밋이 split 에서 빠집니다.

## 1. 원본에서 폴더만 뽑기 (`DAENGS_dev` 저장소에서)

```powershell
git subtree split -P frontend/public/neo-hologram -b neo-hologram-split
```

이 폴더를 건드린 커밋만 골라, **폴더 안이 루트가 된** 브랜치를 하나 만듭니다.
`DAENGS_dev` 의 `dev` 는 전혀 바뀌지 않습니다 — 브랜치 하나가 늘 뿐입니다.

```powershell
git log --oneline neo-hologram-split | measure   # 커밋이 6~7개면 정상
git ls-tree --name-only neo-hologram-split       # index.html 이 루트에 보여야 합니다
```

`frontend/` 가 보이면 `-P` 경로가 틀린 것입니다.

## 2. 이 저장소로 밀어넣기 (계속 `DAENGS_dev` 에서)

```powershell
git remote add cards https://github.com/SAJOYO/DAENGS_CARDS.git
git push cards neo-hologram-split:import/neo-hologram
```

⚠️ **`main` 으로 바로 밀지 마세요.** 두 히스토리는 남남이라 거절당하고,
`--force` 로 뚫으면 이 저장소의 초기 커밋과 문서가 통째로 날아갑니다.
받는 곳은 반드시 `import/neo-hologram` 같은 별도 브랜치입니다.

## 3. 합치기 (이 저장소에서)

```powershell
git fetch origin
git switch -c build/import-hologram main
git commit --allow-empty -m "build: 홀로그램 도감을 GitHub Pages 로 분리"
git push -u origin build/import-hologram
gh pr create --draft --base main
```

PR 을 먼저 열고 (협업 규칙 4절), 그 안에서 머지합니다.

```powershell
git merge origin/import/neo-hologram --allow-unrelated-histories
```

`--allow-unrelated-histories` 가 없으면 git 이 거부합니다. **정상입니다** —
두 히스토리에 공통 조상이 없다는 뜻이고, 여기서는 의도한 상황입니다.

### 충돌은 `README.md` 한 건입니다

양쪽이 각자 `README.md` 를 새로 만들었으므로 add/add 충돌이 납니다.
**루트는 이 저장소의 것을 쓰고, 넘어온 671줄짜리 도감 문서는 `docs/` 로 내립니다.**

```powershell
git checkout --ours -- README.md
git show origin/import/neo-hologram:README.md > docs/hologram.md
git add README.md docs/hologram.md
git commit
```

넘어온 문서를 버리지 마세요. 실측으로 정한 숫자와 '다시 밟지 말 것' 목록이 거기 있고,
이 저장소에서 **작업 전에 실제로 읽어야 하는 문서**입니다.

### 합친 뒤 손볼 곳

`docs/hologram.md` 는 "Next 의 `public/` 안에 있는 폴더" 를 전제로 쓰여 있습니다.
아래를 고치세요 (전부 문서 안의 서술입니다).

| 위치 | 지금 | 고칠 방향 |
| --- | --- | --- |
| 맨 위 실행 주소 | `http://localhost:3000/neo-hologram/index.html` | 정적 서버 주소 (README 참고) |
| `/neo-hologram/` 404 설명 | Next 가 디렉터리 인덱스를 안 잡아줌 | Pages 는 `index.html` 을 잡아 줍니다 — 이 절은 삭제 |
| '이 폴더의 전제' | `public/` 안의 정적 파일 | 저장소 전체가 정적 사이트 |
| `docs/decisions.md` 참조 | `DAENGS_dev` 의 `D-` | 이 저장소의 `CARDS-` |
| '자이로가 배포에서는 안 켜집니다' | nginx `:80` | **해소됨** — Pages 는 HTTPS |
| `art/` 원본 PNG 위치 | `tools/art-src/` | `DAENGS_dev` 쪽이라고 명시 |

### 코드에서 고칠 곳은 한 줄입니다

```html
<!-- index.html -->
<a class="back" href="/">← DAENGS</a>
```

이 저장소에서 `/` 는 **도감 자기 자신**입니다. DAENGS 본체의 절대 URL 로 바꾸세요.
이관 시점 기준 **이것이 저장소 전체에서 유일한 절대 경로 참조**였습니다
(`./style.css` · `./vendor/cards-css/*` · `cards.mjs` 의 `art/cabbage.webp` 까지 전부
상대 경로, `fetch` 두 곳(`immersive.mjs` · `studio.mjs`)도 상대 경로 문자열).
Vite/Next 를 Pages 에 올릴 때 제일 많이 터지는 `base` 문제가 여기엔 없습니다.

### 확인

```powershell
py -m http.server 5173
```

- 도감 · 스튜디오가 뜨고 `vendor/` 포일 11종이 다 먹는지
- 콘솔에 404 가 없는지 (CSS 링크 하나만 빠져도 **에러 없이** 포일만 안 나옵니다)
- `← DAENGS` 가 본체로 가는지

## 4. 정리

```powershell
git -C <DAENGS_dev 경로> remote remove cards
git -C <DAENGS_dev 경로> branch -D neo-hologram-split
git push origin --delete import/neo-hologram      # 이 저장소에서. 머지됐으므로 안전
```

`import/neo-hologram` 은 지워도 됩니다 — 커밋은 `main` 히스토리 안에 그대로 있습니다.

## 5. 원본 저장소 쪽 (`DAENGS_dev`, 별도 PR)

⚠️ **링크 교체와 폴더 삭제는 반드시 같은 PR 에서** 합니다. 사이에 404 구간을 두지
않기 위한 것입니다.

- `frontend/app/page.tsx:14` 의 `href: "/neo-hologram/index.html"` → 새 주소.
  외부 링크가 되므로 `next/link` 를 `<a target="_blank" rel="noreferrer">` 로 바꿀지 판단
- `frontend/public/neo-hologram/` 삭제
- 남은 경로 참조 3곳 — `tools/pngdiff.py:32` (헤드리스 촬영 URL),
  `tools/neo-hologram-layers.py`, `.gitignore:234-235` (`tools/art-src/` 주석).
  새 저장소로 갈 것과 저쪽에 남을 것을 가릅니다
- `docs/decisions.md` 에 **D-022** — "도감을 조직 public 저장소 + Pages 로 분리"
- `CLAUDE.md` 폴더 표에서 `frontend/public/neo-hologram` 자리를 정리하고 이 저장소를 가리키기
- `npm run lint` (`page.tsx` 를 건드렸으므로)

`DAENGS_APP` 의 Hold 카드 둘(`feat: 도감 진입을 눌린 카드 자리에서 시작 (FLIP)` ·
`chore: 저쪽에 배추 겹 원화 요청`)이 `immersive.mjs` 를 '저쪽' 으로 부르며 옛 경로를
가리킵니다. **그 두 카드 본문의 위치 설명도 같이 고쳐야** 다음 사람이 헤매지 않습니다.
