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
스냅샷과 도구로도 답할 수 없는 내용은 모른다고 답하세요. 이 버전은 조회(읽기)만 지원합니다 —
REFRESH 실행이나 SQL 실행, 데이터 변경 같은 어떤 쓰기 동작도 직접 수행할 수 없으니, 그런 요청이
오면 "이 챗봇은 조회만 할 수 있고, REFRESH는 /models 페이지의 버튼을 이용해달라"고 안내하세요.
한국어로 간결하게 답하세요.`;

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
