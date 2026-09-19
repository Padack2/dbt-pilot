"""GitHub Public Events API(/events)를 5분마다 호출해 raw_events 테이블에 적재.

raw_events 테이블/인덱스는 pipeline/sql/schema.sql로 미리 생성되어 있어야 한다.

환경변수:
  DATABASE_URL_BATCH  - 배치 전용 롤 접속 문자열 (INSERT 권한만 필요)
  GITHUB_TOKEN        - GitHub API rate limit 상향용 (선택, 없으면 미인증 요청)
"""

import os
import time

import psycopg2
import psycopg2.extras
import requests

GITHUB_EVENTS_URL = "https://api.github.com/events"
# GitHub Events API는 페이지당 30건 고정, 최대 10페이지(300건)까지만 허용
MAX_PAGES = 10
# /events는 시간당 5000회와 별개로 X-Poll-Interval 기반 폴링 제약이 따로 있어(GitHub REST API 문서),
# 페이지를 딜레이 없이 연속 요청하면 종종 403 rate limit에 걸린다 — 페이지 사이에 짧게 쉰다.
PAGE_DELAY_SECONDS = 1.0

INSERT_SQL = """
insert into raw_events (event_id, type, actor_login, actor_id, repo_name, repo_id, payload, public, created_at)
values (%(id)s, %(type)s, %(actor_login)s, %(actor_id)s, %(repo_name)s, %(repo_id)s, %(payload)s, %(public)s, %(created_at)s)
on conflict (event_id) do nothing;
"""


def fetch_events() -> list[dict]:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    events = []
    for page in range(1, MAX_PAGES + 1):
        try:
            response = requests.get(
                GITHUB_EVENTS_URL, headers=headers, params={"page": page}, timeout=30
            )
            response.raise_for_status()
        except requests.exceptions.HTTPError as err:
            # rate limit(403/429)은 지금까지 모은 데이터로 계속 진행 — event_id 중복 제거가
            # 있어 다음 5분 주기 실행이 자연스럽게 이어서 채운다. 그 외 에러(인증 실패 등)는
            # 그대로 실패시켜야 조용히 묻히지 않는다.
            is_rate_limited = (
                err.response is not None
                and err.response.status_code in (403, 429)
                and "rate limit" in err.response.text.lower()
            )
            if not is_rate_limited:
                raise
            print(
                f"GitHub API rate limit로 {page}페이지에서 중단 — "
                f"지금까지 모은 {len(events)}건으로 계속 진행"
            )
            break

        page_events = response.json()
        if not page_events:
            break
        events.extend(page_events)

        if page < MAX_PAGES:
            time.sleep(PAGE_DELAY_SECONDS)

    return events


def to_row(event: dict) -> dict:
    return {
        "id": event["id"],
        "type": event["type"],
        "actor_login": event.get("actor", {}).get("login"),
        "actor_id": event.get("actor", {}).get("id"),
        "repo_name": event.get("repo", {}).get("name"),
        "repo_id": event.get("repo", {}).get("id"),
        # payload(JSONB)는 어디서도 조회하지 않는데 row당 평균 크기의 90%+를 차지해서
        # (Neon 무료 티어 용량 압박, ADR-014) 더 이상 저장하지 않는다.
        "payload": None,
        "public": event.get("public", True),
        "created_at": event["created_at"],
    }


# raw_events는 actor_login/repo_name이 NOT NULL인데, GitHub이 삭제된/익명화된 계정·레포에
# 대해 이 필드를 빈 값으로 내려주는 이벤트가 간헐적으로 섞여 있다. execute_batch는 한 건이라도
# 제약 위반이면 그 배치 전체가 트랜잭션 에러로 실패하므로, insert 전에 걸러낸다.
REQUIRED_FIELDS = ("actor_login", "repo_name")


def is_valid_row(row: dict) -> bool:
    return all(row[field] for field in REQUIRED_FIELDS)


def main() -> None:
    events = fetch_events()
    all_rows = [to_row(event) for event in events]
    rows = [row for row in all_rows if is_valid_row(row)]
    skipped = len(all_rows) - len(rows)
    if skipped:
        print(f"actor_login/repo_name 누락으로 {skipped}건 건너뜀")

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, INSERT_SQL, rows)
        conn.commit()
    finally:
        conn.close()

    print(f"수집 완료: {len(rows)}건")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"rows_ingested={len(rows)}\n")


if __name__ == "__main__":
    main()
