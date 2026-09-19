## 메타

- **ADR ID**: ADR-003
- **상태**: 승인
- **날짜**: 2026-09-17
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `.github/workflows/ingest.yml`(트리거 설정), `README.md`(운영 문서), (외부) cron-job.org 계정, GitHub fine-grained PAT
- **태그**: pipeline, github-actions, scheduling, security, cost
- **관련 ADR**: ADR-001, ADR-002
- **링크**:

---

## 1) 배경 (Context)

- `.github/workflows/ingest.yml`은 `schedule: */5 * * * *`로 5분마다 도는 것을 목표로 했으나, 실제로는 몇 시간 단위로 지연되거나 아예 실행되지 않는 현상을 확인했다. `pipeline_runs` 테이블에 특정 시점 이후 기록이 전무했고, 같은 시간대에 `workflow_dispatch`(수동 실행)는 정상적으로 즉시 동작했다.
- 이는 GitHub Actions의 공식/커뮤니티 문서에 알려진 동작이다: `schedule` 이벤트는 GitHub 전체 부하가 높을 때(특히 매시 정각 부근) 지연되거나 드롭될 수 있고, `workflow_dispatch`/`repository_dispatch`는 이런 후순위 지연 없이 즉시 큐잉된다.
- 제약/가정: 예산은 무료 ~ 월 $1 이내. 오늘 GH Actions 워크플로우(수집 → dbt build → observability 기록/알림)의 권한·의존성 문제는 전부 디버깅해 정상 동작을 확인한 상태이며, Neon Postgres는 그대로 유지한다.
- 목표: 5분 간격에 최대한 가까운 안정적인 파이프라인 트리거.
- 비목표: 실행 인프라(Python/dbt 실행 환경) 자체의 교체는 이번 결정의 범위 밖 — 이미 검증된 GH Actions 실행 로직은 최대한 재사용한다.

## 2) 고려한 선택지 (Options)

- **옵션 A: 현행 유지 (GitHub Actions `schedule` cron)**
    - 장점: 이미 구현됨, 추가 작업 없음, $0
    - 단점/리스크: GitHub가 공식 문서로도 인정하는 한계 — 고부하 시간대에 지연되며, 실측 결과 몇 시간 단위로 아예 실행되지 않을 수 있음. 배치 파이프라인의 신선도 요구를 충족하지 못함
- **옵션 B: 트리거만 외부 무료 cron(cron-job.org)으로 교체, 실행은 기존 GH Actions `workflow_dispatch` API 호출 그대로 사용**
    - 장점: 오늘 관찰한 근본 원인(= `schedule` 이벤트만 GitHub가 후순위로 미루고, `workflow_dispatch`는 즉시 실행됨)에 정확히 대응함. 기존 워크플로우/Python/dbt 코드는 전혀 변경 불필요. 완전 무료 — cron-job.org 무료 플랜은 1분 간격까지 지원하며, 우리가 호출할 GitHub REST API(`workflow_dispatch`)는 즉시 응답을 반환하므로 무료 플랜의 30초 타임아웃도 문제되지 않음. PAT 1개 발급 + cron-job.org 계정 1개면 설정 끝
    - 단점/리스크: cron-job.org라는 제3자 서비스에 대한 가용성 의존 추가. GitHub PAT를 외부 서비스에 저장해야 해서 보안 관리 포인트가 하나 늘어남(주기적 로테이션 필요) — 자세한 분석은 아래 "보안 고려사항" 참고. GH Actions 러너 자체의 일반적인 큐잉 지연(초~수십 초 단위)은 여전히 남아있음 — 다만 이는 `schedule` 특유의 후순위 지연과는 성격이 다름
- **옵션 C: 실행 자체를 GCP Cloud Scheduler + Cloud Run Jobs로 이전**
    - 장점: 진짜 관리형 cron이라 5분 간격 신뢰도가 매우 높음. Cloud Scheduler는 결제 계정당 3개 작업까지 무료(이 파이프라인은 1개만 필요 → $0), Cloud Run도 무료 티어(월 180,000 vCPU-초 등)로 이 정도 실행 빈도·시간이면 사실상 $0
    - 단점/리스크: dbt build를 Cloud Run 컨테이너로 재포장해야 함(Dockerfile 작성, 이미지 빌드/배포 파이프라인 신규 구축). GCP 결제 계정(카드 등록) 필요. 오늘 GH Actions 환경에서 검증한 권한/의존성 설정을 새 실행 환경에서 다시 처음부터 검증해야 함 — 마이그레이션 비용이 상당함
