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
        <span className="navbar-brand">dbt Pilot</span>
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
