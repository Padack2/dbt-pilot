import { Pool } from "pg";

// Next.js dev 서버의 모듈 핫 리로드마다 Pool이 새로 생성되어
// Neon 커넥션이 누적되는 것을 방지하기 위해 globalThis에 캐시한다.
declare global {
  var _pgReadonlyPool: Pool | undefined;
  var _pgBatchPool: Pool | undefined;
}

export const readonlyPool =
  global._pgReadonlyPool ??
  new Pool({ connectionString: process.env.DATABASE_URL_READONLY });

// 쓰기 롤 — 수동 REFRESH 트리거 Server Action 전용, 그 외 조회 용도로는 readonlyPool을 쓸 것
export const batchPool =
  global._pgBatchPool ??
  new Pool({ connectionString: process.env.DATABASE_URL_BATCH });

if (process.env.NODE_ENV !== "production") {
  global._pgReadonlyPool = readonlyPool;
  global._pgBatchPool = batchPool;
}
