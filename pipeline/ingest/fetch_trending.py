"""GitHub Search API로 급상승(신생 인기) 레포 스냅샷을 하루 1회 수집해 trending_repos_snapshot에 적재.

GitHub REST API에는 공식 trending 엔드포인트가 없어, "최근 생성되고 스타가 많은 레포"를
근사치로 사용한다 (ADR-004 참고).

trending_repos_snapshot 테이블은 pipeline/sql/trending_repos_snapshot.sql로 미리 생성되어 있어야 한다.

환경변수:
  DATABASE_URL_BATCH  - 배치 전용 롤 접속 문자열 (INSERT 권한만 필요)
  GITHUB_TOKEN        - GitHub API 인증 (Search API는 미인증 시 분당 10회로 더 제한적)
"""

import datetime
import os

import psycopg2
import psycopg2.extras
import requests

SEARCH_URL = "https://api.github.com/search/repositories"
LOOKBACK_DAYS = 7
PER_PAGE = 50

INSERT_SQL = """
insert into trending_repos_snapshot
    (repo_name, description, stars, forks, language, repo_created_at, repo_pushed_at, captured_at)
values
    (%(repo_name)s, %(description)s, %(stars)s, %(forks)s, %(language)s, %(repo_created_at)s, %(repo_pushed_at)s, %(captured_at)s);
"""


def fetch_trending_repos() -> list[dict]:
    headers = {"Accept": "application/vnd.github+json"}
    token = os.environ.get("GITHUB_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"

    since = (
        datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=LOOKBACK_DAYS)
    ).strftime("%Y-%m-%d")
    params = {
        "q": f"created:>{since}",
        "sort": "stars",
        "order": "desc",
        "per_page": PER_PAGE,
    }
    response = requests.get(SEARCH_URL, headers=headers, params=params, timeout=30)
    response.raise_for_status()
    return response.json().get("items", [])


def to_row(repo: dict, captured_at: str) -> dict:
    return {
        "repo_name": repo["full_name"],
        "description": repo.get("description"),
        "stars": repo["stargazers_count"],
        "forks": repo["forks_count"],
        "language": repo.get("language"),
        "repo_created_at": repo["created_at"],
        "repo_pushed_at": repo["pushed_at"],
        "captured_at": captured_at,
    }


def main() -> None:
    captured_at = datetime.datetime.now(datetime.timezone.utc).isoformat()
    repos = fetch_trending_repos()
    rows = [to_row(repo, captured_at) for repo in repos]

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            psycopg2.extras.execute_batch(cur, INSERT_SQL, rows)
        conn.commit()
    finally:
        conn.close()

    print(f"트렌딩 레포 수집 완료: {len(rows)}건")


if __name__ == "__main__":
    main()
