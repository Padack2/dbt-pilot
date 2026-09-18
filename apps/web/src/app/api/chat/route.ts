import { NextResponse } from "next/server";
import { geminiClient } from "@/lib/llm/gemini";
import { buildChatContext } from "@/lib/chat-context";
import { checkChatRateLimit } from "@/lib/chat-rate-limit";
import { CHAT_TOOLS } from "@/lib/chat-tools";
import type { ChatMessage } from "@/lib/llm/types";

export const dynamic = "force-dynamic";

const MAX_MESSAGE_LENGTH = 1000;
const MAX_HISTORY = 10;

const SYSTEM_PROMPT = `당신은 dbt 기반 데이터 파이프라인 대시보드의 운영 보조 어시스턴트입니다.
아래 "현재 상태 스냅샷"과, 필요하면 제공된 도구(tools)를 호출해 얻은 정보만 근거로 답하세요.
스냅샷과 도구로도 답할 수 없는 내용은 모른다고 답하세요.
사용자가 "새로고침해줘", "전체 REFRESH 해줘"처럼 명시적으로 요청했을 때만
refresh_materialized_views 도구를 호출하세요 — 질문에 답하는 과정에서 스스로 판단해서
REFRESH하지 마세요. 그 외 SQL 실행이나 데이터 삭제/수정 같은 동작은 지원하지 않으니, 그런
요청이 오면 못 한다고 안내하세요. 한국어로 간결하게 답하세요.`;

function isValidMessage(value: unknown): value is ChatMessage {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    (v.role === "user" || v.role === "assistant") &&
    typeof v.content === "string" &&
    v.content.length > 0 &&
    v.content.length <= MAX_MESSAGE_LENGTH
  );
}

export async function POST(request: Request) {
  if (!checkChatRateLimit()) {
    return NextResponse.json(
      { error: "요청이 너무 많습니다. 잠시 후 다시 시도해주세요." },
      { status: 429 }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const messages = (body as { messages?: unknown })?.messages;
  if (!Array.isArray(messages) || messages.length === 0 || !messages.every(isValidMessage)) {
    return NextResponse.json({ error: "잘못된 요청입니다." }, { status: 400 });
  }

  const trimmed = messages.slice(-MAX_HISTORY);

  try {
    const context = await buildChatContext();
    const reply = await geminiClient.chat({
      systemPrompt: `${SYSTEM_PROMPT}\n\n## 현재 상태 스냅샷\n${context}`,
      messages: trimmed,
      tools: CHAT_TOOLS,
    });
    return NextResponse.json({ reply });
  } catch (err) {
    console.error("chat api failed", err);
    return NextResponse.json({ error: "챗봇 응답 생성에 실패했습니다." }, { status: 500 });
  }
}
