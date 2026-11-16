// The look plan, in one place. Eight values: six neutrals plus one team colour
// each; the lighting makes every shade the game needs, so no other colour
// appears in the code. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#241c14',
  surface: '#3a2e22',
  hairline: '#5c4c39',
  ink: '#efe8dc',
  muted: '#a89a86',
  accent: '#f0a830',
  foe: '#e4572e',
  ally: '#2ec4b6',
};

export function shade(name) {
  return PALETTE[name];
}
