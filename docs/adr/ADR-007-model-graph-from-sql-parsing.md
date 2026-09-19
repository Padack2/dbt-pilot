## 메타

- **ADR ID**: ADR-007
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/model-graph.ts`, `apps/web/src/components/ModelGraph.tsx`,
  `apps/web/src/app/models/page.tsx`, `apps/web/next.config.mjs`
- **태그**: Frontend, 유지보수, DX
- **관련 ADR**: 없음
- **링크**:

---

## 1) 배경 (Context)

- `docs/plan.md`의 Phase 1 항목 "의존성 그래프 시각화(`manifest.json` 파싱)"가 마지막으로 남아
  있었다. dbt는 `dbt run`/`dbt compile`을 거쳐야만 모델 간 의존관계가 담긴 `manifest.json`을
  생성하는데, 이 아티팩트를 대시보드(`apps/web`)가 읽으려면 어딘가(S3, DB, git 등)에 영속화하고
  매 배치 실행마다 동기화해야 한다 — 지난 세션 TODO에서 "영속화 방법 고민 필요"로 남겨둔
  지점이다.
- 목표: dbt 모델 간 의존관계(원본 테이블 → staging → marts → MV)를 대시보드에서 한눈에 보여준다.
- 비목표: 컬럼 단위 lineage, 실행 시간/row 수 등 실행 통계와의 결합(이미 `/models`의 다른
  섹션이 담당).

## 2) 고려한 선택지 (Options)

- 옵션 A: dbt를 배치 실행 시 `manifest.json`을 생성하고, 이를 DB 테이블이나 별도 스토리지에
  업로드 → 웹이 그걸 읽어 파싱
    - 장점: dbt가 공식적으로 계산한 의존관계를 그대로 사용 — 가장 "정확한" 소스
    - 단점/리스크: 새 영속화 경로(스토리지 선택, 업로드 스텝 추가, 웹의 다운로드/캐시 로직)가
      필요해 배치 파이프라인과 웹 양쪽에 새 결합이 생긴다. `manifest.json`은 스키마가 dbt
      버전마다 바뀔 수 있어 별도 파서 유지 부담도 있음
- 옵션 B: 그래프 구조를 웹 코드에 직접 하드코딩
    - 장점: 가장 간단, 새 인프라 불필요
    - 단점/리스크: 모델을 추가/변경할 때마다 그래프를 수동으로 동기화해야 하고, 까먹으면 그래프가
      조용히 실제와 어긋남
- 옵션 C: dbt 모델 SQL 파일(`ref()`/`source()` 호출)을 웹 서버가 요청 시점에 직접 정규식으로
  파싱 (채택)
    - 장점: dbt를 전혀 거치지 않음 — manifest.json도, 영속화도, 동기화 스텝도 필요 없다. 모델
      SQL이 곧 소스오브트루스라 실제 모델과 항상 100% 일치. 모노레포라 `pipeline/dbt/models`가
      이미 같은 체크아웃 안에 있음
    - 단점/리스크: 정규식 파싱이라 dbt의 공식 파서보다 취약함(예: 여러 줄에 걸친 `ref()`나
      매크로로 감싼 `ref()`는 못 잡을 수 있음 — 현재 모델들은 전부 단순한 한 줄 `ref()`/
      `source()`라 문제 없음). Next.js 서버리스 배포 시 파일 트레이싱이 import로 연결 안 된
      파일은 자동 포함하지 않으므로 `next.config.mjs`에 `outputFileTracingIncludes` 명시가
      필요함(반영 완료, `pnpm build` 후 `.next/server/app/models/page.js.nft.json`에
      `pipeline/dbt/models/**/*.sql`이 포함됨을 직접 확인)

## 3) 결정 (Decision)

- 최종 선택: 옵션 C. `lib/model-graph.ts`가 `pipeline/dbt/models/{staging,marts}/*.sql`을 읽어
  `ref()`/`source()` 호출과 `materialized` 설정을 파싱해 노드/엣지 그래프를 만들고, 같은 파일의
  `layoutModelGraph()`가 위상 레벨(부모 레벨 + 1) 기반으로 좌→우 레이어 좌표를 계산한다.
  `ModelGraph.tsx`(순수 함수 컴포넌트, "use client" 아님)가 이를 SVG로 렌더링한다.
- 결정 이유(Trade-off): 옵션 A의 "정확도"는 매력적이지만 이 프로젝트 규모에서 새 영속화
  인프라를 추가할 만큼 가치가 크지 않다고 판단했다. 옵션 C는 정규식 파싱이라는 약간의 취약성을
  대가로 "항상 최신, 별도 동기화 불필요"라는 훨씬 큰 이득을 얻는다. 현재 모델들이 전부 단순한
  패턴이라 당장의 리스크도 낮다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 모델을 추가/변경해도 그래프가 자동으로 최신 상태를 반영. dbt 실행이나 추가
  인프라 없이 `/models`에서 바로 확인 가능.
- 부정적 영향/부채: 정규식 파서라 향후 모델이 매크로로 `ref()`를 감싸거나 여러 줄에 걸쳐
  작성되면 파싱이 깨질 수 있음(조용히 엣지가 누락되는 형태). `outputFileTracingIncludes` 설정을
  까먹고 지우면 배포 환경에서만 그래프가 비어 보이는 문제가 재발할 수 있음.
- 추후 작업(TODO): 모델이 많아져 정규식 파싱이 자주 깨지면 그때 옵션 A(manifest.json 기반)로
  전환 검토.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: `pnpm build` 후 `.next/server/app/models/page.js.nft.json`에 `pipeline/dbt/models`
  하위 `.sql` 파일들이 포함되는지 확인(완료). `/models` 페이지에서 노드 14개(source 2 + staging
  2 + marts 10)와 엣지가 실제 `ref()`/`source()` 호출과 일치하는지 브라우저에서 육안 확인 필요.
- 롤백 전략: `models/page.tsx`에서 "모델 의존성 그래프" 섹션만 제거하면 되고, 다른 섹션에는
  영향 없음. `next.config.mjs`의 `outputFileTracingIncludes`도 함께 제거 가능.
