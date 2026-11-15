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

export const FPS = 30;
export const TRANSITION_S = 0.6;
export const OUTRO_S = 4.5;
