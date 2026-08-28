# 문서

| 파일 | 내용 |
| --- | --- |
| [decisions.md](decisions.md) | 의사결정 기록 (`CARDS-001 ~`) 과 아직 안 정한 것 |
| [deploy.md](deploy.md) | GitHub Pages · DNS · HTTPS 절차와 함정. Discord 알림 |
| [migration.md](migration.md) | 원본 폴더를 **히스토리 살려서** 옮기는 절차. 이관 전 필독 |
| [hologram.md](hologram.md) | 도감 자체의 문서 (670줄). 카드·포일·제스처·효과 예산·스튜디오 |

`hologram.md` 는 `DAENGS_dev` 의 `frontend/public/neo-hologram/README.md` 였던 문서입니다.
이관하면서 Next 의 `public/` 을 전제한 서술 15곳을 고쳤습니다 (실행 주소 · 자이로 · 원본 아트 위치). 카드와 포일 · 세기 조정 · 폰 제스처 · 효과 예산 · 홀로 스튜디오 · **다시 밟지
말 것** 이 거기 있습니다. **코드를 고치기 전에 읽어야 하는 것은 이 문서입니다** —
아래 세 문서는 저장소를 운영하는 방법이고, 도감이 왜 그렇게 생겼는지는 저기 있습니다.

## 여기 없는 것

- **협업 규칙** — 우선순위(P0~P3) · Iteration · PR 을 먼저 여는 순서 · 데일리 · 회고는
  `SAJOYO/DAENGS_dev` 의 `docs/collaboration.md` 가 정본입니다. 여기 옮겨 적지 않은 것은
  의도입니다 — 같은 규칙의 두 번째 주장이 생기면 반드시 어긋납니다.
  **이 저장소에서 다른 것은 배포 브랜치 하나뿐**이고, 그건 [CLAUDE.md](../CLAUDE.md) 에
  적었습니다 (여기는 `main` 이 배포 브랜치입니다).
- **`D-` 번호** — `DAENGS_dev` 의 결정 기록입니다. 이 저장소를 판 결정은 저쪽 `D-022` 와
  여기 `CARDS-001` 양쪽에 있고, 서로 다른 것을 적습니다.

코드 규칙은 [CLAUDE.md](../CLAUDE.md), 실행·주소는 루트 [README.md](../README.md) 에 있습니다.
