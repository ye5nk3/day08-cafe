# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 현재 상태

아직 코드가 없다. `PRD.md`(무엇을 만들지)와 `STEPS.md`(만드는 순서)만 있다. 작업 전에 두 파일을 먼저 읽고, `STEPS.md`의 순서대로 한 페이지씩 만들고 확인한다.

## 빌드·테스트

npm, 번들러, 린터, 테스트 러너가 없다. HTML 파일을 브라우저에서 바로 연다. 빌드 명령은 없다. Edge Function 배포는 Supabase CLI를 쓴다(5단계에서 구체화).

## 아키텍처

골목카페 사장님용 운영 대시보드. 정적 HTML 5개 + Supabase.

- `index.html`은 틀이다. 왼쪽 메뉴와 가운데 `iframe`만 있고, 메뉴를 누르면 iframe의 `src`가 `sales.html`, `menu.html`, `reviews.html`, `promo.html` 중 하나로 바뀐다. 홈 숫자 카드와 7일 매출 그래프도 여기에 있다.
- 각 페이지는 HTML 파일 하나에 CSS·JS를 모두 넣는다. 페이지끼리 코드를 공유하지 않는다.
- 데이터는 브라우저에서 Supabase JS(CDN)로 직접 읽고 쓴다. 테이블은 `menus`, `sales`, `reviews`. 홈 카드·그래프 숫자는 `sales`와 `menus`에서 계산한다.
- AI 기능(리뷰 답글, 홍보 문구)은 Edge Function `cafe-ai` 하나가 처리하고, 요청의 `type`으로 구분한다.

## 지켜야 할 것

- 공통 디자인: 5개 페이지가 같은 색과 글꼴을 쓴다. 색·글꼴을 바꾸면 5개 파일에 모두 같은 값으로 반영한다.
- 비밀 키: HTML에는 Supabase anon key만 쓴다. AI API 키는 Edge Function의 Secrets에만 둔다.
- 범위 밖: 로그인, 결제·POS 연동, 외부 리뷰 자동 수집, PWA는 이번에 하지 않는다.
