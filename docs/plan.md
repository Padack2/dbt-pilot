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
| LLM | Gemini 2.0 Flash API | 무료 티어 (분당 15 요청, 일 1,500 요청) |
| 배포 | Vercel | Next.js 궁합, 무료 |
| 모니터링 | Grafana | 배치 처리 현황 시각화 |

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

**수집 데이터 필드**: `event_id`, `type`, `actor_login`, `repo_name`, `payload`, `created_at`

---

## 기능 범위

### Phase 1 — 핵심 (MVP)
- [ ] GitHub Actions 5분 주기 수집 워크플로우
- [ ] dbt incremental model 3~4개 구성
- [ ] Materialized View 3종 + REFRESH CONCURRENTLY 적용
- [ ] 웹 대시보드
  - 모델 목록 및 상태 (성공/실패/마지막 실행 시각)
  - 의존성 그래프 시각화 (`manifest.json` 파싱)
  - 용량 / row count 표시
  - 수동 REFRESH 트리거 버튼
- [ ] 실패 시 GitHub Actions → Slack 웹훅 알림

### Phase 2 — LLM 챗봇
- [ ] Gemini 2.0 Flash API 연동
- [ ] 오류 원인 분석: `run_results.json` 오류 메시지 + 모델 SQL을 컨텍스트로 전달
- [ ] 자연어 명령 처리: "전체 REFRESH 해줘", "mv_repo_ranking 상태 알려줘"
- [ ] 허용 액션 화이트리스트 (REFRESH, SELECT만 허용 / DELETE·INSERT 금지)
- [ ] LLM 벤더 교체 가능한 추상화 레이어 설계

### Phase 3 — 심화 (여유 시)
- [ ] Grafana 연동 (배치 실행 시간 트렌드, 이상 탐지)
- [ ] 모델별 실행 시간 이상 탐지 (평균 대비 N배 초과 시 알림)
- [ ] 수집 데이터 기반 분석 뷰 ("오늘 가장 Star 많이 받은 리포", "언어별 활동 트렌드")

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

## 포트폴리오 포지셔닝

### 증명하는 역량
| 역량 | 증거 |
|------|------|
| 데이터 파이프라인 설계 | raw → 선계산 → MV 단계화 구조 |
| 배치 시스템 운영 | GitHub Actions 5분 주기, 실행 이력 관리 |
| 무중단 운영 | REFRESH CONCURRENTLY 적용 |
| LLM 실전 활용 | 오류 분석 + 자연어 명령 처리 |
| DevSecOps | DB 롤 분리, 화이트리스트 기반 권한 제어 |
| 풀스택 | Next.js API Routes로 백엔드/프론트 통합 |

### 이력서·면접 스토리 연결
- Tumeet에서 직접 겪은 "PM2 배치 한계 → Grafana 도입" 경험의 다음 단계
- "왜 dbt인가": 모델 간 의존성을 코드로 관리, 운영 가시성 확보
- "왜 Gemini인가": LLM 벤더 종속 피하기 위한 추상화 레이어 설계
- ADR로 모든 기술 선택 근거 문서화 예정

---

## 참고 — GitHub Events API 제약

- 엔드포인트: `GET https://api.github.com/events`
- 반환 한계: 최대 300건 (약 몇 분~몇십 분치 데이터)
- 요청 제한: 인증 시 시간당 5,000건 → 5분 주기 수집으로 여유 있음
- 중복 처리: `event_id` 기준 dbt `unique_key`로 자동 제거
- 수집 주기 근거: GitHub Actions 최소 cron 주기 5분, 데이터 손실 최소화
