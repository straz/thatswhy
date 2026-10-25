'use strict';
// Colours, fonts and marble materials.

const darkQuery = matchMedia('(prefers-color-scheme: dark)');
const currentTheme = () => THEMES[darkQuery.matches ? 'dark' : 'light'];

const HAND = '"Bradley Hand", "Segoe Print", "Comic Sans MS", cursive';
// the monospace font is defined once, as --mono in style.css
const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();

// colours the page's CSS shares with the canvas drawing: CSS variable → THEMES key
const CSS_COLORS = { '--bg': 'bg', '--ink': 'ink', '--brass-hi': 'brassHi', '--brass-lo': 'brassLo', '--engrave': 'engrave', '--plate-shadow': 'shadow' };
function applyThemeToCss(t) {
  for (const [name, key] of Object.entries(CSS_COLORS)) document.documentElement.style.setProperty(name, t[key]);
}

// ---------- themes ----------
// wood: the sliding lid; walnut: the box around it
const THEMES = {
  light: {
    bg: '#f4efe6', dot: 'rgba(90,70,40,0.08)', shadow: 'rgba(80,55,30,0.13)', shRGB: '70,48,25', shA: 0.3,
    rim: '#e6dccb', rimHi: '#efe7d9', edge: 'rgba(80,55,30,0.2)', groove: '#d6c8b1', grooveIn: '#ddd0bb',
    rail: '#a8977f', tie: '#d4c6ae',
    mint: '#a3dac7', mintDk: '#5fae94', coral: '#f4a48f', coralDk: '#d9765f',
    butter: '#f6d886', butterLt: '#fbe9b5', butterDk: '#d4a640', lav: '#c9bbef', lavDk: '#8e7bcf',
    pink: '#f5a3bb', pinkDk: '#e07094',
    ringHi: '#eceef2', ringLo: '#9aa0aa', hole: '#1a1b1f', blade0: '#5d626c', blade1: '#858a94', seam: 'rgba(20,22,26,0.55)',
    ink: '#3b3631', tagBg: 'rgba(244,239,230,0.88)', tagLit: '#e0708f',
    paper: '#fffdf6', paperLine: 'rgba(80,120,200,0.18)', paperInk: '#3b3631', brassHi: '#e6c97f', brassLo: '#b08a3e', engrave: '#3a2a12',
    wood: '#d6b98d', woodHi: '#e8d2ab', woodDk: 'rgba(110,75,35,0.45)', grain: '125,82,38', lidInk: 'rgba(92,60,28,0.62)', boxShadow: 'rgba(70,48,25,0.3)',
    walnut: '#6b4a33', walnutHi: '#7e5a40', walnutGrain: '35,20,10'
  },
  dark: {
    bg: '#16181c', dot: 'rgba(255,255,255,0.045)', shadow: 'rgba(0,0,0,0.35)', shRGB: '0,0,0', shA: 0.5,
    rim: '#2a2e35', rimHi: '#323740', edge: 'rgba(0,0,0,0.5)', groove: '#1f2228', grooveIn: '#24282e',
    rail: '#626a77', tie: '#2f343c',
    mint: '#5aa58d', mintDk: '#3d7a66', coral: '#c87a66', coralDk: '#9c5545',
    butter: '#c9a650', butterLt: '#dcc07a', butterDk: '#97782f', lav: '#8a7cc0', lavDk: '#5e5197',
    pink: '#c97790', pinkDk: '#99506a',
    ringHi: '#8d939d', ringLo: '#40454d', hole: '#000', blade0: '#3a3f47', blade1: '#5a606a', seam: 'rgba(0,0,0,0.6)',
    ink: '#d9d4cc', tagBg: 'rgba(22,24,28,0.85)', tagLit: '#f08fae',
    paper: '#ece6d8', paperLine: 'rgba(80,120,200,0.22)', paperInk: '#2e2a26', brassHi: '#b89a55', brassLo: '#7d6229', engrave: '#241808',
    wood: '#b39268', woodHi: '#c6a77c', woodDk: 'rgba(40,25,10,0.6)', grain: '80,50,22', lidInk: 'rgba(60,38,16,0.72)', boxShadow: 'rgba(0,0,0,0.65)',
    walnut: '#5a3d2a', walnutHi: '#6a4a34', walnutGrain: '22,12,5'
  }
};

// ---------- marble materials ----------
const MATS = [
  { name: 'silver', kind: 'metal', h: 215, s: 8, l: 70 },
  { name: 'gold', kind: 'metal', h: 44, s: 72, l: 58 },
  { name: 'copper', kind: 'metal', h: 20, s: 60, l: 56 },
  { name: 'ruby', kind: 'glass', h: 350, s: 80, l: 52 },
  { name: 'emerald', kind: 'glass', h: 150, s: 65, l: 44 },
  { name: 'sapphire', kind: 'glass', h: 220, s: 80, l: 54 },
  { name: 'amber', kind: 'glass', h: 35, s: 90, l: 54 },
  { name: 'amethyst', kind: 'glass', h: 280, s: 55, l: 58 },
  { name: 'aqua', kind: 'glass', h: 185, s: 70, l: 50 },
  { name: 'jade', kind: 'stone', h: 150, s: 32, l: 56 },
  { name: 'lapis', kind: 'stone', h: 225, s: 55, l: 42 },
  { name: 'terracotta', kind: 'stone', h: 15, s: 52, l: 56 },
  { name: 'granite', kind: 'stone', h: 30, s: 8, l: 62 }
];
// a new random material for a changer (never plain silver, never the same again)
function pickMat(cur) {
  const choices = MATS.filter(x => x.name !== 'silver' && x.name !== cur.name);
  return choices[Math.floor(Math.random() * choices.length)];
}
// what two fused marbles become: hues averaged around the colour wheel
function blendMat(a, b) {
  let h;
  if (a.s < 12) h = b.h; else if (b.s < 12) h = a.h;
  else {
    const ra = a.h * Math.PI / 180, rb = b.h * Math.PI / 180;
    h = Math.round((Math.atan2(Math.sin(ra) + Math.sin(rb), Math.cos(ra) + Math.cos(rb)) * 180 / Math.PI + 360) % 360);
  }
  return { name: 'blend', kind: a.kind === b.kind ? a.kind : 'glass', h, s: Math.max(a.s, b.s, 40), l: (a.l + b.l) / 2 };
}
