import type { CSSProperties } from "react";

// A subtle honeycomb mesh layered over the existing glow/gradient floor. Built the same way as the
// classic CSS hexagon-pattern trick: two pairs of 30/150deg edges plus one 60deg accent, tiled on an
// 80x140 grid and offset by half a cell (40px 70px) so the edges line up into hexagons. The mesh's
// gaps are transparent, so whatever sits "below" it in the layer list (the radial glow / page gradient)
// still shows through each cell.
const HEX_POSITION = "0 0, 0 0, 40px 70px, 40px 70px, 0 0, 40px 70px";
const HEX_SIZE = "80px 140px, 80px 140px, 80px 140px, 80px 140px, 80px 140px, 80px 140px";

function hexMesh(edge: string, accent: string): string[] {
  return [
    `linear-gradient(30deg, ${edge} 12%, transparent 12.5%, transparent 87%, ${edge} 87.5%, ${edge})`,
    `linear-gradient(150deg, ${edge} 12%, transparent 12.5%, transparent 87%, ${edge} 87.5%, ${edge})`,
    `linear-gradient(30deg, ${edge} 12%, transparent 12.5%, transparent 87%, ${edge} 87.5%, ${edge})`,
    `linear-gradient(150deg, ${edge} 12%, transparent 12.5%, transparent 87%, ${edge} 87.5%, ${edge})`,
    `linear-gradient(60deg, ${accent} 25%, transparent 25.5%, transparent 75%, ${accent} 75%, ${accent})`,
    `linear-gradient(60deg, ${accent} 25%, transparent 25.5%, transparent 75%, ${accent} 75%, ${accent})`,
  ];
}

/** The app's shared page background: a honeycomb mesh (white in light mode, a shade of navy barely
 * above the floor colour in dark mode, so it reads as a quiet texture rather than a bold op-art print)
 * over the existing brand-colour glow, used by both the login page and the dashboard layout. */
export function getAppBackground(theme: "dark" | "light"): CSSProperties {
  if (theme === "dark") {
    return {
      backgroundImage: [
        ...hexMesh("#0d1830", "#24365966"),
        "radial-gradient(ellipse 65% 45% at 20% 5%, rgba(14, 165, 233, 0.12), transparent 70%)",
        "radial-gradient(ellipse 55% 45% at 90% 90%, rgba(2, 132, 199, 0.08), transparent 70%)",
      ].join(", "),
      backgroundPosition: `${HEX_POSITION}, 0 0, 0 0`,
      backgroundSize: `${HEX_SIZE}, auto, auto`,
      backgroundColor: "#070c1e",
    };
  }
  return {
    backgroundImage: [
      ...hexMesh("#ffffff", "#ffffff66"),
      "linear-gradient(135deg, #eef4fc 0%, #e2edfd 50%, #d8e7fa 100%)",
    ].join(", "),
    backgroundPosition: `${HEX_POSITION}, 0 0`,
    backgroundSize: `${HEX_SIZE}, auto`,
    backgroundColor: "#eef4fc",
  };
}
