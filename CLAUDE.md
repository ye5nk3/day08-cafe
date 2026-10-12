# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

골목카페 사장님용 운영 대시보드. 정적 HTML 5개 + Supabase(DB, Edge Function 1개). 무엇을 왜 만드는지는 `PRD.md`, 만든 순서는 `STEPS.md`(0~8단계 모두 완료).

## 실행·확인

npm, 번들러, 린터, 테스트 러너가 없다. 자동 테스트도 없어서 브라우저에서 직접 확인한다.

```bash
python3 -m http.server 8080   # http://localhost:8080/index.html  (.claude/launch.json의 "cafe"와 같다)
```

- 반드시 HTTP로 열어야 한다. `index.html`이 `fetch(file, {method:"HEAD"})`로 페이지 존재를 확인하므로 `file://`에서는 전부 "준비 중"으로 보인다.
- 특정 화면은 `index.html#sales`, `#menu`, `#reviews`, `#promo` 해시로 바로 연다.
- Edge Function 직접 호출 확인(레거시 anon JWT는 `reviews.html`의 `ANON_JWT`와 같은 값):
  ```bash
  curl -s -X POST https://vbnemtsxmtmzwrcwctpp.supabase.co/functions/v1/cafe-ai \
    -H "Authorization: Bearer <ANON_JWT>" -H "Content-Type: application/json" \
    -d '{"type":"promo","menu":"아메리카노 4,500원"}'
  ```
- 함수 배포: `supabase/functions/cafe-ai/index.ts`를 고치면 Supabase 프로젝트 `vbnemtsxmtmzwrcwctpp`에 다시 배포해야 반영된다(`verify_jwt`는 true 유지). 저장소의 파일과 배포본은 자동으로 동기화되지 않는다.

## 구조

- `index.html`은 틀이면서 홈이다. 왼쪽 메뉴, 가운데 영역, 하단 AI 모델 선택으로 이루어진다.
  - 홈은 iframe이 아니라 이 파일 안의 `#home` 섹션이다(숫자 카드 + 7일 매출 막대 그래프). 홈을 열 때마다 `loadHome()`이 Supabase에서 다시 계산한다.
  - 나머지 4개 메뉴는 iframe으로 `sales.html`, `menu.html`, `reviews.html`, `promo.html`을 연다. 파일이 없으면 "준비 중"을 보여 준다.
- 페이지는 서로 코드를 공유하지 않는다. 각 HTML이 CSS·JS·Supabase 클라이언트를 모두 자기 안에 가진다. 그래서 공통 값은 파일마다 복사되어 있다(아래 "같이 바꿔야 하는 값").
- 데이터는 브라우저에서 Supabase JS(CDN, `@supabase/supabase-js@2.45.4`)로 직접 읽고 쓴다. 서버 코드는 `cafe-ai` 하나뿐이다.

### Supabase

프로젝트 `day08-cafe`(ref `vbnemtsxmtmzwrcwctpp`). 마이그레이션 파일은 저장소에 없고 DB에만 있다.

| 테이블 | 컬럼 |
|---|---|
| `menus` | id, name(unique), price, stock, created_at |
| `sales` | id, menu_name(문자열, menus와 FK 아님), quantity, amount(합계), sold_at |
| `reviews` | id, author, rating(1~5), content, reply, replied_at, created_at |

- 로그인이 없으므로 RLS를 켜고 `anon` 역할에 조회·입력·(수정)·삭제 정책을 열어 두었다. 새 테이블을 만들면 정책 외에 `grant ... to anon`과 시퀀스 `grant usage, select`도 해야 한다. 정책만 있으면 `permission denied for table`이 난다.
- 키가 두 종류다. DB 접근은 `sb_publishable_…` 키, Edge Function 호출은 `role: anon`인 레거시 JWT다. 함수가 `verify_jwt`를 켜 두어서 publishable 키로는 호출되지 않는다.

### cafe-ai (Edge Function)

- 요청의 `type`이 `review_reply`(답글 1개) 또는 `promo`(후보 3개, `---`로 구분해 파싱)이다. 선택적으로 `model`을 받는다.
- OpenRouter 무료 모델 3개를 순서대로 시도하고, 실패하거나 빈 답이면 다음 모델로 넘어간다. 사용자가 고른 모델은 그 목록에 있을 때만 맨 앞으로 간다. 응답에 실제로 쓰인 `model`이 들어 있다.
- 키는 Supabase Secrets의 `OPENROUTER_API_KEY`(없으면 `ANTHROPIC_API_KEY`)다. 응답 시간은 4~20초다.
- 무료 모델이라 입력에 없던 사실을 지어낼 수 있다. `promo.html`이 이 점을 화면에 안내하고, 후보는 DB에 저장하지 않는다.

## 같이 바꿔야 하는 값

- **디자인 변수**(`--accent`, `--bg`, `--font` 등 `:root` 블록): 5개 HTML에 같은 값으로 복사되어 있다. 하나를 바꾸면 5개 모두 바꾼다.
- **AI 모델 목록**: `index.html`의 `MODEL_OPTIONS`와 `cafe-ai/index.ts`의 `MODELS`가 따로 있다. 모델을 추가·삭제하면 둘 다 바꾸고 함수를 다시 배포한다.
- **모델 선택 전달**: 사이드바에서 고른 값은 `localStorage["cafe-ai-model"]`("auto" 또는 모델 ID)에 저장된다. `reviews.html`과 `promo.html`이 같은 origin이라서 이 키를 읽어 요청에 넣는다.
- **재고 부족 기준** `LOW_STOCK = 5`: `menu.html`과 `index.html`에 각각 있다.
- **확인 창**: 이 앱의 내장 브라우저에서는 `window.confirm()`이 아무것도 띄우지 않고 즉시 `false`를 돌려준다. 그래서 `sales.html`, `menu.html`, `reviews.html`은 직접 만든 `ask()`(Promise)를 쓴다. 새 확인 창을 만들 때 `confirm()`을 쓰지 않는다.

## 지켜야 할 것

- HTML에는 공개 키(publishable, anon JWT)만 둔다. AI 키는 Edge Function의 Secrets에만 둔다.
- 범위 밖: 로그인·직원 계정, 결제·POS 연동, 외부 리뷰 자동 수집, 알림, PWA.
- 화면 확인을 하다가 만든 테스트 데이터는 Supabase에서 지운다(화면의 삭제 버튼 또는 `db.from(...).delete()`).
