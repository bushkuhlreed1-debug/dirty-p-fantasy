
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

const mainLinks = [
  { href: "/", label: "Home", icon: "⌂" },
  { href: "/owners", label: "Owners", icon: "♟" },
  { href: "/champions", label: "Champions", icon: "★" },
];

const moreLinks = [
  { href: "/records", label: "Records" },
  { href: "/goat", label: "GOAT Rankings" },
  { href: "/rivalries", label: "Rivalries" },
  { href: "/map", label: "Owner Map" },
];

export default function AppNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href) =>
    href === "/"
      ? pathname === "/"
      : pathname === href ||
        pathname.startsWith(`${href}/`);

  const moreActive = moreLinks.some((link) =>
    isActive(link.href)
  );

  return (
    <>
      {moreOpen && (
        <div
          className="app-nav-overlay"
          onClick={() => setMoreOpen(false)}
        />
      )}

      {moreOpen && (
        <div className="app-more-menu">
          <div className="app-more-header">
            <strong>MORE FROM DIRTY P</strong>

            <button
              type="button"
              onClick={() => setMoreOpen(false)}
            >
              ✕
            </button>
          </div>

          <div className="app-more-links">
            {moreLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={
                  isActive(link.href) ? "active" : ""
                }
                onClick={() => setMoreOpen(false)}
              >
                {link.label}
                <span>→</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav
        className="app-bottom-nav"
        aria-label="Main navigation"
      >
        {mainLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`app-bottom-link ${
              isActive(link.href) ? "active" : ""
            }`}
            onClick={() => setMoreOpen(false)}
          >
            <span className="app-bottom-icon">
              {link.icon}
            </span>
            <span>{link.label}</span>
          </Link>
        ))}

        <button
          type="button"
          className={`app-bottom-link ${
            moreActive || moreOpen ? "active" : ""
          }`}
          onClick={() => setMoreOpen((open) => !open)}
          aria-expanded={moreOpen}
          aria-label="More pages"
        >
          <span className="app-bottom-icon">☰</span>
          <span>More</span>
        </button>
      </nav>
    </>
  );
}
