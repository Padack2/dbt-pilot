// 순수 데이터만 담는 파일 — DB(pg)나 fs 등 서버 전용 모듈을 import하지 않는다.
// 클라이언트 컴포넌트(RefreshProgress 등)에서도 그대로 import할 수 있어야 하기 때문.

// dbt run-operation refresh_materialized_views(pipeline/dbt/macros)와 동일한 순서.
// mv_trending_score_by_language가 mv_trending_repo_score를 참조하므로 그 뒤에 와야 함.
export const REFRESHABLE_MVS = [
  "mv_daily_trend",
  "mv_repo_ranking",
  "mv_event_type_dist",
  "mv_trending_daily_growth",
  "mv_trending_repo_score",
  "mv_trending_score_by_language",
] as const;

export type RefreshableMv = (typeof REFRESHABLE_MVS)[number];

export const MV_LABELS: Record<string, string> = {
  mv_daily_trend: "일별 트렌드",
  mv_repo_ranking: "리포 랭킹",
  mv_event_type_dist: "이벤트 타입 분포",
  mv_trending_daily_growth: "급상승 레포 일별 성장",
  mv_trending_repo_score: "급상승 레포 점수",
  mv_trending_score_by_language: "언어별 점수 집계",
};

// 인증 없는 공개 페이지에서 남용으로 인한 DB 부하를 막기 위한 최소 재요청 간격.
// 새 데이터는 1시간마다 파이프라인이 적재 + REFRESH까지 하므로 그보다 잦은 수동 REFRESH는
// 같은 결과를 다시 계산할 뿐이고 Neon 컴퓨트 쿼터만 소모한다(ADR-015).
export const REFRESH_COOLDOWN_MS = 60 * 60 * 1000;
