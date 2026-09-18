// Gemini 무료 티어는 분당 15회 한도. 인증 없는 공개 페이지라 남용 시 이 한도를
// 금방 소진할 수 있어, 그보다 낮은 전역 한도로 1차 방어선을 둔다.
// ADR-006/008과 동일하게 프로세스 인메모리 — 서버리스 다중 인스턴스에서는 인스턴스별로
// 별도 카운트되어 완전한 보장은 아니지만, 이 규모에서는 충분한 방어.
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 10;

declare global {
  var _chatRequestTimestamps: number[] | undefined;
}

export function checkChatRateLimit(): boolean {
  const now = Date.now();
  const timestamps = (global._chatRequestTimestamps ?? []).filter((t) => now - t < WINDOW_MS);

  if (timestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    global._chatRequestTimestamps = timestamps;
    return false;
  }

  timestamps.push(now);
  global._chatRequestTimestamps = timestamps;
  return true;
}
