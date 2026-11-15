import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Fontes embutidas (remotion/fonts, licença OFL) em vez de buscar no Google Fonts:
 * render determinístico e sem depender de rede.
 */
export const serif = "Playfair Display";
export const sans = "Inter";

const FONTS: [string, string][] = [
  [serif, "500"],
  [serif, "600"],
  [sans, "300"],
  [sans, "400"],
  [sans, "600"],
];
for (const [family, weight] of FONTS) {
  loadFont({ family, weight, url: staticFile(`fonts/${family.replace(/ /g, "")}-${weight}.ttf`) });
}

export { FPS, OUTRO_S, TRANSITION_S } from "../src/timeline";
