"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Home", icon: "pear" },
  { href: "/owners", label: "Owners", icon: "users" },
  { href: "/champions", label: "Champions", icon: "trophy" },
  { href: "/notifications", label: "Notifications", mobileLabel: "Alerts", icon: "bell" },
  { href: "/records", label: "Records", icon: "chart" },
  { href: "/goat", label: "GOAT Rankings", icon: "crown" },
  { href: "/rivalry-week", label: "Rivalry Week", icon: "swords" },
  { href: "/map", label: "Owner Map", icon: "map" },
];

const primaryLinks = links.slice(0, 4);
const moreLinks = links.slice(4);

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
    pear: (
      <>
        <path d="M12 7c-4.5 0-3.5 4-6.5 7.1C2 18 5.6 22 12 22s10-4 6.5-7.9C15.5 11 16.5 7 12 7Z" />
        <path d="M12 7c0-2 1-4 2.5-5m-2 4c1-3.5 4-4.5 7-3.5-1 3-4 4-7 3.5Z" />
        <path d="M12 12v7m-2-5.5h4m-4 3.5h4" />
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

    bell: (
      <>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 8-3 8h18s-3-1-3-8Z" />
        <path d="M10 21h4" />
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
                {link.icon === "pear" && <NavIcon name="pear" size={19} />}
                {link.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* TABLET NAVIGATION: all destinations visible without a phone drawer. */}
      <nav className="dp-tablet-nav" aria-label="Tablet navigation">
        <div className="dp-tablet-nav-inner">
          <div className="dp-tablet-brand-row">
            <Link href="/" className="dp-tablet-brand" onClick={() => setMoreOpen(false)}>
              <span className="dp-tablet-mark" aria-hidden="true"><NavIcon name="pear" size={20} /></span>
              <span><strong>DIRTY P</strong><small>FANTASY FOOTBALL</small></span>
            </Link>
            <span className="dp-tablet-nav-caption">THE LEAGUE ARCHIVE</span>
          </div>
          <div className="dp-tablet-links">
            {links.map(link => (
              <Link key={link.href} href={link.href}
                aria-current={isActive(link.href) ? "page" : undefined}
                className={`dp-tablet-link ${isActive(link.href) ? "is-active" : ""}`}
                onClick={() => setMoreOpen(false)}>
                <NavIcon name={link.icon} size={18} />
                <span>{link.mobileLabel || link.label}</span>
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
              {link.mobileLabel || link.label}
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
        :root {
          --dp-nav-height: 55px;
          --dp-nav-safe-bottom: env(safe-area-inset-bottom, 0px);
          --dp-nav-clearance: calc(var(--dp-nav-height) + var(--dp-nav-safe-bottom));
          scroll-padding-bottom: var(--dp-nav-clearance);
        }

        html body {
          padding-bottom: var(--dp-nav-clearance);
        }

        .dp-desktop-nav,
        .dp-tablet-nav,
        .app-bottom-nav.dp-mobile-nav {
          position: fixed;
          inset: auto 0 0;
          padding-bottom: var(--dp-nav-safe-bottom);
          z-index: 10000;
        }

        /* DESKTOP */

        .dp-desktop-nav {
          display: block;
          width: 100%;
          background: var(--dp-white);
          border-top: 1px solid var(--dp-pear-line);
          box-shadow: 0 -5px 20px rgba(28, 58, 34, 0.09);
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
          min-height: calc(var(--dp-nav-height) - 1px);
          gap: 6px;
          padding: 0 14px;
          color: var(--dp-muted);
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
          color: var(--dp-ink);
        }

        .dp-desktop-link.is-active {
          color: var(--dp-pear-ink);
          background: var(--dp-pear-wash);
        }

        .dp-desktop-link.is-active::after {
          background: var(--dp-pear-ink);
        }

        /* HIDE LEGACY NAVIGATION OVERLAYS */

        .app-nav-overlay,
        .app-more-menu,
        .dirtyp-more-backdrop,
        .dirtyp-more-sheet,
        .dirtyp-desktop-nav {
          display: none !important;
        }

        .app-bottom-nav.dp-mobile-nav {
          display: none;
        }

        /* MOBILE */

        @media (width < 700px) {
          :root { --dp-nav-height: 63px; }
          .dp-desktop-nav {
            display: none !important;
          }

          .app-bottom-nav.dp-mobile-nav {
            width: 100% !important;
            min-height: var(--dp-nav-clearance);
            padding: 5px max(9px, env(safe-area-inset-right, 0px))
              calc(6px + var(--dp-nav-safe-bottom))
              max(9px, env(safe-area-inset-left, 0px)) !important;
            display: grid !important;
            grid-template-columns: repeat(5, minmax(0, 1fr))
              !important;
            align-items: center !important;
            gap: 2px !important;
            background: var(--dp-white) !important;
            border: none !important;
            border-top: 1px solid var(--dp-pear-line) !important;
            border-radius: 0 !important;
            box-shadow: 0 -5px 20px rgba(28, 58, 34, 0.09) !important;
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
            color: var(--dp-muted) !important;
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
            color: var(--dp-pear-ink) !important;
            background: var(--dp-pear-wash) !important;
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
            bottom: calc(var(--dp-nav-clearance) + 12px);
            max-height: min(65dvh, 490px);
            overflow-y: auto;
            background: var(--dp-soft);
            border: 1px solid var(--dp-deep-line);
            border-radius: 17px;
            box-shadow: 0 18px 55px rgba(31, 49, 72, 0.16);
            z-index: 10002;
          }

          .dp-menu-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 19px 18px 16px;
            border-bottom: 1px solid var(--dp-line);
          }

          .dp-menu-eyebrow {
            display: block;
            color: var(--dp-gold);
            font-size: 10px;
            font-weight: 750;
            letter-spacing: 1.5px;
            margin-bottom: 5px;
          }

          .dp-menu-header h2 {
            margin: 0;
            padding: 0;
            color: var(--dp-ink);
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
            border: 1px solid var(--dp-deep-line);
            border-radius: 10px;
            background: var(--dp-raised);
            color: var(--dp-ink);
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
            color: var(--dp-ink);
            text-decoration: none;
            transition: background 0.15s ease;
          }

          .dp-menu-link:hover,
          .dp-menu-link.is-active {
            background: var(--dp-strong);
          }

          .dp-menu-link.is-active {
            color: var(--dp-gold);
          }

          .dp-menu-link-icon {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 36px;
            height: 36px;
            flex-shrink: 0;
            border-radius: 10px;
            background: var(--dp-raised);
            color: var(--dp-gold);
          }

          .dp-menu-link-label {
            flex: 1;
            font-size: 14px;
            font-weight: 650;
          }

          .dp-menu-arrow {
            color: var(--dp-muted);
            font-size: 25px;
            font-weight: 300;
          }
        }

        /* TABLET: the full navigation is always accessible, in two
           touch-sized rows for portrait and one row for landscape. */
        .dp-tablet-nav { display: none; }
        @media (700px <= width < 1200px) {
          :root { --dp-nav-height: 160px; }
          .dp-desktop-nav { display: none !important; }
          .app-bottom-nav.dp-mobile-nav { display: none !important; }
          .dp-tablet-nav {
            display: block !important;
            background: linear-gradient(125deg, var(--dp-white), var(--dp-pear-wash));
            border-top: 1px solid var(--dp-pear-line);
            box-shadow: 0 -5px 17px rgba(28, 58, 34, 0.09);
          }
          .dp-tablet-nav-inner {
            max-width: 1160px;
            margin: 0 auto;
            padding: 9px 25px 11px;
          }
          .dp-tablet-brand-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 16px;
            padding: 0 3px 10px;
          }
          .dp-tablet-brand {
            display: flex;
            align-items: center;
            gap: 10px;
            min-width: 0;
            color: var(--dp-ink);
            text-decoration: none;
          }
          .dp-tablet-mark {
            width: 33px;
            height: 33px;
            flex-shrink: 0;
            display: grid;
            place-items: center;
            border: 1px solid var(--dp-gold-line);
            border-radius: 8px;
            background: var(--dp-raised);
            color: var(--dp-gold);
            font-size: 12px;
            font-weight: 950;
            letter-spacing: -.5px;
          }
          .dp-tablet-brand strong {
            display: block;
            font-size: 13px;
            font-weight: 900;
            letter-spacing: 1.4px;
          }
          .dp-tablet-brand small {
            display: block;
            color: var(--dp-muted);
            font-size: 9px;
            letter-spacing: 1px;
            font-weight: 750;
          }
          .dp-tablet-nav-caption {
            color: var(--dp-gold);
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 1.4px;
            white-space: nowrap;
          }
          .dp-tablet-links {
            display: grid;
            grid-template-columns: repeat(4,minmax(0,1fr));
            gap: 6px;
          }
          .dp-tablet-link {
            min-width: 0;
            min-height: 45px;
            padding: 10px 6px;
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 7px;
            border: 1px solid var(--dp-deep-line);
            border-radius: 9px;
            background: rgba(255,255,255,.035);
            color: var(--dp-muted);
            text-decoration: none;
            font-size: 11px;
            font-weight: 750;
            line-height: 1.2;
            text-align: center;
            white-space: nowrap;
          }
          .dp-tablet-link svg { flex-shrink: 0; }
          .dp-tablet-link:hover,
          .dp-tablet-link:focus-visible {
            color: var(--dp-ink);
            background: var(--dp-strong);
            border-color: var(--dp-gold-line);
          }
          .dp-tablet-link.is-active {
            color: var(--dp-pear-ink);
            background: var(--dp-pear-wash);
            border-color: var(--dp-pear-line);
          }
          .dp-tablet-link:focus-visible { outline: 2px solid var(--dp-gold-line); outline-offset: 2px; }
        }
        @media (940px <= width < 1200px) {
          :root { --dp-nav-height: 109px; }
          .dp-tablet-links { grid-template-columns: repeat(8,minmax(0,1fr)); }
          .dp-tablet-link { font-size: 10px; gap: 4px; }
          .dp-tablet-link svg { width: 16px; height: 16px; }
        }

        @media (1200px <= width <= 1400px) and (hover: none) and (pointer: coarse) {
          :root { --dp-nav-height: 59px; }
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
