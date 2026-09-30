"""적재 전에 Neon 컴퓨트 쿼터 초과 여부를 확인해 available=true/false를 출력한다 (ADR-015).

무료 플랜 컴퓨트 쿼터를 넘기면 Neon이 접속 단계에서 "exceeded the quota"로 거부하고,
다음 결제 주기까지 풀리지 않는다. 이건 코드로 복구할 수 없는 "예상된 중단"이라 실패로
처리하면 매 실행마다 GitHub 실패 메일만 쌓이므로, 경고만 남기고 성공 종료해 이후 스텝을
건너뛴다(수집분은 artifact에 남아 쿼터가 풀린 뒤 적재된다). 그 외 접속 오류는 진짜 장애라
그대로 실패시킨다.
"""

import os

import psycopg2

QUOTA_EXCEEDED_MESSAGE = "exceeded the quota"


def main() -> None:
    try:
        psycopg2.connect(os.environ["DATABASE_URL_BATCH"]).close()
        available = True
    except psycopg2.OperationalError as err:
        if QUOTA_EXCEEDED_MESSAGE not in str(err):
            raise
        print("::warning::Neon 컴퓨트 쿼터 초과 — 이번 적재를 건너뜀 (수집분은 artifact에 보존됨)")
        available = False

    with open(os.environ["GITHUB_OUTPUT"], "a") as f:
        f.write(f"available={'true' if available else 'false'}\n")


if __name__ == "__main__":
    main()
