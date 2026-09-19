## 메타

- **ADR ID**: ADR-009
- **상태**: 승인
- **날짜**: 2026-09-18
- **작성자**: ab41609924@gmail.com
- **영향 범위**: `apps/web/src/lib/llm/`, `apps/web/src/lib/chat-context.ts`,
  `apps/web/src/lib/chat-rate-limit.ts`, `apps/web/src/app/api/chat/route.ts`,
  `apps/web/src/components/ChatPanel.tsx`, `apps/web/src/components/ChatDrawer.tsx`
- **태그**: Frontend, 보안, 비용, DX
- **관련 ADR**: ADR-006, ADR-008 (인메모리 상태/쿨다운 패턴 재사용)

---

## 1) 배경 (Context)

- `docs/plan.md` Phase 2 "LLM 챗봇"의 첫 슬라이스. 전체 범위(Gemini 연동, 오류 원인 분석,
  자연어 명령 처리, 화이트리스트 액션 제어, 벤더 추상화)를 한 번에 만들기엔 크고, 특히
  "자연어로 REFRESH 같은 쓰기 액션을 실행"하는 부분은 인증 없는 공개 페이지에서 LLM이 판단해
  쓰기 액션을 트리거한다는, ADR-006(REFRESH 버튼)보다 리스크가 높은 결정이라 별도로 다룬다.
- 목표: 이번 슬라이스는 **읽기 전용**으로 한정한다 — 파이프라인/모델 상태에 대한 자연어 질문에
  답하고, 최근 실패의 원인을 설명한다. 쓰기 액션(REFRESH 트리거 등)은 이번 범위 밖.
- 비목표: 실제 SQL 실행이나 함수 호출(tool calling)을 통한 DB 조회. 대화 이력 영속화.

## 2) 고려한 선택지 (Options)

**(A) 컨텍스트 데이터 확보 방식**

- 옵션 A-1: LLM에게 tool/function calling으로 직접 쿼리 실행 권한을 줌
    - 장점: 필요한 데이터를 LLM이 유연하게 스스로 판단해서 가져옴
    - 단점/리스크: 읽기 전용이라도 "LLM이 임의 SQL을 결정해서 실행"하는 구조 자체가 공격 표면.
      화이트리스트 검증 로직이 먼저 갖춰져야 안전하게 열 수 있는데, 그건 다음 슬라이스(쓰기
      액션)와 함께 설계할 문제라 지금 범위에 안 맞음
- 옵션 A-2: 서버가 미리 정해진 조회(파이프라인 실행 이력, MV 상태, 모델 용량, 실패 시
  해당 모델 SQL)를 실행해 텍스트로 요약한 뒤 프롬프트에 통째로 주입 (채택)
    - 장점: LLM은 SQL을 전혀 모름 — 서버가 이미 정한 안전한 쿼리들만 돈다. 구현이 단순하고
      공격 표면이 REFRESH 버튼과 동일한 수준(기존 readonly 쿼리 재사용)
    - 단점/리스크: LLM이 "미리 준비 안 된" 질문에는 답을 못 함(예: 특정 레포의 상세 정보).
      컨텍스트가 커지면 토큰 비용 증가

**(B) 추론(thinking) 모드**

- 실제 Gemini API를 더미/실 키로 직접 호출해본 결과, `gemini-3.8-flash`는 응답 전에 내부
  "사고" 토큰을 쓰는 모델이었다. "1+1은?" 같은 사소한 질문에도 180 thinking 토큰을 썼고,
  `maxOutputTokens`가 부족하면 **답변 텍스트가 완전히 빈 채로 잘리는** 것을 직접 확인했다
  (`finishReason: "MAX_TOKENS"`, `content: {}`).
    - 옵션 B-1: `maxOutputTokens`를 넉넉히 늘려서 대응
        - 단점/리스크: thinking 토큰 소비량이 질문마다 들쑥날쑥(16~180+ 토큰, 직접 관찰)이라
          "얼마나 늘려야 안전한지" 보장이 없음. 비용/지연 증가
    - 옵션 B-2: `generationConfig.thinkingConfig.thinkingBudget: 0`으로 추론 자체를 비활성화
      (채택)
        - 장점: 우리 용도(주어진 컨텍스트 요약/보고)는 깊은 추론이 필요 없음. 토큰 소비량이
          예측 가능해지고 빈 응답 리스크가 사라짐. 직접 테스트로 정상 응답 확인 완료
        - 단점/리스크: 향후 진짜 복잡한 추론이 필요한 질문(예: 여러 단계 원인 분석)에는 답
          품질이 떨어질 수 있음

