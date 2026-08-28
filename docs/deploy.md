# 배포 — GitHub Pages

빌드가 없으므로 **브랜치를 그대로 서빙**합니다. Actions 워크플로우는 두지 않습니다
([CARDS-003](decisions.md#cards-003)).

```
main 브랜치의 / (root)  →  GitHub Pages  →  https://cards.weareithero.cloud/
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

## 2단계 — 커스텀 도메인 `cards.weareithero.cloud` ✅ 완료 (2026-08-28)

도메인은 **가비아**에서 샀고 네임서버도 가비아입니다 (`ns.gabia.co.kr` · `ns.gabia.net` ·
`ns1.gabia.co.kr`). 그래서 DNS 는 **My가비아 → 서비스관리 → 도메인 → DNS 정보 → DNS 관리**
에서 고칩니다.

**apex(`weareithero.cloud`)는 쓸 수 없습니다.** 이미 A `218.145.159.122` 로 자체 서버를
가리키고 있고(`daengs.` 와 같은 IP), apex 로 가려면 그걸 뺏고 A 4개 + AAAA 4개를 넣어야 합니다.
서브도메인이 유일하게 합리적인 선택입니다.

### ⚠️ 순서를 뒤집으면 사이트가 양쪽 다 죽습니다

커스텀 도메인을 등록하는 순간 `sajoyo.github.io/DAENGS_CARDS/` 가 새 도메인으로
리다이렉트됩니다. DNS 가 아직 안 풀렸으면 **갈 곳이 없습니다.**
**① DNS → ② 전파 확인 → ③ GitHub 설정** 순서를 지키세요.

### ① 가비아 DNS 에 CNAME 1건

| 타입 | 호스트 | 값/위치 | TTL |
| --- | --- | --- | --- |
| `CNAME` | `cards` | `sajoyo.github.io.` | 3600 |

함정이 셋입니다:

- **값 끝에 점(`.`)을 반드시 찍습니다.** 가비아는 FQDN 표기를 요구해서, 점을 빼면
  `sajoyo.github.io.weareithero.cloud` 로 해석됩니다. **가장 흔한 실수입니다.**
- **호스트에는 `cards` 만** 넣습니다 — `cards.weareithero.cloud` 가 아닙니다.
- **"확인" → "저장"** 을 둘 다 눌러야 반영됩니다. 가비아는 저장이 2단계라, 확인만 누르고
  창을 닫으면 아무 일도 일어나지 않습니다.

⚠️ **가비아의 웹 포워딩 서비스를 쓰면 안 됩니다.** Pages 가 깨집니다. 순수 DNS 레코드만입니다.

### ② 전파 확인 — 이게 되기 전에 ③으로 가지 마세요

```powershell
nslookup cards.weareithero.cloud 8.8.8.8
```

`sajoyo.github.io` 가 나오면 됩니다. 보통 10분 ~ 1시간.

### ③ GitHub 저장소에 도메인 등록

Settings → Pages → Custom domain 에 `cards.weareithero.cloud` → Save.

**정본은 UI 가 아니라 저장소 루트의 `CNAME` 파일입니다.** UI 에서 설정하면 GitHub 이 그
파일을 `main` 에 커밋하므로, 로컬이 뒤처집니다 — **`git pull` 하세요.** 나중에 `--force`
push 나 폴더 통째 덮어쓰기로 날리면 **도메인이 조용히 풀립니다.** 그래서 이 저장소에는
force push 를 하지 않습니다.

### ④ `Enforce HTTPS`

**인증서는 사지 않습니다.** 가비아가 SSL 상품을 권하지만 GitHub 이 커스텀 도메인에
Let's Encrypt 를 자동 발급·자동 갱신합니다. `.cloud` TLD 도 문제없습니다.

체크박스가 활성화되기까지 DNS 체크 통과 후 몇 분 ~ 24시간 걸립니다. 회색이면 아직
발급 전입니다.

### ⑤ 조직 도메인 검증 ✅ 완료 (2026-08-28)

**Pages 동작의 전제가 아닙니다.** 남이 자기 저장소에 같은 커스텀 도메인을 등록해 가로채는
것(dangling DNS 하이재킹)을 막는 장치입니다. 확인은
`gh api repos/SAJOYO/DAENGS_CARDS/pages --jq .protected_domain_state` → `verified`.

> 🚫 **apex(`weareithero.cloud`)는 검증하지 않습니다. 이 도메인은 여러 팀(여러 org)이
> 나눠 씁니다** — 자세한 이유는 [`CARDS-007`](decisions.md#cards-007).
> **쓰는 서브도메인을 각각 검증합니다.**

순서가 **깃허브 → 가비아 → 깃허브** 로 한 번 왕복합니다. 깃허브가 토큰을 먼저 만들어야
가비아에 넣을 값이 생깁니다.

**① 깃허브에서 토큰 받기** — Org Settings → Pages → Add a domain 에 **쓰는 서브도메인**
(예: `cards.weareithero.cloud`)을 넣습니다. TXT 의 이름과 값이 화면에 나옵니다.
**여기서 Verify 를 누르지 마세요** — 가비아에 넣기 전에 누르면 실패합니다.

**② 가비아에 TXT 추가**

| 타입 | 호스트 | 값 | TTL |
| --- | --- | --- | --- |
| `TXT` | `_github-pages-challenge-SAJOYO.cards` | 깃허브가 준 값 | 3600 |

- **호스트는 이름 전체가 아니라 `.weareithero.cloud` 를 뺀 앞부분**만 넣습니다.
- ⚠️ **밑줄(`_`)로 시작합니다.** 관리툴이 거부하거나 잘라내면 멈추고 기록하세요.
  (2026-08-28 실측으로는 가비아가 그대로 받았습니다.)
- ⚠️ **값 끝에 점을 찍지 않습니다.** `CNAME` 과 다릅니다 — TXT 는 텍스트라 점이 값의
  일부가 됩니다. 따옴표도 넣지 않습니다.
- **"확인" → "저장"** 둘 다 눌러야 반영됩니다.
- 🚫 **다른 레코드는 건드리지 않습니다.** 공유 존입니다 — `daengs.` · `dev.` · apex 는
  남의 것이거나 본체가 씁니다. **추가만 하고 나옵니다.**

**③ 전파 확인 후 Verify**

```powershell
nslookup -type=TXT _github-pages-challenge-SAJOYO.cards.weareithero.cloud 8.8.8.8
```

값이 보이면 깃허브로 돌아가 **Verify**. 전파 전에 눌러 실패해도 아무 일 없습니다 —
몇 분 뒤 다시 누르면 됩니다.

**주의: 검증은 '남이 못 가져가게' 하는 장치이지 '우리가 실수로 놓지 않게' 하는 장치가
아닙니다.** 검증된 상태에서도 루트의 `CNAME` 파일을 지우면 도메인이 풀립니다.

### 확인

- [ ] `nslookup` 이 `sajoyo.github.io` 를 가리키는지
- [ ] `https://cards.weareithero.cloud/` 에서 도감·스튜디오가 뜨고 포일 11종이 다 먹는지
- [ ] `Enforce HTTPS` 가 켜져 있고, http 접근이 https 로 넘어가는지
- [ ] 옛 주소가 새 도메인으로 리다이렉트되는지
- [ ] 루트(`/`)로 바뀌었으니 서브패스에서 되던 것이 그대로 되는지 — 경로가 전부 상대라
      깨질 데가 없어야 정상입니다
- [ ] 본체 랜딩의 도감 링크가 새 주소로 가는지 ([migration.md](migration.md) 5절)

### 나중에 Cloudflare 로 옮긴다면

지금은 해당 없지만, 네임서버를 Cloudflare 로 옮기면 되살아나는 제약입니다.

- **프록시(주황 구름)를 켠 채로는 인증서 발급이 실패**하고 `Enforce HTTPS` 가 회색으로
  남습니다. **DNS-only(회색)로 두고 발급을 받은 뒤** 켜세요.
- 프록시를 켤 거면 SSL 모드를 반드시 **Full (strict)** 로. `Flexible` 이면 GitHub 의
  HTTPS 강제와 물려 **무한 리다이렉트**가 납니다.

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
