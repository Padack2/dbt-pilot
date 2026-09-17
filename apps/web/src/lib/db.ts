import { Pool } from "pg";

// Next.js dev 서버의 모듈 핫 리로드마다 Pool이 새로 생성되어
// Neon 커넥션이 누적되는 것을 방지하기 위해 globalThis에 캐시한다.
declare global {
  var _pgReadonlyPool: Pool | undefined;
}

export const readonlyPool =
  global._pgReadonlyPool ??
  new Pool({ connectionString: process.env.DATABASE_URL_READONLY });

if (process.env.NODE_ENV !== "production") {
  global._pgReadonlyPool = readonlyPool;
}
