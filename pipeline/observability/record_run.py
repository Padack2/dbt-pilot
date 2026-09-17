"""파이프라인(수집 + dbt build) 실행 결과를 pipeline_runs 테이블에 기록.

테이블은 pipeline/sql/pipeline_runs.sql로 미리 생성되어 있어야 한다.
"""

import argparse
import os

import psycopg2

INSERT_SQL = """
insert into pipeline_runs (started_at, finished_at, status, rows_ingested, error_message, github_run_id)
values (%(started_at)s, %(finished_at)s, %(status)s, %(rows_ingested)s, %(error_message)s, %(github_run_id)s);
"""


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--status", required=True, choices=["success", "failure"])
    parser.add_argument("--started-at", required=True)
    parser.add_argument("--finished-at", required=True)
    parser.add_argument("--rows-ingested", default="")
    parser.add_argument("--error-message", default="")
    parser.add_argument("--github-run-id", default="")
    args = parser.parse_args()

    conn = psycopg2.connect(os.environ["DATABASE_URL_BATCH"])
    try:
        with conn.cursor() as cur:
            cur.execute(
                INSERT_SQL,
                {
                    "started_at": args.started_at,
                    "finished_at": args.finished_at,
                    "status": args.status,
                    "rows_ingested": int(args.rows_ingested) if args.rows_ingested else None,
                    "error_message": args.error_message or None,
                    "github_run_id": args.github_run_id or None,
                },
            )
        conn.commit()
    finally:
        conn.close()


if __name__ == "__main__":
    main()
