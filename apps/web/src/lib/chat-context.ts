import { readFileSync } from "fs";
import path from "path";
import { getRecentPipelineRuns, summarize } from "./pipeline-runs";
import { getLatestMvRefreshStatus } from "./mv-refresh";
import { getModelSizes } from "./model-sizes";
import { getTopicRanking, getLanguageRanking } from "./trending-rankings";
import { getLanguageScoreRanking, getRepoScoreRanking } from "./trending-score";

// model-graph.ts와 동일한 경로 규칙 — 모노레포 루트의 dbt 모델 SQL을 런타임에 읽는다.
const MODELS_DIR = path.join(process.cwd(), "..", "..", "pipeline", "dbt", "models");

function findModelSql(modelName: string): string | null {
  for (const folder of ["staging", "marts"]) {
    try {
      return readFileSync(path.join(MODELS_DIR, folder, `${modelName}.sql`), "utf-8");
    } catch {
      continue;
    }
  }
  return null;
}

// dbt의 unique_id 형식: model.<project>.<model_name>
// extract_failure.py가 pipeline_runs.error_message에 "{unique_id}: {message}"로 남긴다.
function extractFailedModelName(errorMessage: string): string | null {
  const match = errorMessage.match(/^model\.\w+\.(\w+):/);
  return match ? match[1] : null;
}

export async function buildChatContext(): Promise<string> {
  const [runs, mvStatuses, modelSizes, topicRanking, languageRanking, languageScoreRanking, repoScoreRanking] =
    await Promise.all([
      getRecentPipelineRuns(10),
      getLatestMvRefreshStatus(),
      getModelSizes(),
      getTopicRanking(10),
      getLanguageRanking(5),
      getLanguageScoreRanking(5),
      getRepoScoreRanking(5),
    ]);
  const stats = summarize(runs);

  const lines: string[] = [];

  lines.push("## 파이프라인 실행 현황 (최근 10건 기준)");
  lines.push(
    `- 최근 실행: ${stats.lastRun ? `${stats.lastRun.startedAt} (${stats.lastRun.status})` : "기록 없음"}`
  );
  lines.push(`- 성공률: ${stats.successRate !== null ? `${stats.successRate.toFixed(0)}%` : "-"}`);
  lines.push(
    `- 평균 소요 시간: ${stats.avgDurationSeconds !== null ? `${stats.avgDurationSeconds.toFixed(0)}초` : "-"}`
  );

  const lastFailedRun = runs.find((run) => run.status === "failure");
  if (lastFailedRun) {
    lines.push(
      `- 가장 최근 실패: ${lastFailedRun.startedAt}, 에러 메시지: "${lastFailedRun.errorMessage ?? "(없음)"}"`
    );

    const failedModel = lastFailedRun.errorMessage
      ? extractFailedModelName(lastFailedRun.errorMessage)
      : null;
    const sql = failedModel ? findModelSql(failedModel) : null;
    if (failedModel && sql) {
      lines.push(`\n## 실패한 모델(${failedModel})의 현재 SQL 정의`);
      lines.push("```sql");
      lines.push(sql.trim());
      lines.push("```");
    }
  }

  lines.push("\n## MV 리프레시 현황");
  if (mvStatuses.length === 0) {
    lines.push("- 기록 없음");
  }
  for (const status of mvStatuses) {
    lines.push(`- ${status.mvName}: 마지막 시작 ${status.startedAt}, 완료 ${status.finishedAt}`);
  }

  lines.push("\n## 모델 용량 / Row 수");
  for (const size of modelSizes) {
    lines.push(
      `- ${size.tableName}: ${size.rowCount.toLocaleString("ko-KR")} rows, ${size.totalBytes.toLocaleString("ko-KR")} bytes`
    );
  }

  lines.push("\n## 급상승 레포 점수 랭킹 Top 5 (Star·Fork·성장세 가중 종합 점수)");
  if (repoScoreRanking.length === 0) {
    lines.push("- 데이터 없음");
  }
  for (const [i, repo] of repoScoreRanking.entries()) {
    lines.push(
      `- ${i + 1}위 ${repo.repoName} (${repo.language ?? "언어 미상"}): 점수 ${Math.round(repo.score).toLocaleString("ko-KR")}, Star ${repo.stars}, Fork ${repo.forks}`
    );
  }

  lines.push("\n## 언어별 종합 점수 Top 5 (급상승 레포 기준, 지금 가장 핫한 기술 스택 지표)");
  if (languageScoreRanking.length === 0) {
    lines.push("- 데이터 없음");
  }
  for (const [i, lang] of languageScoreRanking.entries()) {
    lines.push(
      `- ${i + 1}위 ${lang.language}: 종합 점수 ${Math.round(lang.totalScore).toLocaleString("ko-KR")}, 레포 ${lang.repoCount}개`
    );
  }

  lines.push("\n## 언어별 레포 수 Top 5");
  for (const lang of languageRanking) {
    lines.push(`- ${lang.language}: ${lang.repoCount}개 레포`);
  }

  lines.push("\n## 인기 토픽 Top 10");
  for (const topic of topicRanking) {
    lines.push(`- ${topic.topic}: ${topic.repoCount}개 레포에서 언급`);
  }

  return lines.join("\n");
}
