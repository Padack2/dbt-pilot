## 메타

- **ADR ID**: ADR-008
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/refresh-progress.ts`, `apps/web/src/lib/mv-refresh-action.ts`,
  `apps/web/src/app/api/refresh-status/route.ts`, `apps/web/src/components/RefreshProgress.tsx`
- **태그**: Frontend, 안정성
- **관련 ADR**: ADR-006 (수동 REFRESH 트리거 버튼)

---

## 1) 배경 (Context)

- ADR-006에서 만든 "전체 REFRESH" 버튼은 MV 6개를 순차로 `REFRESH MATERIALIZED VIEW
  CONCURRENTLY`한다. 테이블 규모에 따라 전체가 수 초~수십 초 걸릴 수 있는데, 지금은 버튼을
  누른 뒤 전체 과정이 끝나야만(Server Action의 단일 요청·응답 사이클) 결과 배너가 뜬다 — 그
  사이 사용자는 지금 어느 MV를 처리 중인지 전혀 알 수 없다.
- 목표: REFRESH가 진행되는 동안 "지금 몇 번째 MV를 처리 중인지"를 실시간(수 초 지연 이내)으로
  보여준다.
- 비목표: 여러 서버 인스턴스에 걸친 완벽한 정합성 보장(아래 리스크 참고).

## 2) 고려한 선택지 (Options)

- 옵션 A: `mv_refresh_log`에 시작 시점에 `finished_at = NULL`인 행을 미리 insert하고 완료 시
  UPDATE, 클라이언트가 이 테이블을 폴링
    - 장점: DB가 소스오브트루스라 여러 서버 인스턴스에서도 정합적으로 진행 상황을 볼 수 있음
    - 단점/리스크: `finished_at not null` 제약을 admin이 수동으로 풀어야 하고(`ALTER TABLE`),
      `batch_user`에 없던 UPDATE 권한도 추가로 grant해야 함 — 지난 세션 TODO에서 지적한 "매번
      admin 수동 개입" 패턴을 또 반복하게 됨. 매 단계 DB 왕복도 추가됨
    - 대응 검토: 이 프로젝트 규모에서는 배보다 배꼽이 더 크다고 판단
- 옵션 B: Server Action이 실행되는 동일 Node 프로세스의 인메모리 상태를 단계마다 갱신하고,
  클라이언트는 별도 GET 라우트(`/api/refresh-status`)를 1초 간격으로 폴링 (채택)
    - 장점: DB 스키마 변경/추가 권한 불필요, admin 수동 개입 없음. Node는 비동기 I/O라 REFRESH
      쿼리가 await 중에도 같은 프로세스가 폴링 GET 요청을 동시에 처리할 수 있음(로컬
      `pnpm dev`·일반 Node 서버 배포에서는 완전히 동작)
    - 단점/리스크: ADR-006의 인메모리 락과 동일한 한계 — Vercel 같은 서버리스에서 REFRESH를
      실행 중인 인스턴스와 폴링 요청이 도착하는 인스턴스가 다르면 진행 상황이 보이지 않을 수
      있음
- 옵션 C: Server-Sent Events나 WebSocket으로 서버가 진행 상황을 push
    - 장점: 폴링보다 지연이 적고 요청 수가 적음
    - 단점/리스크: 이 정도 규모(6단계, 초 단위 진행)에 비해 구현/운영 복잡도가 과하다고 판단.
      서버리스 환경에서 장수명 커넥션을 유지하기도 더 까다로움

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. `lib/refresh-progress.ts`가 `globalThis`에 캐시한 상태 객체
  (`running`/`steps: Record<MV, "pending"|"running"|"done"|"error">` 등)를 가지고, `mv-refresh-
  action.ts`가 MV별로 `setMvStepState()`를 호출해 갱신한다. `GET /api/refresh-status`가 이
  상태를 그대로 JSON으로 반환하고, 클라이언트 컴포넌트 `RefreshProgress`가 1초 간격으로 폴링해
  체크리스트로 보여준다.
- 결정 이유(Trade-off): ADR-006에서 이미 인메모리 락의 서버리스 한계를 감수하기로 결정한
  전례가 있고, 이 프로젝트는 지금 당장 Vercel 다중 인스턴스로 배포되어 있지 않다(로컬
  `pnpm dev` 기준 완전히 동작). "실시간 진행 상황"이라는 이번 요구에는 정합성 100% 보장보다
  "admin 수동 개입 없이 빠르게 구현"이 더 중요하다고 판단했다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: DB 스키마 변경이나 추가 권한 grant 없이 구현 완료. REFRESH 버튼을 누르면 1초
  이내에 현재 처리 중인 MV가 화면에 표시됨.
- 부정적 영향/부채: 서버리스 다중 인스턴스 배포 시 폴링 요청이 REFRESH를 실행 중인 인스턴스와
  다른 곳으로 가면 진행 상황이 갱신되지 않을 수 있음(다만 최종 결과 배너는 리다이렉트라 항상
  정확함 — 진행 "중" 표시만 영향받음). 새 프로세스가 뜨면(dev 서버 재시작 등) 진행 상태가
  초기화됨.
- 추후 작업(TODO): 실제로 서버리스 다중 인스턴스로 배포하게 되면, 그때는 옵션 A(DB 기반)로
  전환하면서 `ALTER TABLE mv_refresh_log ALTER COLUMN finished_at DROP NOT NULL` +
  `grant update on mv_refresh_log to batch_user`를 admin이 1회 실행하는 방식으로 넘어가는 것을
  권장.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: `/models`에서 "전체 REFRESH" 클릭 → 버튼 아래 "REFRESH 진행 상황" 카드가 즉시
  나타나고 MV 6개가 순서대로 대기→진행 중→완료로 바뀌는지 확인 → 완료 후 카드가 사라지고
  `?refresh=success` 배너로 전환되는지 확인.
- 롤백 전략: `models/page.tsx`에서 `<RefreshProgress />` 한 줄만 제거하면 UI에서 즉시
  사라진다. `mv-refresh-action.ts`의 `setMvStepState()` 호출들과 `refresh-progress.ts`,
  `api/refresh-status/route.ts`를 걷어내도 REFRESH 자체(ADR-006)의 동작에는 영향 없음.
