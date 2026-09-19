## 메타

- **ADR ID**: ADR-010
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/llm/types.ts`, `apps/web/src/lib/llm/gemini.ts`,
  `apps/web/src/lib/chat-tools.ts`, `apps/web/src/lib/trending-repos.ts`,
  `apps/web/src/app/api/chat/route.ts`
- **태그**: 보안, Frontend, DX
- **관련 ADR**: ADR-009 (읽기 전용 챗봇 v1)

---

## 1) 배경 (Context)

- ADR-009에서 챗봇 v1은 "서버가 미리 정한 컨텍스트 스냅샷만 프롬프트에 주입"하는 방식을 택하고,
  옵션 A-1(LLM에게 실행 권한을 줘서 필요한 데이터를 스스로 가져오게 하는 방식)은 다음으로
  미뤄뒀다. 실사용해보니 스냅샷에 없는 질문("요즘 제일 핫한 기술 스택이 뭐야?" 같은 트렌드
  질문, 특정 레포 하나를 콕 집은 질문)에 막히는 경험이 바로 나왔다. 사용자는 AI가 뭐든지
  답할 수 있다고 기대하고 쓰기 마련이라는 점도 고려했다.
- 목표: 스냅샷에 없는 질문에도 답할 수 있게 하되, LLM이 SQL이나 임의 코드를 직접 만들어
  실행하는 구조는 여전히 피한다(ADR-009에서 이미 거부한 리스크를 다시 들이지 않음).

## 2) 고려한 선택지 (Options)

- 옵션 A: 컨텍스트 스냅샷에 넣는 데이터를 계속 늘림 (예: 인기 언어 50개, 레포 50개까지 미리
  전부 주입)
    - 장점: 구현 단순, 멀티턴 왕복 없음
    - 단점/리스크: 프롬프트가 계속 커져 토큰 비용 증가, 그래도 "이 레포 이름 하나만" 같은
      완전히 임의의 질문에는 여전히 못 답함(모든 경우의 수를 미리 넣을 수 없음)
- 옵션 B: Gemini function calling(tool calling) 도입 — LLM은 함수 이름과 인자만 고르고,
  서버가 그 인자를 검증해 이미 정의된 파라미터화 쿼리를 실행 (채택)
    - 장점: LLM은 SQL을 한 줄도 못 씀 — REFRESH 버튼(ADR-006)과 동일한 수준의 화이트리스트
      원칙(정해진 함수만, 인자만 검증)을 읽기 쿼리에도 그대로 적용. 스냅샷에 없는 질문에도
      유연하게 대응 가능
    - 단점/리스크: 멀티턴 왕복 로직이 필요해 구현 복잡도 증가. 실제로 이 API를 처음 써보며
      직접 겪은 문제: (1) 함수 호출 응답을 히스토리에 그대로 안 돌려주면 통과하지만, 서버는
      "이전에 반환한 함수 호출을 다시 프롬프트에 그대로 실어 보내는" 흐름을 요구하고, (2) 그때
      원본 응답에 같이 온 `thoughtSignature`를 누락하면 다음 요청이 400
      "Function call is missing a thought_signature" 에러로 거부됨 — 문서 요약만 믿고
      구현했다면 놓쳤을 부분이라, curl로 실제 왕복을 먼저 검증한 뒤 코드를 짰다

## 3) 결정 (Decision)

- 최종 선택: 옵션 B. `lib/llm/types.ts`의 `ToolDefinition`(name/description/parameters/execute)
  을 `LlmClient.chat()`이 선택적으로 받도록 확장하고, `lib/llm/gemini.ts`가 내부적으로
  최대 4라운드까지 "함수 호출 → 서버가 execute 실행 → 결과를 functionResponse로 회신 → 재요청"
  루프를 돈다. `thoughtSignature` 처리 같은 Gemini 고유의 배관(plumbing)은 전부
  `gemini.ts` 내부에 캡슐화하고, 호출부(API 라우트)는 `ToolDefinition[]`만 넘기면 된다 —
  벤더를 바꿔도 이 계약은 유지됨(ADR-009의 벤더 추상화 원칙 유지).
- 이번에 추가한 도구 2개:
  1. `search_trending_repos`: 레포 이름/설명 키워드, 언어로 검색 (`trending_repos_with_activity`
     조회, 전부 `$n` 파라미터 바인딩 — SQL 인젝션 불가)
  2. `get_pipeline_history`: 파이프라인 실행 이력을 기본 컨텍스트보다 더 많이/상태별로 조회
  3. `get_daily_event_counts`: `mv_daily_trend`를 일자별로 묶어 "어제/오늘 각각 몇 건" 같은
     날짜별 질문에 대응 (직접 이 질문으로 막히는 걸 확인하고 바로 추가, ADR-009
     한계 항목과 동일한 패턴 — 실사용 중 발견된 공백을 도구로 메움)
  4. `get_daily_growth_ranking`: `mv_trending_daily_growth`(기존에 대시보드 홈 화면에만 쓰이던
     일별 Star/Fork 증가량 MV)를 특정 날짜 기준 랭킹으로 재사용해 "어제 제일 성과 낮은/좋은
     레포" 같은 질문에 대응 (역시 실사용 중 막힌 질문을 그대로 재현해 도구 설계 검증)
- 결정 이유(Trade-off): 옵션 A는 "밑 빠진 독에 물 붓기"라 근본 해결이 안 된다고 판단했다.
  옵션 B는 구현 복잡도가 늘지만, 그 복잡도가 전부 서버가 통제하는 함수 이름/인자 검증 계층
  안에 갇혀있어서 REFRESH 버튼과 동일한 보안 모델을 유지한 채 답변 범위를 넓힐 수 있었다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: "특정 레포 찾아줘", "실패한 이력 더 보여줘" 같은 질문에 실시간으로 답 가능해짐.
  LLM의 실행 권한은 여전히 이름이 정해진 함수 2개로 제한됨(구조적 화이트리스트).
- 부정적 영향/부채: 도구 실행마다 Gemini API를 추가로 왕복하므로(최대 4라운드) 응답 지연과
  무료 티어 요청 수 소비가 늘어남(`chat-rate-limit.ts`의 분당 10회 제한은 "질문 1건"
  기준이라, 도구 호출이 여러 번 일어나는 질문은 실제 Gemini 요청 수 기준으로는 더 많이 씀 —
  아직 별도로 반영하지 않음). 도구가 늘어날수록 `chat-tools.ts`가 커짐.
- 추후 작업(TODO): 실제 무료 티어 소진이 체감되면 라운드당 rate limit도 고려. 도구가 5개
  이상으로 늘면 카테고리별 파일 분리 검토.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: 실제 Gemini API에 curl로 3단계 직접 검증 — (1) `tools` 필드로 함수 선언 전송 →
  `functionCall` 응답 확인, (2) `thoughtSignature` 없이 결과 회신 → 400 에러 재현, (3)
  `thoughtSignature` 포함해 재요청 → 모의 데이터(`facebook/react`, 230000 stars)가 자연스러운
  한국어 문장으로 합성되어 돌아오는 것까지 확인. `get_daily_event_counts` 추가 후에는 실제로
  막혔던 질문("어제랑 오늘 쌓인 데이터 각각 몇건이야?")을 그대로 보내 `{days: 2}` 인자로
  올바르게 호출되는 것까지 재확인. `tsc --noEmit`/`next lint`/`next build` 통과.
- 롤백 전략: `api/chat/route.ts`에서 `tools: CHAT_TOOLS` 한 줄만 제거하면 ADR-009의 순수
  컨텍스트 주입 방식으로 즉시 되돌아간다. `chat-tools.ts`와 `gemini.ts`의 도구 처리 로직을
  통째로 제거해도 `tools`가 없을 때(`undefined`)는 기존 흐름과 동일하게 동작하도록 짜여있다.
