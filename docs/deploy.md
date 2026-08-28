# 배포 — GitHub Pages

빌드가 없으므로 **브랜치를 그대로 서빙**합니다. Actions 워크플로우는 두지 않습니다
([CARDS-003](decisions.md#cards-003)).

```
main 브랜치의 / (root)  →  GitHub Pages  →  https://sajoyo.github.io/DAENGS_CARDS/
```

**`main` 에 머지되는 순간 배포됩니다.** 반영까지 보통 1분 안쪽이고, Actions 탭의
`pages build and deployment` 에서 진행 상태를 볼 수 있습니다.

---

## 1단계 — Pages 켜기 (도메인 없이)

> 이것만으로 **HTTPS 가 붙고 폰 자이로가 켜집니다.** 이 저장소를 판 실질적인 이득은
> 여기서 이미 다 나옵니다 ([CARDS-004](decisions.md#cards-004)).

Settings → Pages → Source: **Deploy from a branch** / Branch: `main` / Folder: `/ (root)`.

CLI 로도 됩니다:

```powershell
gh api -X POST repos/SAJOYO/DAENGS_CARDS/pages -f "source[branch]=main" -f "source[path]=/"
gh api repos/SAJOYO/DAENGS_CARDS/pages --jq '"\(.status) \(.html_url)"'
```

### 확인

- [ ] `https://sajoyo.github.io/DAENGS_CARDS/` 에서 도감이 뜨는지
- [ ] `/studio.html` 이 뜨고 포일 11종이 다 먹는지
- [ ] 콘솔에 404 가 없는지 — **CSS 하나가 빠져도 에러 없이 포일만 안 나옵니다**
- [ ] **폰에서 자이로가 실제로 켜지는지.** 이게 핵심 검증입니다.
      iOS 는 첫 탭에서 권한 팝업이 뜹니다. 거절해도 포인터 입력은 그대로 남습니다
- [ ] `← DAENGS` 가 본체로 돌아가는지

### 함정

- **`.nojekyll` 을 지우지 마세요.** 없으면 Pages 가 Jekyll 로 처리하면서 `_` 로 시작하는
  파일·폴더를 배포에서 뺍니다. 지금은 해당 파일이 0건이라 없어도 돌지만, 나중에 하나만
  생겨도 **에러 없이 404** 가 됩니다. 그래서 미리 넣어 둡니다.
- **서브패스입니다.** 기본 주소는 `/DAENGS_CARDS/` 아래입니다. 절대 경로(`/foo`)를 쓰면
  여기서만 깨지고 커스텀 도메인에서는 멀쩡해서, 원인을 엉뚱한 데서 찾게 됩니다.
  경로는 전부 상대 경로로 두세요.
- **소프트 리밋은 저장소 1GB · 월 100GB 대역폭**입니다. 지금 41개 파일 3.5MB 라
  걱정할 규모가 아니지만, 원본 PNG 를 여기 올리기 시작하면 달라집니다.

---

## 2단계 — 커스텀 도메인 (서브도메인 미정)

**이름이 안 정해져 있어 아직 못 합니다.** `cards.` / `dex.` / `holo.` 중 하나로
정해지면 아래를 그대로 밟습니다. apex(`weareithero.cloud`)로 가려면 `CNAME` 대신
A 4개 + AAAA 4개가 필요하고 도메인 본체를 이 데모가 차지하므로 **서브도메인을 권합니다.**

### ① DNS

| 종류 | 이름 | 값 |
| --- | --- | --- |
| `CNAME` | `<서브도메인>` | `SAJOYO.github.io` |

### ② 조직 도메인 검증 (먼저 하세요)

Org Settings → Pages → Add a domain. `_github-pages-challenge-SAJOYO` TXT 레코드를
넣으라고 안내합니다.

**안 하면 남이 가로챌 수 있습니다** — dangling DNS 하이재킹. 다른 사람이 자기 저장소에
같은 커스텀 도메인을 등록해 버리는 형태입니다. `weareithero.cloud` 를 통째로 검증해 두면
하위 서브도메인 전부가 보호됩니다. 조직 저장소라 더 필요합니다.

### ③ 저장소에 도메인 등록

Settings → Pages → Custom domain 에 넣습니다.

**정본은 UI 가 아니라 저장소 루트의 `CNAME` 파일입니다.** UI 에서 설정하면 GitHub 이
그 파일을 커밋합니다. 나중에 `--force` push 나 폴더 통째 덮어쓰기로 날리면
**도메인이 조용히 풀립니다.** 그래서 이 저장소에는 force push 를 하지 않습니다.

### ④ `Enforce HTTPS`

체크박스가 활성화되기까지 DNS 전파 후 몇 분 ~ 24시간 걸립니다. 회색이면 아직
인증서가 발급되지 않은 것입니다.

**인증서는 사지 않습니다.** GitHub 이 Let's Encrypt 를 자동 발급 · 자동 갱신합니다.
`.cloud` TLD 도 문제없습니다.

### ⚠️ Cloudflare 를 쓴다면

- **프록시(주황 구름)를 켠 채로는 인증서 발급이 실패**하고 `Enforce HTTPS` 가 회색으로
  남습니다. **DNS-only(회색)로 두고 발급을 받은 뒤** 켜세요.
- 프록시를 켤 거면 SSL 모드를 반드시 **Full (strict)** 로. `Flexible` 이면 GitHub 의
  HTTPS 강제와 물려 **무한 리다이렉트**가 납니다.

### 확인

- [ ] `Enforce HTTPS` 가 켜져 있고, http 접근이 https 로 넘어가는지
- [ ] 루트(`/`)로 바뀌었으니 서브패스에서 되던 것이 그대로 되는지
- [ ] 본체 랜딩의 도감 링크가 새 주소로 가는지 ([migration.md](migration.md) 5절)

---

## 알림

`push` · `pull_request` 이벤트가 팀 Discord 채널로 갑니다 (저장소 웹훅).
`DAENGS_dev`(push) · `DAENGS_APP`(push + pull_request) 과 같은 채널입니다.

```powershell
gh api repos/SAJOYO/DAENGS_CARDS/hooks --jq '.[] | "\(.id) \(.events) active=\(.active)"'
```

웹훅 URL 에는 Discord 토큰이 들어 있습니다. **문서·커밋에 적지 마세요** — 위 명령처럼
필요할 때 조회하면 됩니다. 알림이 안 오면 Settings → Webhooks 의 Recent Deliveries 에서
응답 코드를 먼저 보세요 (`401` 이면 Discord 쪽에서 웹훅이 지워진 것입니다).
