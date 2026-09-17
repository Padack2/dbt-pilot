"""연속 실패가 임계값(FAILURE_ALERT_THRESHOLD, 기본 3)의 배수에 도달했을 때만
alert=true를 출력한다. 5분마다 도는 배치라 일시적 오류로도 실패가 잦을 수 있어서,
매번 알림을 보내는 대신 "연속 실패"일 때만 (그리고 이미 보낸 뒤에는 조용히 있다가
threshold 배수마다 다시) 알리는 알림 피로 방지 정책.
"""

import os

import psycopg2

QUERY = """
select status
from pipeline_runs
order by started_at desc
limit %(limit)s;
"""


def main() -> None:
    threshold = int(os.environ.get("FAILURE_ALERT_THRESHOLD", "3"))

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            cur.execute(QUERY, {"limit": threshold * 10})
            statuses = [row[0] for row in cur.fetchall()]
    finally:
        conn.close()

    streak = 0
    for status in statuses:
        if status != "failure":
            break
        streak += 1

    alert = streak > 0 and streak % threshold == 0

    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write(f"alert={'true' if alert else 'false'}\n")
        f.write(f"streak={streak}\n")


if __name__ == "__main__":
    main()
