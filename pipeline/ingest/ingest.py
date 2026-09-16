"""GitHub Public Events API(/events)를 5분마다 호출해 raw_events 테이블에 적재.

raw_events 테이블/인덱스는 pipeline/sql/schema.sql로 미리 생성되어 있어야 한다.

환경변수:
  DATABASE_URL_BATCH  - 배치 전용 롤 접속 문자열 (INSERT 권한만 필요)
  GITHUB_TOKEN        - GitHub API rate limit 상향용 (선택, 없으면 미인증 요청)
"""

import os

import psycopg2
import psycopg2.extras
import requests

GITHUB_EVENTS_URL = "https://api.github.com/events"

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

    response = requests.get(GITHUB_EVENTS_URL, headers=headers, timeout=30)
    response.raise_for_status()
    return response.json()


def to_row(event: dict) -> dict:
    return {
        "id": event["id"],
        "type": event["type"],
        "actor_login": event.get("actor", {}).get("login"),
        "actor_id": event.get("actor", {}).get("id"),
        "repo_name": event.get("repo", {}).get("name"),
        "repo_id": event.get("repo", {}).get("id"),
        "payload": psycopg2.extras.Json(event.get("payload", {})),
        "public": event.get("public", True),
        "created_at": event["created_at"],
    }


def main() -> None:
    events = fetch_events()
    rows = [to_row(event) for event in events]

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, INSERT_SQL, rows)
        conn.commit()
    finally:
        conn.close()

    print(f"수집 완료: {len(rows)}건")


if __name__ == "__main__":
    main()
