export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ToolParameterSchema = {
  type: "object";
  properties: Record<
    string,
    { type: string; description?: string; enum?: string[]; items?: { type: string } }
  >;
  required?: string[];
};

// LLM이 이름/인자로만 호출하고, 실제 실행(execute)은 서버가 검증된 코드로 수행한다 —
// LLM이 SQL이나 임의 코드를 직접 만들어 실행하는 구조가 아니다 (ADR-009/010 참고).
export type ToolDefinition = {
  name: string;
  description: string;
  parameters: ToolParameterSchema;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
};

// LLM 벤더를 교체하더라도 API 라우트/챗봇 UI는 이 인터페이스만 알면 되도록 분리.
export interface LlmClient {
  chat(params: {
    systemPrompt: string;
    messages: ChatMessage[];
    tools?: ToolDefinition[];
  }): Promise<string>;
}
