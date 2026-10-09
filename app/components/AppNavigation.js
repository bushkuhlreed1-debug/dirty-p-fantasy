"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/owners", label: "Owners", icon: "users" },
  { href: "/champions", label: "Champions", icon: "trophy" },
  { href: "/records", label: "Records", icon: "chart" },
  { href: "/goat", label: "GOAT Rankings", icon: "crown" },
  { href: "/rivalries", label: "Rivalries", icon: "swords" },
  { href: "/map", label: "Owner Map", icon: "map" },
];

const primaryLinks = links.slice(0, 3);
const moreLinks = links.slice(3);

function NavIcon({ name, size = 21 }) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
  };

  const paths = {
    home: (
      <>
        <path d="m3 10 9-7 9 7" />
        <path d="M5 9.5V21h14V9.5" />
        <path d="M9 21v-7h6v7" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3 20v-2a6 6 0 0 1 12 0v2" />
        <path d="M16 5.5a3 3 0 0 1 0 5.8" />
        <path d="M18 14a5 5 0 0 1 3 4.6V20" />
      </>
    ),
    trophy: (
      <>
        <path d="M7 3h10v8a5 5 0 0 1-10 0V3Z" />
        <path d="M7 5H4v3a4 4 0 0 0 4 4" />
        <path d="M17 5h3v3a4 4 0 0 1-4 4" />
        <path d="M12 16v4" />
        <path d="M8 21h8" />
      </>
    ),
    chart: (
      <>
        <path d="M4 20V4" />
        <path d="M4 20h16" />
        <path d="M8 16v-5" />
        <path d="M13 16V7" />
        <path d="M18 16V4" />
      </>
    ),
    crown: (
      <>
        <path d="m3 7 4.5 4L12 4l4.5 7L21 7l-2 12H5L3 7Z" />
        <path d="M5 22h14" />
      </>
    ),
    swords: (
      <>
        <path d="m4 4 16 16" />
        <path d="m20 4-6 6" />
        <path d="m4 20 6-6" />
        <path d="m3 8 5-5" />
        <path d="m16 21 5-5" />
      </>
    ),
    map: (
      <>
        <path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Z" />
        <path d="M9 3v15" />
        <path d="M15 6v15" />
      </>
    ),
    more: (
      <>
        <circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
        <circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none" />
      </>
    ),
    close: (
      <>
        <path d="M5 5 19 19" />
        <path d="M19 5 5 19" />
      </>
    ),
  };

  return <svg {...common}>{paths[name] || paths.more}</svg>;
}

