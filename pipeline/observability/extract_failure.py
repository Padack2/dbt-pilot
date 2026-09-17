"""dbt run_results.json에서 첫 실패 노드의 에러 메시지를 추출해 표준출력으로 반환.

run_results.json이 없다면 dbt가 실행되기 전(ingest 등) 단계에서 실패한 것이다.
"""

import json
import os

RUN_RESULTS_PATH = os.path.join("pipeline", "dbt", "target", "run_results.json")


def main() -> None:
    if not os.path.exists(RUN_RESULTS_PATH):
        print("ingest 단계에서 실패 (run_results.json 없음, Actions 로그 참고)")
        return

    with open(RUN_RESULTS_PATH) as f:
        data = json.load(f)

    for result in data.get("results", []):
        if result.get("status") in ("error", "fail"):
            node = result.get("unique_id", "unknown")
            message = (result.get("message") or "").splitlines()[0][:300]
            print(f"{node}: {message}")
            return

    print("dbt build 실패 (구체적 원인 미확인, Actions 로그 참고)")


if __name__ == "__main__":
    main()
