import type { LlmClient, ToolDefinition } from "./types";

// 모델 교체가 필요하면 이 상수만 바꾸면 됨 (예: 신규 Flash 세대 출시 시).
const GEMINI_MODEL = "gemini-3.8-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

// 모델이 도구를 계속 호출하며 끝나지 않는 경우를 막는 안전장치.
const MAX_TOOL_ROUNDS = 4;

// Gemini generateContent의 실제 파트 구조 — text/functionCall/functionResponse/thoughtSignature가
// 하나의 part 객체에 함께(선택적으로) 실릴 수 있어 엄격한 discriminated union 대신 전부 optional로 모델링.
type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args?: Record<string, unknown>; id?: string };
  functionResponse?: { name: string; id?: string; response: { result: unknown } };
  thoughtSignature?: string;
};

type GeminiContent = { role: "user" | "model"; parts: GeminiPart[] };

function toGeminiTools(tools: ToolDefinition[] | undefined) {
  if (!tools || tools.length === 0) return undefined;
  return [
    {
      functionDeclarations: tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      })),
    },
  ];
}

async function callGemini(apiKey: string, body: Record<string, unknown>) {
  const res = await fetch(GEMINI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API 오류 (${res.status}): ${errText.slice(0, 300)}`);
  }

  return res.json();
}

export const geminiClient: LlmClient = {
  async chat({ systemPrompt, messages, tools }) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY가 설정되지 않았습니다.");
    }

    const toolByName = new Map((tools ?? []).map((t) => [t.name, t]));

    const contents: GeminiContent[] = messages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const requestBase = {
      systemInstruction: { parts: [{ text: systemPrompt }] },
      // thinkingBudget: 0 — 주어진 컨텍스트/도구 결과를 요약·보고하는 질의응답이라 깊은 추론이
      // 불필요함. 꺼두지 않으면 "사고" 토큰이 maxOutputTokens를 갉아먹다가 답변 텍스트가
      // 통째로 빈 채로 잘리는 경우가 실제로 발생함(직접 확인).
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 1024,
        thinkingConfig: { thinkingBudget: 0 },
      },
      tools: toGeminiTools(tools),
    };

    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const data = await callGemini(apiKey, { contents, ...requestBase });
      const parts: GeminiPart[] = data.candidates?.[0]?.content?.parts ?? [];
      const functionCallParts = parts.filter((p) => p.functionCall);

      if (functionCallParts.length === 0) {
        const text = parts.find((p) => typeof p.text === "string")?.text;
        if (typeof text !== "string") {
          throw new Error("Gemini API 응답에서 텍스트를 찾지 못했습니다.");
        }
        return text;
      }

      // 모델의 함수 호출 턴을 그대로 히스토리에 추가 — thoughtSignature를 누락하면
      // 다음 요청이 "thought_signature가 없다"며 거부됨(직접 확인).
      contents.push({ role: "model", parts: functionCallParts });

      const responseParts: GeminiPart[] = [];
      for (const part of functionCallParts) {
        const call = part.functionCall!;
        const tool = toolByName.get(call.name);
        let result: unknown;
        if (!tool) {
          result = { error: `알 수 없는 함수: ${call.name}` };
        } else {
          try {
            result = await tool.execute(call.args ?? {});
          } catch (err) {
            result = { error: err instanceof Error ? err.message : "도구 실행 실패" };
          }
        }
        responseParts.push({ functionResponse: { name: call.name, id: call.id, response: { result } } });
      }
      contents.push({ role: "user", parts: responseParts });
    }

    throw new Error("도구 호출이 너무 많아 응답을 생성하지 못했습니다.");
  },
};