export default function AppNavigation() {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (href) =>
    href === "/"
      ? pathname === "/"
      : pathname === href || pathname.startsWith(`${href}/`);

  const moreActive = moreLinks.some((link) =>
    isActive(link.href)
  );

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!moreOpen) return;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMoreOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [moreOpen]);

  return (
    <>
      {/* DESKTOP NAVIGATION */}

      <nav
        className="dp-desktop-nav"
        aria-label="Main navigation"
      >
        <div className="dp-desktop-inner">
          <div className="dp-desktop-links">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={
                  isActive(link.href) ? "page" : undefined
                }
                className={`dp-desktop-link ${
                  isActive(link.href) ? "is-active" : ""
                }`}
              >
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* MOBILE MORE MENU */}

      {moreOpen && (
        <>
          <button
            type="button"
            className="dp-menu-backdrop"
            aria-label="Close More menu"
            onClick={() => setMoreOpen(false)}
          />

          <div
            className="dp-menu"
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
          >
            <div className="dp-menu-header">
              <div>
                <span className="dp-menu-eyebrow">
                  DIRTY P FANTASY
                </span>
                <h2>Explore the league</h2>
              </div>

              <button
                type="button"
                className="dp-menu-close"
                onClick={() => setMoreOpen(false)}
                aria-label="Close menu"
              >
                <NavIcon name="close" size={19} />
              </button>
            </div>

            <div className="dp-menu-links">
              {moreLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`dp-menu-link ${
                    isActive(link.href) ? "is-active" : ""
                  }`}
                  onClick={() => setMoreOpen(false)}
                >
                  <span className="dp-menu-link-icon">
                    <NavIcon name={link.icon} size={20} />
                  </span>

                  <span className="dp-menu-link-label">
                    {link.label}
                  </span>

                  <span className="dp-menu-arrow">›</span>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}

      {/* MOBILE BOTTOM NAVIGATION */}

      <nav
        className="app-bottom-nav dp-mobile-nav"
        aria-label="Mobile navigation"
      >
        {primaryLinks.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`app-bottom-link dp-mobile-link ${
              isActive(link.href) ? "active" : ""
            }`}
            aria-current={
              isActive(link.href) ? "page" : undefined
            }
            onClick={() => setMoreOpen(false)}
          >
            <span className="dp-mobile-icon">
              <NavIcon name={link.icon} />
            </span>

            <span className="dp-mobile-label">
              {link.label}
            </span>
          </Link>
        ))}

        <button
          type="button"
          className={`app-bottom-link dp-mobile-link ${
            moreActive || moreOpen ? "active" : ""
          }`}
          aria-expanded={moreOpen}
          aria-haspopup="dialog"
          aria-label="More pages"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span className="dp-mobile-icon">
            <NavIcon name="more" />
          </span>

          <span className="dp-mobile-label">
            More
          </span>
        </button>
      </nav>

      <style jsx global>{`
        /* DESKTOP */

        .dp-desktop-nav {
          display: block;
          width: 100%;
          background: #10151c;
          border-bottom: 1px solid #29313d;
        }

        .dp-desktop-inner {
          max-width: 1200px;
          margin: 0 auto;
          padding: 0 24px;
        }

        .dp-desktop-links {
          display: flex;
          justify-content: center;
          align-items: center;
          gap: 8px;
        }

        .dp-desktop-link {
          position: relative;
          display: inline-flex;
          align-items: center;
          min-height: 54px;
          padding: 0 14px;
          color: #a6afbc;
          font-size: 13px;
          font-weight: 650;
          letter-spacing: 0.1px;
          text-decoration: none;
          white-space: nowrap;
          transition: color 0.18s ease;
        }

        .dp-desktop-link::after {
          content: "";
          position: absolute;
          height: 2px;
          bottom: 0;
          left: 14px;
          right: 14px;
          background: transparent;
          border-radius: 3px;
        }

        .dp-desktop-link:hover {
          color: #f0f2f5;
        }

        .dp-desktop-link.is-active {
          color: #f1c777;
        }

        .dp-desktop-link.is-active::after {
          background: #e4b861;
        }

        /* HIDE LEGACY NAVIGATION OVERLAYS */

        .app-nav-overlay,
        .app-more-menu,
        .dirtyp-more-backdrop,
        .dirtyp-more-sheet,
        .dirtyp-desktop-nav {
          display: none !important;
        }

        /* DESKTOP BOTTOM NAV HIDDEN */

        @media (min-width: 769px) {
          .app-bottom-nav.dp-mobile-nav {
            display: none !important;
          }
        }

        /* MOBILE */

        @media (max-width: 768px) {
          .dp-desktop-nav {
            display: none !important;
          }

          .app-bottom-nav.dp-mobile-nav {
            position: fixed !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100% !important;
            height: auto !important;
            min-height: 63px !important;
            padding: 5px 9px
              calc(6px + env(safe-area-inset-bottom, 0px))
              !important;
            display: grid !important;
            grid-template-columns: repeat(4, minmax(0, 1fr))
              !important;
            align-items: center !important;
            gap: 2px !important;
            background: #111720 !important;
            border: none !important;
            border-top: 1px solid #2a3340 !important;
            border-radius: 0 !important;
            box-shadow: 0 -5px 24px rgba(0, 0, 0, 0.24)
              !important;
            z-index: 10000 !important;
          }

          .app-bottom-nav.dp-mobile-nav
            .app-bottom-link.dp-mobile-link {
            display: flex !important;
            flex-direction: column !important;
            justify-content: center !important;
            align-items: center !important;
            gap: 4px !important;
            width: 100% !important;
            min-width: 0 !important;
            min-height: 49px !important;
            margin: 0 !important;
            padding: 4px 2px !important;
            background: transparent !important;
            border: 0 !important;
            border-radius: 10px !important;
            color: #8995a4 !important;
            text-decoration: none !important;
            font-family: inherit !important;
            cursor: pointer;
            box-shadow: none !important;
          }

          .dp-mobile-icon {
            display: flex !important;
            align-items: center;
            justify-content: center;
            height: 23px;
            color: inherit;
          }

          .dp-mobile-label {
            font-size: 10px;
            line-height: 13px;
            font-weight: 650;
            letter-spacing: 0.1px;
            color: inherit;
            white-space: nowrap;
          }

          .app-bottom-nav.dp-mobile-nav
            .app-bottom-link.dp-mobile-link.active {
            color: #efc475 !important;
            background: rgba(239, 196, 117, 0.07) !important;
          }

          .dp-menu-backdrop {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            border: none;
            background: rgba(0, 0, 0, 0.62);
            z-index: 10001;
          }

          .dp-menu {
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(
              76px + env(safe-area-inset-bottom, 0px)
            );
            max-height: min(65dvh, 490px);
            overflow-y: auto;
            background: #181f29;
            border: 1px solid #37414e;
            border-radius: 17px;
            box-shadow: 0 18px 55px rgba(0, 0, 0, 0.65);
            z-index: 10002;
          }

          .dp-menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 19px 18px 16px;
            border-bottom: 1px solid #2c3542;
          }

          .dp-menu-eyebrow {
            display: block;
            color: #e6b96a;
            font-size: 10px;
            font-weight: 750;
            letter-spacing: 1.5px;
            margin-bottom: 5px;
          }

          .dp-menu-header h2 {
            margin: 0;
            padding: 0;
            color: #f3f4f6;
            font-size: 19px;
            line-height: 1.25;
            font-weight: 750;
          }

          .dp-menu-close {
            display: flex;
            justify-content: center;
            align-items: center;
            flex-shrink: 0;
            width: 35px;
            height: 35px;
            padding: 0;
            border: 1px solid #3b4553;
            border-radius: 10px;
            background: #252e3a;
            color: #dfe4eb;
            cursor: pointer;
          }

          .dp-menu-links {
            display: flex;
            flex-direction: column;
            gap: 3px;
            padding: 9px;
          }

          .dp-menu-link {
            display: flex;
            align-items: center;
            gap: 13px;
            min-height: 53px;
            padding: 8px 12px;
            border-radius: 10px;
            color: #e7eaf0;
            text-decoration: none;
            transition: background 0.15s ease;
          }

          .dp-menu-link:hover,
          .dp-menu-link.is-active {
            background: #293342;
          }

          .dp-menu-link.is-active {
            color: #eec477;
          }

          .dp-menu-link-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            border-radius: 10px;
            background: #27313e;
            color: #d5b77e;
          }

          .dp-menu-link-label {
            flex: 1;
            font-size: 14px;
            font-weight: 650;
          }

          .dp-menu-arrow {
            color: #84909e;
            font-size: 25px;
            font-weight: 300;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .dp-desktop-link,
          .dp-menu-link {
            transition: none;
          }
        }
      `}</style>
    </>
  );
}
