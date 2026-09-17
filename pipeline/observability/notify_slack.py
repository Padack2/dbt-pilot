"""Slack 웹훅으로 실패 알림 전송.

json.dumps로 메시지를 인코딩해서 에러 메시지에 따옴표/개행이 섞여 있어도
셸 이스케이프 문제 없이 안전하게 전송한다.
"""

import json
import os
import urllib.request


def main() -> None:
    text = (
        f":rotating_light: dbt-pilot 파이프라인 {os.environ.get('FAILURE_STREAK', '?')}회 연속 실패\n"
        f"{os.environ.get('ERROR_MESSAGE', '')}\n"
        f"{os.environ['RUN_URL']}"
    )
    payload = json.dumps({"text": text}).encode()
    req = urllib.request.Request(
        os.environ["SLACK_WEBHOOK_URL"],
        data=payload,
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=10)


if __name__ == "__main__":
    main()