- **옵션 D: 실행 자체를 AWS EventBridge Scheduler + Lambda로 이전**
    - 장점: Lambda 무료 티어(월 100만 요청 + 40만 GB-초)는 기간 제한 없이 영구 무료라 이 워크로드는 사실상 $0. EventBridge Scheduler도 이 볼륨에서는 무료
    - 단점/리스크: dbt-core + dbt-postgres 의존성이 무거워 Zip 배포 용량 제한을 넘기기 쉬워 컨테이너 이미지 Lambda로 패키징해야 함. ECR/IAM 등 AWS 인프라를 새로 구축해야 해서 옵션 C보다도 초기 러닝커브가 큼

## 3) 결정 (Decision)

- 최종 선택: **옵션 B** — cron-job.org(무료)가 5분마다 GitHub REST API `POST /repos/{owner}/{repo}/actions/workflows/ingest.yml/dispatches`를 호출해 `workflow_dispatch`를 트리거하고, `.github/workflows/ingest.yml`의 실행 로직(ingest → dbt build → observability)은 그대로 둔다.
- 결정 이유(Trade-off): 오늘 직접 관찰한 증거(schedule만 멈추고 workflow_dispatch는 정상 동작)가 GitHub 커뮤니티에 문서화된 알려진 동작과 정확히 일치한다. 문제의 원인이 "실행 환경"이 아니라 "트리거 방식" 하나로 좁혀졌으므로, 이미 여러 차례 디버깅해 안정화한 실행 로직(권한, dbt build, observability)은 그대로 두고 트리거 계층만 얇게 교체하는 것이 비용·리스크 대비 가장 합리적이다. 옵션 C·D는 더 근본적으로 신뢰도 높은 인프라지만, 지금 필요한 것 이상으로 큰 재구축 비용이 든다.

### 보안 고려사항

cron-job.org에 GitHub PAT를 저장해야 한다는 점이 이 결정의 핵심 리스크다. 이를 다음과 같이 완화하기로 한다:

- **최소 권한**: fine-grained PAT를 이 레포 하나에만, **`Actions: write` 권한만** 부여해 발급한다. GitHub에서 `Actions`(워크플로우 실행/취소/재실행/로그삭제)와 `Secrets`(시크릿 조회/수정)는 서로 다른 권한이므로, 이 토큰이 유출되더라도 `DATABASE_URL_BATCH`·`SLACK_WEBHOOK_URL` 등 실제 시크릿이나 코드(`Contents`)에는 접근할 수 없다. 최악의 시나리오는 "워크플로우를 스팸성으로 반복 트리거해 Actions 무료 분을 소진시키는" 수준으로 제한된다.
- **만료/로테이션**: PAT 만료 기간을 짧게(예: 90일) 설정하고, 만료 시 재발급 + cron-job.org 설정 갱신을 루틴으로 둔다.
- 대안으로 자체 인프라(예: `apps/web`의 API 라우트)를 프록시로 두어 PAT를 제3자 서비스에 아예 노출하지 않는 방법도 검토했으나, 현재 프로젝트 규모(개인 파일럿)에서는 추가 구축 비용 대비 이득이 크지 않다고 판단해 채택하지 않았다. 프로젝트가 커지거나 더 민감한 시크릿을 다루게 되면 재검토한다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 비용 $0 유지, 오늘까지의 디버깅 성과(권한/스키마/observability) 보존, 설정 난이도 낮음(PAT 발급 + cron-job.org 등록 수준)
- 부정적 영향/부채: cron-job.org라는 제3자 서비스 가용성에 대한 의존이 새로 생김. GitHub PAT를 외부 서비스에 저장해야 하므로 보안 관리 지점이 늘어남. `schedule` 트리거 자체의 근본적 신뢰성 문제가 GitHub 쪽에서 개선되지 않는 한 계속 우회책에 의존하는 구조
- 추후 작업(TODO): PAT는 해당 레포에 대해 `actions: write` 최소 권한만 가진 fine-grained 토큰으로 발급, `.github/workflows/ingest.yml`의 `on.schedule` 블록 제거(또는 남겨둬도 무해하나 혼란 방지 위해 정리 권장), cron-job.org 계정에 실패 알림(이메일) 설정, 실행 신뢰도가 더 중요해지는 시점에는 옵션 C(GCP)로 재이전 검토

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: cron-job.org 설정 후 `pipeline_runs` 테이블에 `select started_at, status from pipeline_runs order by started_at desc limit 20;`로 5분 간격에 가깝게 기록이 쌓이는지 30분~1시간 관찰
- 롤백 전략: cron-job.org의 job을 비활성화하고 워크플로우의 `schedule` 트리거를 그대로 두면 즉시 이전 상태로 복귀 가능. 워크플로우 코드 자체는 건드리지 않으므로 롤백 비용은 거의 0
