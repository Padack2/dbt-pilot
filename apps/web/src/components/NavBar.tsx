"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_ITEMS = [
  { href: "/", label: "분석 결과" },
  { href: "/pipeline", label: "데이터 수집 파이프라인 현황" },
  { href: "/models", label: "증분 모델 REFRESH 현황" },
  { href: "/explorer", label: "데이터 조회" },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <span className="navbar-brand">
          <svg
            className="navbar-mark"
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <circle cx="4" cy="8" r="2.5" fill="currentColor" />
            <circle cx="12" cy="3.5" r="2" fill="currentColor" opacity="0.55" />
            <circle cx="12" cy="12.5" r="2" fill="currentColor" opacity="0.55" />
            <path d="M6.2 7 10.3 4" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
            <path d="M6.2 9 10.3 12" stroke="currentColor" strokeWidth="1.2" opacity="0.55" />
          </svg>
          dbt Pilot
        </span>
        <div className="navbar-links">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`navbar-link ${pathname === item.href ? "active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}
