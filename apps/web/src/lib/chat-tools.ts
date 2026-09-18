import type { ToolDefinition } from "./llm/types";
import { searchTrendingRepos } from "./trending-repos";
import { getRecentPipelineRuns } from "./pipeline-runs";
import { getDailyEventCounts, getRepoGrowthRanking } from "./daily-trend";

// 챗봇이 미리 준비된 컨텍스트 스냅샷(chat-context.ts)에 없는 걸 물어볼 때 호출하는 읽기 전용
// 도구들. 전부 이미 있는 파라미터화 쿼리 함수를 감쌀 뿐, LLM이 SQL을 직접 만들지 않는다.
export const CHAT_TOOLS: ToolDefinition[] = [
  {
    name: "search_trending_repos",
    description:
      "급상승 레포 목록에서 이름/설명 키워드나 프로그래밍 언어로 검색한다. 사용자가 특정 레포나 " +
      "특정 언어의 레포를 콕 집어 물어볼 때, 또는 기본 컨텍스트에 없는 레포 정보가 필요할 때 사용.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "레포 이름 또는 설명에 포함된 키워드 (선택)" },
        language: { type: "string", description: "프로그래밍 언어로 필터, 예: Python (선택)" },
        limit: { type: "number", description: "반환할 최대 개수 (기본 5, 최대 15)" },
      },
    },
    async execute(args) {
      const repos = await searchTrendingRepos({
        query: typeof args.query === "string" ? args.query : undefined,
        language: typeof args.language === "string" ? args.language : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return { repos };
    },
  },
  {
    name: "get_pipeline_history",
    description:
      "파이프라인 실행 이력을 기본 컨텍스트보다 더 많이, 또는 성공/실패 상태로 필터링해서 조회한다.",
    parameters: {
      type: "object",
      properties: {
        limit: { type: "number", description: "조회할 최대 건수 (기본 20, 최대 50)" },
        status: {
          type: "string",
          enum: ["success", "failure"],
          description: "상태로 필터 (선택, 지정 안 하면 전체)",
        },
      },
    },
    async execute(args) {
      const limit = typeof args.limit === "number" ? Math.min(Math.max(args.limit, 1), 50) : 20;
      const status = args.status === "success" || args.status === "failure" ? args.status : undefined;

      const runs = await getRecentPipelineRuns(limit);
      const filtered = status ? runs.filter((run) => run.status === status) : runs;

      return {
        runs: filtered.map((run) => ({
          startedAt: run.startedAt,
          status: run.status,
          rowsIngested: run.rowsIngested,
          errorMessage: run.errorMessage,
        })),
      };
    },
  },
  {
    name: "get_daily_event_counts",
    description:
      "일자(event_date)별로 처리된 이벤트 건수를 이벤트 타입별 세부 내역과 함께 조회한다. " +
      "'어제/오늘/최근 며칠간 데이터가 얼마나 쌓였어?' 같은 일자별 질문에 사용.",
    parameters: {
      type: "object",
      properties: {
        days: { type: "number", description: "오늘 포함 조회할 최근 일수 (기본 7, 최대 30)" },
      },
    },
    async execute(args) {
      const days = typeof args.days === "number" ? Math.min(Math.max(args.days, 1), 30) : 7;
      const counts = await getDailyEventCounts(days);
      return { dailyCounts: counts };
    },
  },
  {
    name: "get_daily_growth_ranking",
    description:
      "특정 날짜의 급상승 레포를 Star+Fork 증가량 기준으로 랭킹한다. '어제 제일 성과 낮은/안 좋은 " +
      "레포', '오늘 제일 많이 뜬 레포' 같은 날짜 특정 랭킹 질문에 사용. 증가량이 낮거나 음수인 게 " +
      "'성과가 낮다/안 좋다'는 뜻이다.",
    parameters: {
      type: "object",
      properties: {
        date: { type: "string", description: "YYYY-MM-DD 형식 날짜 (선택, 생략 시 어제)" },
        order: {
          type: "string",
          enum: ["worst", "best"],
          description: "worst=증가량 낮은 순(성과 안 좋음), best=증가량 높은 순(기본 worst)",
        },
        limit: { type: "number", description: "반환할 최대 개수 (기본 5, 최대 20)" },
      },
    },
    async execute(args) {
      const ranking = await getRepoGrowthRanking({
        date: typeof args.date === "string" ? args.date : undefined,
        order: args.order === "best" ? "best" : "worst",
        limit: typeof args.limit === "number" ? args.limit : undefined,
      });
      return { ranking };
    },
  },
];
