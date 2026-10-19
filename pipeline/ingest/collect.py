"""GitHub Public Events API(/events)를 5분마다 호출해 JSONL 파일로 저장.

DB에는 접속하지 않는다 — 5분마다 DB에 쓰면 Neon 컴퓨트가 scale-to-zero(5분)될 틈이 없어
무료 플랜 컴퓨트 쿼터(월 100 CU-hours)를 넘기므로(ADR-015), 수집 결과는 collect.yml이
GitHub Actions artifact로 올려두고 1시간마다 ingest.py가 모아서 raw_events에 적재한다.

사용법:
  python collect.py <출력 JSONL 경로>

환경변수:
  GITHUB_TOKEN        - GitHub API rate limit 상향용 (선택, 없으면 미인증 요청)
"""

import json
import os
import sys
import time

import requests

GITHUB_EVENTS_URL = "https://api.github.com/events"
# GitHub Events API는 페이지당 30건 고정, 최대 10페이지(300건)까지만 허용
MAX_PAGES = 10
# /events는 시간당 5000회와 별개로 X-Poll-Interval 기반 폴링 제약이 따로 있어(GitHub REST API 문서),
# 페이지를 딜레이 없이 연속 요청하면 종종 403 rate limit에 걸린다 — 페이지 사이에 짧게 쉰다.
PAGE_DELAY_SECONDS = 1.0


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
            # rate limit(403/429)과 GitHub 측 일시 장애(5xx, 예: 502 Bad Gateway)는 지금까지
            # 모은 데이터로 계속 진행 — event_id 중복 제거가 있어 다음 5분 주기 실행이 자연스럽게
            # 이어서 채운다. 그 외 에러(인증 실패 등)는 그대로 실패시켜야 조용히 묻히지 않는다.
            is_rate_limited = (
                err.response is not None
                and err.response.status_code in (403, 429)
                and "rate limit" in err.response.text.lower()
            )
            is_server_error = (
                err.response is not None and err.response.status_code >= 500
            )
            if not (is_rate_limited or is_server_error):
                raise
            print(
                f"GitHub API {err.response.status_code} 에러로 {page}페이지에서 중단 — "
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
# 제약 위반이면 그 배치 전체가 트랜잭션 에러로 실패하므로, 저장 전에 걸러낸다.
REQUIRED_FIELDS = ("actor_login", "repo_name")


def is_valid_row(row: dict) -> bool:
    return all(row[field] for field in REQUIRED_FIELDS)


def main() -> None:
    output_path = sys.argv[1]

    events = fetch_events()
    all_rows = [to_row(event) for event in events]
    rows = [row for row in all_rows if is_valid_row(row)]
    skipped = len(all_rows) - len(rows)
    if skipped:
        print(f"actor_login/repo_name 누락으로 {skipped}건 건너뜀")

    with open(output_path, "w") as f:
        for row in rows:
            f.write(json.dumps(row) + "\n")

    print(f"수집 완료: {len(rows)}건 → {output_path}")


if __name__ == "__main__":
    main()
