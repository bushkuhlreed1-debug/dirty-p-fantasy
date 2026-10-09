"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

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

const allLinks = [...mainLinks, ...moreLinks];

export default function AppNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const moreActive = moreLinks.some((link) => isActive(link.href));

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    function handleEscape(event) {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    }

    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("keydown", handleEscape);
    };
  }, [moreOpen]);

  return (
    <>
      {/* DESKTOP NAVIGATION */}

      <nav
        className="dirtyp-desktop-nav"
        aria-label="Desktop navigation"
      >
        <div className="dirtyp-desktop-nav-inner">
          {allLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`dirtyp-desktop-link ${
                isActive(link.href) ? "active" : ""
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* MOBILE MORE MENU */}

      {moreOpen && (
        <>
          <div
            className="dirtyp-more-backdrop"
            onClick={() => setMoreOpen(false)}
            aria-hidden="true"
          />

          <div
            className="dirtyp-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
          >
            <div className="dirtyp-more-heading">
              <strong>MORE FROM DIRTY P</strong>

              <button
                type="button"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                ✕
              </button>
            </div>

            <div className="dirtyp-more-list">
              {moreLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={isActive(link.href) ? "active" : ""}
                  onClick={() => setMoreOpen(false)}
                >
                  <span>{link.label}</span>
                  <span aria-hidden="true">→</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MOBILE BOTTOM NAVIGATION */}

      <nav
        className="app-bottom-nav"
        aria-label="Mobile navigation"
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
          aria-haspopup="dialog"
          aria-label="More pages"
        >
          <span className="app-bottom-icon">☰</span>
          <span>More</span>
        </button>
      </nav>

      <style jsx global>{`
        .dirtyp-desktop-nav {
          display: block;
          width: 100%;
          background: #11151b;
          border-bottom: 1px solid #29303a;
        }

        .dirtyp-desktop-nav-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-wrap: wrap;
          gap: 4px;
        }

        .dirtyp-desktop-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 15px 17px;
          color: #aeb5bf;
          font-size: 13px;
          font-weight: 700;
          text-decoration: none;
          white-space: nowrap;
          border-bottom: 3px solid transparent;
          transition: color 0.2s ease, background 0.2s ease;
        }

        .dirtyp-desktop-link:hover {
          color: #fff;
          background: #1b222c;
        }

        .dirtyp-desktop-link.active {
          color: #e9bd67;
          border-bottom-color: #e9bd67;
        }

        .dirtyp-more-backdrop {
          display: none;
        }

        .dirtyp-more-sheet {
          display: none;
        }

        @media (min-width: 769px) {
          .app-bottom-nav {
            display: none !important;
          }
        }

        @media (max-width: 768px) {
          .dirtyp-desktop-nav {
            display: none !important;
          }

          .dirtyp-more-backdrop {
            display: block;
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            z-index: 9997;
          }

          .dirtyp-more-sheet {
            display: block;
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(84px + env(safe-area-inset-bottom, 0px));
            max-height: 70dvh;
            overflow-y: auto;
            background: #151b24;
            border: 1px solid #323b49;
            border-radius: 18px;
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.6);
            z-index: 9999;
          }

          .dirtyp-more-heading {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 18px 20px;
            border-bottom: 1px solid #323b49;
          }

          .dirtyp-more-heading strong {
            color: #e9bd67;
            font-size: 12px;
            letter-spacing: 1px;
          }

          .dirtyp-more-heading button {
            border: none;
            background: transparent;
            color: #fff;
            font-size: 22px;
            cursor: pointer;
          }

          .dirtyp-more-list {
            padding: 8px;
          }

          .dirtyp-more-list a {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 17px 14px;
            color: #e9edf3;
            text-decoration: none;
            font-size: 15px;
            font-weight: 600;
            border-radius: 10px;
          }

          .dirtyp-more-list a:hover,
          .dirtyp-more-list a.active {
            background: #252d38;
            color: #e9bd67;
          }

          .app-bottom-nav {
            display: flex !important;
            z-index: 9998 !important;
          }
        }
      `}</style>
    </>
  );
}
