"""collect.yml이 5분마다 artifact로 올려둔 이벤트(JSONL)를 모아 raw_events 테이블에 적재.

1시간마다 실행된다(ADR-015). 적재(commit)가 끝난 artifact만 삭제하므로, 적재가 실패하거나
Neon 쿼터 초과로 건너뛴 동안의 수집분은 artifact 보존 기간(7일) 안에서 다음 실행 때 한꺼번에
들어간다. 삭제 직전에 실패해 같은 artifact를 다시 읽더라도 event_id 중복 제거로 안전하다.

raw_events 테이블/인덱스는 pipeline/sql/schema.sql로 미리 생성되어 있어야 한다.

환경변수:
  DATABASE_URL_BATCH  - 배치 전용 롤 접속 문자열 (INSERT 권한만 필요)
  ARTIFACTS_TOKEN     - artifact 조회/다운로드/삭제용 토큰 (워크플로우의 GITHUB_TOKEN, actions: write)
  GITHUB_REPOSITORY   - owner/repo (GitHub Actions가 자동 설정)
"""

import io
import json
import os
import zipfile

import psycopg2
import psycopg2.extras
import requests

GITHUB_API_URL = "https://api.github.com"
# collect.yml의 upload-artifact name과 맞춰야 한다
ARTIFACT_PREFIX = "raw-events-"

INSERT_SQL = """
insert into raw_events (event_id, type, actor_login, actor_id, repo_name, repo_id, payload, public, created_at)
values (%(id)s, %(type)s, %(actor_login)s, %(actor_id)s, %(repo_name)s, %(repo_id)s, %(payload)s, %(public)s, %(created_at)s)
on conflict (event_id) do nothing;
"""


def list_buffered_artifacts(session: requests.Session, repo: str) -> list[dict]:
    artifacts = []
    page = 1
    while True:
        response = session.get(
            f"{GITHUB_API_URL}/repos/{repo}/actions/artifacts",
            params={"per_page": 100, "page": page},
            timeout=30,
        )
        response.raise_for_status()
        batch = response.json()["artifacts"]
        artifacts.extend(
            a for a in batch if a["name"].startswith(ARTIFACT_PREFIX) and not a["expired"]
        )
        if len(batch) < 100:
            return artifacts
        page += 1


def download_rows(session: requests.Session, artifact: dict) -> list[dict]:
    response = session.get(artifact["archive_download_url"], timeout=60)
    response.raise_for_status()
    rows = []
    with zipfile.ZipFile(io.BytesIO(response.content)) as archive:
        for name in archive.namelist():
            rows.extend(json.loads(line) for line in archive.read(name).splitlines() if line)
    return rows


def main() -> None:
    repo = os.environ["GITHUB_REPOSITORY"]
    session = requests.Session()
    session.headers.update(
        {
            "Accept": "application/vnd.github+json",
            "Authorization": f"Bearer {os.environ['ARTIFACTS_TOKEN']}",
        }
    )

    artifacts = list_buffered_artifacts(session, repo)
    rows = [row for artifact in artifacts for row in download_rows(session, artifact)]

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, INSERT_SQL, rows)
        conn.commit()
    finally:
        conn.close()

    for artifact in artifacts:
        session.delete(
            f"{GITHUB_API_URL}/repos/{repo}/actions/artifacts/{artifact['id']}", timeout=30
        ).raise_for_status()

    print(f"적재 완료: artifact {len(artifacts)}개, {len(rows)}건")

    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a") as f:
            f.write(f"rows_ingested={len(rows)}\n")


if __name__ == "__main__":
    main()
