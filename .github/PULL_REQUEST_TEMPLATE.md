<!--
이 PR 은 Project 3 (orgs/SAJOYO/projects/3) 의 카드 한 장입니다.
Iteration 은 3~4일이고, 그 안에서 이 PR 을 열고 끝나면 머지합니다.
이슈는 쓰지 않습니다 — 이 PR 본문이 그 작업의 유일한 기록입니다.

⚠️ 이 저장소는 base 가 `main` 입니다. DAENGS_dev · DAENGS_APP 과 반대입니다.
   GitHub Pages 가 `main` 의 루트를 그대로 서빙하므로 머지가 곧 배포입니다.

담당자 / 상태 / 기간 / Iteration / Size / Priority 는 Project 필드에 있습니다.
여기에 다시 적지 마세요. 두 군데가 되면 반드시 어긋납니다.

제목이 곧 보드의 카드 이름입니다: `타입: 무엇을` (예: `feat: 포일 3종 추가`).
타입은 feat / fix / docs / refactor / build / chore.

Claude Code 에게:
- 작업 전에 `gh pr view --json title,body -q '.title, .body'` 로 이 본문을 먼저 읽으세요.
  Project 필드까지 봐야 하면 `gh project item-list 3 --owner SAJOYO`.
  (`gh auth refresh -h github.com -s project` 를 한 번 해 두어야 돕니다.)
- 저장소 규칙은 루트 `CLAUDE.md`, 도감 자체의 배경은 `docs/hologram.md` 에 있습니다.
- 아래 `##` 제목은 고정입니다. 제목은 두고 내용만 채우세요.
  해당 없는 섹션은 `- 없음` 한 줄로 두고, 섹션 자체를 지우지는 마세요.
- 작업 중 본문이 낡으면 `gh pr edit --body-file <파일>` 로 갱신하세요.
  특히 `## 컨텍스트 메모` 는 다음 세션의 Claude 가 읽는 유일한 인수인계입니다.
- 되돌리기 번거로운 결정은 여기 말고 `docs/decisions.md` 에 적고 번호(CARDS-0xx)만 남기세요.
- 협업 규칙(우선순위 · Iteration · PR 기준 · 회고)의 정본은 DAENGS_dev 의
  `docs/collaboration.md` 입니다. 여기서 다른 것은 배포 브랜치뿐입니다.
-->

## 무엇을 / 왜

<!-- 2~4줄. 커밋 목록 말고 의도. "왜 지금 이게 필요했는지"가 빠지면 안 됩니다. -->

## 작업 목록

<!-- 이 PR 안에서 쪼갠 단위. 영역 태그: FE / ART / INFRA / DOCS -->

- [ ] `FE`
- [ ] `DOCS`

## 컨텍스트 메모

<!--
코드를 봐도 알 수 없는 것만. 다음 사람(과 다음 세션의 Claude)이 모르면 같은 실수를 할 것들.
예)
- 포일 세기는 실측으로 정한 값. vendor 원본이 아니라 rarity.css 의 '다리' 블록에서 조절.
- 이 CSS 링크는 touch.css 보다 앞에 와야 함 — 특정도가 같아서 순서로만 갈림.
- 자이로는 secure context 에서만 켜짐 → CARDS-001
-->

- 없음

## 배포 영향

<!-- main 에 머지되는 순간 Pages 가 배포합니다. 해당하는 것만 체크. -->

- [ ] 없음 — 코드만 바뀜, 추가 조치 불필요
- [ ] `CNAME` · Pages 설정 변경 → **저장소 밖 조치가 필요** (docs/deploy.md)
- [ ] DNS 레코드 변경 → 전파까지 몇 분 ~ 24h
- [ ] DAENGS 본체(`DAENGS_dev` · `DAENGS_APP`) 쪽도 같이 고쳐야 함

필요한 조치:

## 확인한 것

- [ ] 정적 서버로 로컬 확인 (`py -m http.server 5173`). **`file://` 말고**
- [ ] 콘솔에 404 가 없음 — CSS 하나가 빠져도 **에러 없이** 포일만 안 나옵니다
- [ ] 절대 경로(`/foo`)를 새로 만들지 않음. 본체로 돌아가는 링크만 예외
- [ ] `vendor/cards-css/` 원본과 `LICENSE` 를 건드리지 않음
- [ ] 폰에서 확인이 필요한 변경이면 실제 기기에서 봤음 (자이로 · 터치 · 효과 예산)

## 남은 것

<!-- 못 끝냈거나 하다 보니 새로 생긴 일. 다음 Iteration 카드가 여기서 만들어집니다. -->

- 없음
