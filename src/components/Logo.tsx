import { useId } from "react";

/**
 * Het Homebase-logo: een h en een b met een huisje als poort ertussen.
 * Gebruikt `currentColor`, zodat het in licht en donker thema meekleurt.
 * `animated`: de opbouw-animatie (op het inlogscherm). Stopt bij "minder beweging".
 * Origineel bestand: public/homebase-logo-animated.svg
 */
export function HomebaseMark({ size = 28, animated = false, title = "Homebase" }: { size?: number; animated?: boolean; title?: string }) {
  const mask = `hb-cut-${useId().replace(/:/g, "")}`;
  const a = (cls: string) => (animated ? `hb-p hb-${cls}` : undefined);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="40 0 800 800"
      width={size}
      height={size}
      className="hb-mark"
      {...(title ? { role: "img", "aria-label": title } : { "aria-hidden": true })}
    >
      {title && <title>{title}</title>}
      <defs>
        <mask id={mask} maskUnits="userSpaceOnUse" x="0" y="0" width="880" height="800">
          <rect x="0" y="0" width="880" height="800" fill="#fff" />
          <g className={a("house")}>
            <path d="M290 440 L418 556 L398 578 L360 544 V780 H220 V544 L182 578 L162 556 Z" fill="#000" />
          </g>
          <rect className={a("chimney")} x="330" y="452" width="32" height="60" fill="#000" />
          <path d="M500 480 C530 465 560 460 590 460 C640 460 660 500 660 550 C660 610 635 645 590 645 C560 645 530 640 500 630 Z" fill="#000" />
        </mask>
      </defs>
      <g mask={`url(#${mask})`} fill="currentColor">
        <rect className={a("stem-l")} x="80" y="20" width="140" height="760" />
        <path className={a("bridge")} d="M200 340 C250 290 310 262 380 258 V600 H200 Z" />
        <rect className={a("stem-r")} x="360" y="20" width="140" height="760" />
        <path className={a("bowl")} d="M480 430 C530 360 590 320 650 320 C745 320 800 410 800 550 C800 700 740 780 640 780 H480 Z" />
      </g>
      <rect className={a("door")} x="270" y="700" width="44" height="80" fill="currentColor" />
    </svg>
  );
}
