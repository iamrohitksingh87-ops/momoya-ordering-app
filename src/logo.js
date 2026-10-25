// MOMOYA identity.
// Wordmark: high-contrast serif capitals where both O's are drawn as momos —
// a didone-weighted bowl (heavy sides, hairline base) whose shoulders gather
// into a pinched, pleated crown. Pleats are cut out of the form as negative space.
// Seal: circular stamp with a single momo glyph and a ring of mono type.

const MOMO_OUTER =
  'M50 3C54.5 15 61 23.5 71 30.5C86.5 41 96 58.5 96 80C96 107.6 75.4 130 50 130S4 107.6 4 80C4 58.5 13.5 41 29 30.5C39 23.5 45.5 15 50 3Z';
const MOMO_COUNTER = 'M50 41C40.8 41 33.2 59 33.2 81.5S40.8 123.6 50 123.6 66.8 104 66.8 81.5 59.2 41 50 41Z';
// Pleats fan from the knot down to the shoulders, with a slight clockwise twist.
const MOMO_PLEATS = [
  'M49 8C45 17 37 25.5 25 33',
  'M49.5 8C47.5 19 43 29 37.5 38.5',
  'M50.5 8C52 19 54.5 29 58 39',
  'M51 8C56 16.5 64 24.5 76 32',
];

let uid = 0;
function momoGlyph({ cls = '', size = 'viewBox="0 0 100 130"', pleatWidth = 2.6 } = {}) {
  const id = `momo-${++uid}`;
  return `<svg class="${cls}" ${size} aria-hidden="true" focusable="false">
    <defs><mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="130">
      <path fill="#fff" fill-rule="evenodd" d="${MOMO_OUTER}${MOMO_COUNTER}"/>
      <g fill="none" stroke="#000" stroke-width="${pleatWidth}" stroke-linecap="round">${MOMO_PLEATS.map((d) => `<path d="${d}"/>`).join('')}</g>
    </mask></defs>
    <rect width="100" height="130" fill="currentColor" mask="url(#${id})"/>
  </svg>`;
}

export const dumplingO = () => momoGlyph({ cls: 'lg-o' });

/** Wordmark. Letters are wrapped individually so they can be animated. */
export function wordmark({ cls = '', tag = 'span', label = true } = {}) {
  const glyph = (ch, i) =>
    ch === 'O'
      ? `<span class="lg-l lg-l--o" style="--i:${i}">${dumplingO()}</span>`
      : `<span class="lg-l" style="--i:${i}">${ch}</span>`;
  const letters = 'MOMOYA'.split('').map(glyph).join('');
  const a11y = label ? 'role="img" aria-label="MOMOYA"' : 'aria-hidden="true"';
  return `<${tag} class="logo ${cls}" ${a11y}><span class="logo__word" aria-hidden="true">${letters}</span></${tag}>`;
}

/** Circular seal — used as a brand stamp on hero, story and footer. */
export function seal({ cls = '', text = 'MOMOYA · HAND-FOLDED MOMO · KATHMANDU TO TABLE · ' } = {}) {
  const id = `seal-${++uid}`;
  return `<svg class="seal ${cls}" viewBox="0 0 200 200" role="img" aria-label="MOMOYA seal">
    <defs><path id="${id}" d="M100 100m-74 0a74 74 0 1 1 148 0a74 74 0 1 1-148 0"/></defs>
    <circle cx="100" cy="100" r="97" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <circle cx="100" cy="100" r="56" fill="none" stroke="currentColor" stroke-width="1.2"/>
    <g class="seal__ring"><text font-family="var(--mono)" font-size="12.6" letter-spacing="3.1" fill="currentColor">
      <textPath href="#${id}">${text}</textPath></text></g>
    <g transform="translate(73 63) scale(.54)">${momoGlyph({ size: 'width="100" height="130" viewBox="0 0 100 130"', pleatWidth: 3.6 })}</g>
  </svg>`;
}

/** Mount every [data-logo] / [data-seal] placeholder in the document. */
export function mountBrand(root = document) {
  root.querySelectorAll('[data-logo]').forEach((el) => {
    el.outerHTML = wordmark({ cls: el.dataset.logo || '', label: el.dataset.label !== 'false' });
  });
  root.querySelectorAll('[data-seal]').forEach((el) => {
    el.outerHTML = seal({ cls: el.dataset.seal || '', text: el.dataset.text || undefined });
  });
}
