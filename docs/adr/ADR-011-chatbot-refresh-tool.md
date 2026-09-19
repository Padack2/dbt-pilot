## 메타

- **ADR ID**: ADR-011
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/mv-refresh-runner.ts`(신규), `apps/web/src/lib/mv-refresh-action.ts`,
  `apps/web/src/lib/chat-tools.ts`, `apps/web/src/app/api/chat/route.ts`
- **태그**: 보안, DX
- **관련 ADR**: ADR-006(REFRESH 버튼), ADR-009/ADR-010(챗봇 읽기 전용 v1 + function calling),
  ADR-012(같은 날 이어서 진행한 Gemini 신뢰성 문제)

---

## 1) 배경 (Context)

- ADR-009에서 챗봇 v1을 읽기 전용으로 한정하며 "자연어로 REFRESH 같은 쓰기 액션을 실행하는
  건 별도 ADR로 화이트리스트 검증을 먼저 설계하고 진행"하기로 미뤄뒀다. 이번에 그 쓰기 액션을
  실제로 추가한다.

## 2) 고려한 선택지 (Options)

- 옵션 A: 챗봇 전용 새 보호 로직(쿨다운/락)을 처음부터 다시 구현
    - 단점/리스크: ADR-006에서 이미 만든 것과 똑같은 로직을 중복 구현 — 두 군데서 따로
      관리하면 둘 중 하나만 고치고 잊어버리는 사고가 날 수 있음
- 옵션 B: REFRESH 버튼(Server Action)의 핵심 로직을 `runMvRefresh()`로 추출해 버튼과
  챗봇 도구가 공통으로 호출 (채택)
    - 장점: 쿨다운/락 보호장치가 코드 한 곳에만 존재 — 챗봇이 아무리 REFRESH를 반복
      요청받아도 실제 실행은 서버가 5분에 한 번으로 강제함(LLM의 "명시적 요청 시에만
      호출" 프롬프트 지시는 UX 차원의 보조 수단일 뿐, 진짜 방어선은 이 함수 안에 있음).
      REFRESH 버튼 쪽 동작(리다이렉트, 배너)은 얇은 wrapper로 그대로 유지돼 회귀 없음

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. `lib/mv-refresh-runner.ts` 신규 — `runMvRefresh()`가 쿨다운/락 체크와
  MV 6개 순차 REFRESH를 전부 수행하고 `{status: "locked"|"cooldown"|"success"|"error",
  remainingMs?}`를 반환. `mv-refresh-action.ts`(REFRESH 버튼)는 이제 이 함수를 호출한 뒤
  리다이렉트만 하는 얇은 wrapper. `chat-tools.ts`의 `refresh_materialized_views` 도구도
  동일 함수를 호출.
- 챗봇 시스템 프롬프트에 "명시적으로 요청했을 때만 이 도구를 호출하라"를 명시 — 이건 무해한
  질문 흐름에서 불필요하게 REFRESH가 튀어나오지 않게 하는 UX 가드레일이고, 실제 남용 방지는
  `runMvRefresh()`의 쿨다운/락이 담당(방어의 두 계층을 명확히 구분).
- 결정 이유(Trade-off): REFRESH 쓰기 권한을 챗봇에 새로 주는 결정이지만, 실제 보호 로직은
  이미 ADR-006에서 검증된 걸 재사용하는 것이라 신규 리스크가 크지 않다고 판단했다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 챗봇에서 "새로고침해줘" 같은 자연어로 REFRESH 트리거 가능, 버튼과 동일한
  안전장치 적용됨.
- 부정적 영향/부채: `remainingMs`를 분 단위로 변환하는 로직이 챗봇 도구 쪽에만 있어 버튼
  UI(models/page.tsx)와 표시 방식이 약간 다름(기능적 차이는 없음).
- 추후 작업(TODO): 없음.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: curl로 "전체 새로고침 좀 해줘"에는 `refresh_materialized_views`의
  `functionCall`로, "mv_repo_ranking 상태 알려줘"에는 함수 호출 없이 텍스트로 정확히
  분기되는 것을 확인. `tsc --noEmit`/`next lint`/`next build` 통과.
- 롤백 전략: `chat-tools.ts`에서 `refresh_materialized_views` 항목만 배열에서 빼면 챗봇은
  다시 읽기 전용(ADR-009/010 상태)으로 돌아간다. `mv-refresh-runner.ts`는 버튼 쪽에서도
  쓰고 있어 완전히 제거하려면 `mv-refresh-action.ts`도 원래 형태(ADR-006)로 되돌려야 함.
