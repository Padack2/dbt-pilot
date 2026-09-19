## 메타

- **ADR ID**: ADR-012
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/llm/gemini.ts`
- **태그**: 안정성, 비용
- **관련 ADR**: ADR-009(챗봇 읽기 전용 v1), ADR-010(function calling), ADR-011(같은 날 이어서
  진행한 REFRESH 도구 추가)

---

## 1) 배경 (Context)

- 챗봇을 쓰다 보니 "토큰 때문에 대화 실패가 잦다"는 문제를 직접 겪었다. 재현해보니 두 가지
  문제가 겹쳐 있었다: (1) Gemini가 503(고수요)을 실제로 자주 반환함(개발 중 curl 테스트에서도
  여러 번 재현), (2) 더 결정적으로, `gemini-3.8-flash`가 무료 티어에서 **하루 20회**라는
  매우 작은 한도를 갖고 있었다(`GenerateRequestsPerDayPerProjectPerModel-FreeTier`,
  quotaValue: 20 — 429 응답으로 직접 확인). 애초에 대화 몇 번이면 소진되는 한도였다.

## 2) 고려한 선택지 (Options)

- 옵션 A: `gemini-3.8-flash` 유지하고 재시도만 추가
    - 단점/리스크: 하루 20회 한도 자체는 재시도로 못 풂 — 몇 번 대화하면 그날은 챗봇이
      완전히 막힘
- 옵션 B: 503/429에 대한 재시도 로직 추가 **+** 모델을 `gemini-3.6-flash`로 하향 (채택)
    - 장점: 3.6-flash는 동일한 function calling(ADR-010/011의 도구 호출 포함)이 정상
      동작하면서 20/day 같은 한도에 바로 걸리지 않음(직접 여러 번 호출해 확인). 503 같은
      진짜 일시적 과부하는 재시도(최대 3회, 순차 backoff)로 대응
    - 단점/리스크: 재시도가 function calling의 `MAX_TOOL_ROUNDS`(최대 4라운드, ADR-010)와
      곱해지면 질문 하나당 최악의 경우 Gemini 호출이 최대 12번까지 날 수 있음 — 지금은
      감수하되, 실제로 쿼터 문제가 다시 느껴지면 손볼 대상으로 남겨둠

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. `lib/llm/gemini.ts`의 `callGemini()`에 재시도 로직 추가: 429/503만
  재시도 대상(그 외 4xx는 즉시 실패), 최대 3회, 시도마다 1초씩 늘려가며 대기. 기본 모델을
  `gemini-3.6-flash`로 변경.
- 결정 이유(Trade-off): "최신 모델을 쓴다"는 선호보다 "매일 대화 몇 번에 막히지 않는다"는
  실사용성이 압도적으로 중요해서 망설임 없이 결정했다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: 503 같은 일시적 오류는 사용자가 체감하기 전에 재시도로 자동 해결. 무료 티어
  하루 한도 문제가 사실상 해소(3.6-flash가 즉시 20/day 같은 한도에 걸리지 않음을 확인).
- 부정적 영향/부채: 도구 호출 + 재시도가 겹치면 한 번의 질문이 Gemini API를 여러 번 소비할
  수 있어, 3.6-flash도 사용량이 늘면 언젠가 비슷한 한도 문제를 겪을 수 있음.
- 추후 작업(TODO): 실제로 3.6-flash도 한도에 자주 걸리면, 도구 호출 라운드마다 별도
  rate-limit을 두거나 429 응답의 `retryDelay`를 파싱해 좀 더 똑똑하게 기다리는 방안 검토.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: curl로 (1) `gemini-3.8-flash`가 실제로 20/day 한도에서 429를 반환하는 것을
  재현, (2) `gemini-3.6-flash`로 동일한 function calling(REFRESH 도구 포함)이 정상 동작하는
  것을 확인, (3) 재시도 로직을 mock fetch로 3가지 시나리오(503 두 번 후 성공 / 재시도
  불가능한 400은 즉시 중단 / 503 지속 시 3회 후 실패) 전부 통과 확인. `tsc --noEmit`/
  `next lint`/`next build` 통과.
- 롤백 전략: `gemini.ts`의 `GEMINI_MODEL` 상수와 재시도 관련 상수(`RETRYABLE_STATUS`,
  `MAX_RETRIES`) 부분만 되돌리면 된다. 다른 모듈에 영향 없음.
