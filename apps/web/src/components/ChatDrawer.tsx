"use client";

import { useState } from "react";
import { ChatPanel } from "./ChatPanel";

export function ChatDrawer() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {/* 열려있을 땐 드로어 자체의 닫기 버튼과 위치가 겹치므로 숨김 */}
      {!open && (
        <button
          type="button"
          className="chat-fab"
          onClick={() => setOpen(true)}
          aria-label="운영 어시스턴트 열기"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 4h16v12H7l-3 3V4z"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          </svg>
        </button>
      )}

      {/* 열림/닫힘과 무관하게 항상 마운트 — 대화 내역이 패널을 닫아도 유지됨.
          너비를 0↔380px로 트랜지션해서 본문을 옆으로 밀어내는 방식(오버레이 아님). */}
      <div className={`chat-drawer-wrapper ${open ? "open" : ""}`} aria-hidden={!open}>
        <aside className="chat-drawer">
          <div className="chat-drawer-header">
            <div>
              <h2>운영 어시스턴트</h2>
              <p className="chat-drawer-subtitle">파이프라인·모델 상태를 자연어로 질문, REFRESH도 요청 가능</p>
            </div>
            <button
              type="button"
              className="chat-drawer-close"
              onClick={() => setOpen(false)}
              aria-label="닫기"
            >
              ×
            </button>
          </div>
          <ChatPanel />
        </aside>
      </div>
    </>
  );
}
