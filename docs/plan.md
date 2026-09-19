# dbt 관리 대시보드 + LLM 챗봇 포트폴리오 프로젝트 플랜

## 프로젝트 개요

GitHub Public Events API로 수집한 데이터를 dbt incremental 모델로 관리하고,
웹 대시보드와 LLM 챗봇으로 운영·분석하는 풀스택 데이터 파이프라인 플랫폼.

---

## 기술 스택

| 영역 | 선택 | 비고 |
|------|------|------|
| 데이터 소스 | GitHub Public Events API (`/events`) | 무료, 전체 공개 이벤트 스트림 |
| DB 호스팅 | Neon (PostgreSQL) | 영구 무료, 카드 불필요 |
| 데이터 파이프라인 | dbt (incremental model) | `unique_key='event_id'`로 중복 제거 |
| 배치 스케줄링 | GitHub Actions (5분 주기 cron) | 서버리스, 실행 이력 자동 기록 |
| MV 갱신 | PostgreSQL `REFRESH MATERIALIZED VIEW CONCURRENTLY` | 무중단 갱신 |
| 웹 프레임워크 | Next.js (App Router + API Routes) | 풀스택 일체형 |
| LLM | Gemini API (`gemini-3.6-flash`) | 처음 쓰던 `gemini-3.8-flash`가 무료 티어 일일 한도 20회로 너무 빡빡해 하향 (ADR-012) |
| 배포 | Vercel | Next.js 궁합, 무료 |
| 모니터링 | Grafana Cloud (무료 티어) | Postgres 데이터소스로 파이프라인/MV 현황 시각화, 대시보드 JSON은 `pipeline/grafana/dashboard.json`에 포함 |

---

## 데이터 파이프라인 구조

```
[GitHub Actions — 5분마다]
    ↓
GitHub Public Events API (/events, 최대 300건)
    ↓
raw_events 테이블 적재 (Neon PostgreSQL)
    ↓
dbt incremental model 실행
(created_at 기준 신규 데이터만 처리, event_id로 중복 제거)
    ↓
공통 선계산 테이블 생성
    ↓
용도별 Materialized View (REFRESH CONCURRENTLY)
    ├── mv_daily_trend      (일별 이벤트 집계)
    ├── mv_repo_ranking     (리포별 Star/Fork 랭킹)
    └── mv_event_type_dist  (이벤트 타입별 분포)
    ↓
실행 결과 → run_results.json → 웹 대시보드 반영
```

**수집 데이터 필드**: `event_id`, `type`, `actor_login`, `repo_name`, `created_at`
(`payload`는 컬럼은 유지하되 어디서도 조회하지 않아 저장을 중단함 — row 크기의 93%를
차지해 Neon 무료 티어 500MB 한도에 직결됐음, ADR-014)

---

## 기능 범위

### Phase 1 — 핵심 (MVP)
- [V] GitHub Actions 5분 주기 수집 워크플로우
- [V] dbt incremental model 3~4개 구성
- [V] Materialized View 3종 + REFRESH CONCURRENTLY 적용
- [V] 웹 대시보드
  - 모델 목록 및 상태 (성공/실패/마지막 실행 시각)
  - 의존성 그래프 시각화 (`manifest.json` 파싱)
  - 용량 / row count 표시
  - 수동 REFRESH 트리거 버튼
- [V] 실패 시 GitHub Actions → Slack 웹훅 알림

### Phase 2 — LLM 챗봇
- [V] Gemini API 연동 (`gemini-3.6-flash`, ADR-012)
- [V] 오류 원인 분석: `run_results.json` 오류 메시지 + 모델 SQL을 컨텍스트로 전달
- [V] 자연어 명령 처리: "전체 REFRESH 해줘", "mv_repo_ranking 상태 알려줘"
- [V] 허용 액션 화이트리스트 (REFRESH, SELECT만 허용 / DELETE·INSERT 금지)
- [V] LLM 벤더 교체 가능한 추상화 레이어 설계

### Phase 3 — 심화
- [V] Grafana 연동 — Postgres 데이터소스는 Public dashboard로 공개가 안 돼(Grafana
  플랫폼 제약) 라이브 링크 대신 README에 스크린샷으로 소개 (Grafana Cloud, README
  "Grafana 대시보드 연동" 참고)
- [ ] 모델별 실행 시간 이상 탐지 (평균 대비 N배 초과 시 알림)
- [V] 수집 데이터 기반 분석 뷰 ("오늘 가장 Star 많이 받은 리포", "언어별 활동 트렌드")

### Phase 4 — 운영 안정화 & UI 개선 (계획 외 추가)
- [V] 다크 테마 대시보드 리디자인 (앰버 액센트로 통일, hero 스탯 카드, 일별 성장 추이를
  막대 → 꺾은선 + 호버/키보드 툴팁으로 교체)
- [V] `/models`의 모델 의존성 그래프에 REFRESH 시뮬레이션 버튼 추가 (실제 DB 호출 없이
  의존성 순서대로 진행 상황 시각화)
- [V] 대시보드 내 레포명 전체에 GitHub 링크 연결
- [V] Neon 무료 티어(500MB) 유지를 위한 저장 용량 관리 — `raw_events`/`precomputed_events`
  7일 보존 + 미사용 `payload` 컬럼 저장 중단 (ADR-013, ADR-014)

---

## 보안 설계

```
사용자 자연어 입력
    ↓
LLM (Gemini) — 어떤 액션을 실행할지만 결정
    ↓
서버 화이트리스트 검증 (허용 액션만 통과)
    ↓
┌─────────────────────────┬──────────────────────────┐
│  REFRESH (배치 유저)     │  조회 (읽기 전용 유저)     │
│  - 모델명 검증 필수       │  - SELECT only            │
│  - dbt run 실행          │  - manifest.json 파싱     │
└─────────────────────────┴──────────────────────────┘
```

- DB 롤 분리: 읽기 전용 유저 / 배치 전용 유저 (최소 권한 원칙)
- LLM이 직접 SQL 생성·실행하는 구조 금지
- 모델명 검증: `manifest.json`에 존재하는 모델명만 허용 (SQL Injection 방지)

---

## 참고 — GitHub Events API 제약

- 엔드포인트: `GET https://api.github.com/events`
- 반환 한계: 최대 300건 (약 몇 분~몇십 분치 데이터)
- 요청 제한: 인증 시 시간당 5,000건 → 5분 주기 수집으로 여유 있음
- 중복 처리: `event_id` 기준 dbt `unique_key`로 자동 제거
- 수집 주기 근거: GitHub Actions 최소 cron 주기 5분, 데이터 손실 최소화
