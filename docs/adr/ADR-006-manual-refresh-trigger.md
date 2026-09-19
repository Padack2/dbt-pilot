## 메타

- **ADR ID**: ADR-006
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: 김아진
- **영향 범위**: `apps/web/src/lib/mv-refresh-action.ts`, `apps/web/src/lib/mv-refresh.ts`, `apps/web/src/lib/db.ts`, `apps/web/src/app/models/page.tsx`
- **태그**: 보안, 안정성, Frontend
- **관련 ADR**: ADR-001
- **링크**:

---

## 1) 배경 (Context)

- `docs/plan.md`의 Phase 1 항목 중 "수동 REFRESH 트리거 버튼"이 이번에 처음으로 대시보드에서 DB
  쓰기 액션을 실행하는 사례가 된다. 지금까지 웹 대시보드(`apps/web`)는 `readonlyPool`(읽기 전용
  롤)로만 DB에 접속했고, 쓰기는 GitHub Actions(`ingest.yml`)가 배치 롤로만 수행했다.
- 대시보드에는 로그인/인증이 없다(공개 페이지). 즉 이 버튼은 누구나 클릭할 수 있는 공개
  엔드포인트에서 `REFRESH MATERIALIZED VIEW CONCURRENTLY`라는, 대상 테이블 규모에 따라 수 초~수십
  초가 걸릴 수 있는 무거운 쓰기 작업을 직접 실행하게 된다.
- 목표: 사용자가 5분 주기 배치를 기다리지 않고 즉시 최신 MV를 볼 수 있게 한다.
- 비목표: 사용자별 권한 관리, 요청자 식별(로그인 도입은 이 ADR 범위 밖).

## 2) 고려한 선택지 (Options)

- 옵션 A: GitHub Actions `workflow_dispatch`를 웹에서 호출해 `ingest.yml` 전체(수집 → dbt build →
  refresh)를 재실행
    - 장점: ADR-003/004와 동일한 트리거 패턴 재사용, 웹 서버가 DB 쓰기 자격증명을 가질 필요 없음
    - 단점/리스크: 전체 파이프라인(수집까지) 재실행이라 "MV만 즉시 갱신"이라는 요구보다 훨씬
      무겁고 느림(GitHub Actions 큐잉 지연 포함). GitHub PAT를 웹 서버에 노출해야 함
- 옵션 B: Next.js Server Action이 `batch_user` 쓰기 롤로 직접 `REFRESH MATERIALIZED VIEW
  CONCURRENTLY`를 실행 (채택)
    - 장점: dbt 매크로(`refresh_materialized_views`)와 동일한 SQL을 그대로 재사용, 즉시 실행,
      추가 인프라(PAT, Actions 큐) 불필요
    - 단점/리스크: 웹 서버가 처음으로 쓰기 자격증명(`DATABASE_URL_BATCH`)을 갖게 됨. 인증 없는
      공개 페이지이므로 남용(연타, 봇)에 의한 DB 부하 보호장치가 필수

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. `apps/web/src/lib/mv-refresh-action.ts`에 `"use server"` Server Action
  `triggerMvRefresh()`를 추가하고, `apps/web/src/lib/db.ts`에 `batchPool`(쓰기 전용, REFRESH
  용도로만 사용)을 별도로 둔다. 보호장치는 두 겹으로 구성한다.
  1. **DB 기반 쿨다운(주 방어선)**: `mv_refresh_log`의 마지막 `started_at` 기준 5분
     (`REFRESH_COOLDOWN_MS`) 이내 재요청은 서버에서 거부. 여러 서버 인스턴스에서도 공유 DB를
     보고 판단하므로 신뢰 가능.
  2. **프로세스 인메모리 락(보조 방어선)**: 모듈 스코프 `let isRefreshing`으로 동일 프로세스 내
     연타/동시 요청을 즉시 차단. 서버리스 환경에서는 인스턴스마다 메모리가 분리돼 완전한 보장은
     아니므로 어디까지나 쿨다운의 보조 수단.
  - MV 6개는 dbt 매크로와 동일한 순서(`REFRESHABLE_MVS`, 의존성 있는
    `mv_trending_score_by_language`가 `mv_trending_repo_score` 뒤)로 서버에서 순차 실행하는 버튼
    1개로 구성했다. MV별 개별 버튼은 의존 순서를 사용자가 잘못 누를 위험과 UI/보호로직 복잡도만
    늘려 채택하지 않았다.
- 결정 이유(Trade-off): 옵션 A도 안전하지만 "즉시 MV만 갱신"이라는 목적에 비해 과함(전체 파이프라인
  재실행)과 PAT 노출 리스크가 있었다. 옵션 B는 웹 서버가 쓰기 자격증명을 갖게 되는 대가로 훨씬
  가볍고 빠른 구현을 얻는데, 이 프로젝트 규모(포트폴리오, Neon 무료 티어)에서는 DB 기반 쿨다운으로
  남용 리스크를 충분히 상쇄할 수 있다고 판단했다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 사용자가 배치 주기를 기다리지 않고 최신 MV를 즉시 확인 가능. dbt 매크로와 동일한
  SQL을 재사용해 로직 이원화 없음.
- 부정적 영향/부채: 웹 서버 프로세스가 처음으로 쓰기 자격증명을 보유하게 됨(공격 표면 증가).
  인메모리 락은 서버리스 다중 인스턴스 환경에서는 완전하지 않음. 로그인이 없어 "누가 눌렀는지"는
  추적 불가(`mv_refresh_log`에는 실행 시각만 남고 요청자 식별자는 없음).
- 추후 작업(TODO): 실제 남용이 관측되면 IP 기반 rate limit 또는 최소한의 인증(예: 관리자 토큰)
  도입 검토. Vercel 등 서버리스로 배포 시 인메모리 락이 무의미해질 수 있으므로, 그 경우 DB 쿨다운
  창을 더 보수적으로(예: 10분) 조정하는 것도 고려.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: `/models`에서 "전체 REFRESH" 클릭 → `mv_refresh_log`에 MV 6개가 순서대로 새 행으로
  기록되는지 확인 → 5분 이내 재클릭 시 쿨다운 배너가 뜨고 실제 REFRESH가 실행되지 않는지 확인 →
  버튼이 비활성화(disabled) 상태로 남은 시간을 보여주는지 확인
- 롤백 전략: `models/page.tsx`에서 `<form action={triggerMvRefresh}>` 버튼만 제거하면 즉시
  비활성화된다. `mv-refresh-action.ts`/`batchPool`을 완전히 걷어내도 기존 GitHub Actions 배치
  경로(`ingest.yml`)에는 영향 없음.
