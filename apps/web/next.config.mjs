/** @type {import('next').NextConfig} */
const nextConfig = {
  // /models 페이지(lib/model-graph.ts)와 /api/chat(lib/chat-context.ts)가 배포 트리 밖
  // (../../pipeline/dbt/models)의 dbt 모델 SQL을 런타임에 직접 읽는다. Next.js의 서버리스
  // 번들 트레이싱은 import로 연결되지 않은 파일은 자동 포함하지 않으므로 명시해야 한다.
  outputFileTracingIncludes: {
    "/models": ["../../pipeline/dbt/models/**/*.sql"],
    "/api/chat": ["../../pipeline/dbt/models/**/*.sql"],
  },
};

export default nextConfig;