**(C) 남용 방지**

- Gemini 무료 티어가 분당 15회 한도라, 인증 없는 공개 페이지에서 그대로 열면 방문자 몇 명만
  몰려도 한도를 소진해 전체 서비스가 막힐 수 있다. ADR-006/008과 동일하게 프로세스 인메모리
  카운터로 분당 10회(무료 티어보다 낮게) 전역 제한을 뒀다. 서버리스 다중 인스턴스에서는
  인스턴스별로 분리 카운트되어 완전한 보장은 아니라는 점도 동일한 트레이드오프.

## 3) 결정 (Decision)

- 최종 선택: A-2(서버가 컨텍스트를 미리 구성해 프롬프트에 주입) + B-2(thinking 비활성화) +
  분당 10회 전역 rate limit.
- 벤더 추상화: `lib/llm/types.ts`의 `LlmClient` 인터페이스(`chat({systemPrompt, messages})`)
  뒤에 `lib/llm/gemini.ts` 구현체를 둠. API 라우트(`api/chat/route.ts`)는 `geminiClient`라는
  구체 구현을 직접 import하지만, 다른 벤더로 바꿀 때 이 한 줄의 import만 교체하면 되도록
  인터페이스 계약을 분리해뒀다 (본격적인 DI 컨테이너 같은 건 이 규모에 과하다고 판단해 안 함).
- 결정 이유(Trade-off): 이번 슬라이스는 "읽기 전용"이라는 범위 제약이 있어서, LLM에게 실행
  권한을 주는 옵션(A-1)은 애초에 이번 목표에 맞지 않았다. thinking 비활성화는 실측으로 확인한
  구체적 버그(빈 응답)에 대한 직접적인 대응이라 선택의 여지가 거의 없었다.

## 4) 결과/영향 (Consequences)

- 긍정적 영향: LLM이 SQL/DB에 전혀 접근하지 않아 읽기 전용이라는 제약이 구조적으로 보장됨
  (화이트리스트 검증이 아니라 애초에 실행 권한이 없음). thinking 비활성화로 응답이 빠르고
  예측 가능해짐(직접 테스트: "mv_repo_ranking 상태 알려줘" 질문에 컨텍스트 기반으로 정확히
  답변, thinking 토큰 0).
- 부정적 영향/부채: 서버가 미리 준비한 컨텍스트에 없는 질문에는 여전히 답을 못 함. 최초
  버전은 파이프라인/MV 상태만 담아서 "요즘 제일 핫한 기술 스택이 뭐야?" 같은 트렌드 분석
  질문에 답을 못 하는 문제를 바로 발견해, 급상승 레포 점수 랭킹/언어별 종합
  점수/언어별 레포 수/인기 토픽(`lib/trending-rankings.ts`, `lib/trending-score.ts`)을
  컨텍스트에 추가했다(같은 날 보완). 그래도 이 스냅샷들에 없는 임의 질문(예: 특정 레포의
  커밋 이력)은 여전히 답 불가. 대화 이력은 클라이언트 상태로만 존재해 새로고침하면 사라짐.
- 추후 작업(TODO): 쓰기 액션(자연어로 REFRESH 트리거)은 별도 ADR로 화이트리스트 검증 설계를
  먼저 하고 진행. 컨텍스트가 계속 늘어나면 토큰 비용/프롬프트 크기 관리 필요.

## 5) 검증/롤백 (Validation / Rollback)

- 검증 방법: 더미 API 키로 Gemini 엔드포인트 요청 형식(400 `API_KEY_INVALID`로 스키마 자체는
  통과 확인) → 실제 키로 "mv_repo_ranking 상태 알려줘" 질문에 컨텍스트 기반 정확한 답변 확인 →
  `thinkingConfig.thinkingBudget: 0` 유무에 따른 응답 차이(빈 응답 vs 정상 응답) 직접 비교 →
  `tsc --noEmit`/`next lint`/`next build` 통과, `/api/chat`도 `/models`와 마찬가지로
  `pipeline/dbt/models` SQL을 런타임에 읽으므로 `next.config.mjs`의
  `outputFileTracingIncludes`에 `/api/chat` 항목 추가 확인.
- 롤백 전략: `layout.tsx`에서 `<ChatDrawer />` 한 줄만 제거하면 UI에서 사라진다.
  `components/ChatDrawer.tsx`, `components/ChatPanel.tsx`, `app/api/chat/`, `lib/llm/`, `lib/chat-context.ts`,
  `lib/chat-rate-limit.ts`를 통째로 삭제해도 기존 기능(REFRESH, 그래프 등)에는 영향 없음.
