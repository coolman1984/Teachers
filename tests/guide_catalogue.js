'use strict';
// Prints Hessa's help as the factory catalogue (Apps-Factory packages/af-guide): guides, learning paths, problems, both
// languages, and the Arabic of every other help text (questions, support, tour). Used by tests/test_guide_gate.py.
const { startup } = require('./test_startup.js');
const LANGS = ['ar', 'en'];
const HELP_PREFIXES = ['gd.', 'sit.', 'hq.', 'help.', 'guide.', 'sup.', 'tour.', 'slide.', 'path.'];
const by = {};
for (const lang of LANGS) { const HS = startup(lang); HS.lang = lang; by[lang] = HS; }
const HS = by.ar, G = HS.guides;
const page = (p) => String(p || '').split('?')[0].split('/')[0];
const texts = (keys) => Object.fromEntries(LANGS.map((l) => [l, keys.map((k) => by[l].has(k) ? by[l].t(k) : '')]));
const cat = {
  product: 'hessa', languages: LANGS, setup_guides: ['first', 'centre'],
  roles: ['full-access', 'administrator', 'secretary', 'teacher', 'assistant', 'accountant', 'viewer'],
  guides: G.list.map((g) => ({ id: g.id, steps: g.steps.length, pages: [...new Set(g.steps.map((s) => page(s.page)).filter(Boolean))],
    texts: texts(['gd.' + g.id + '.t', 'gd.' + g.id + '.d', ...g.steps.map((_, i) => 'gd.' + g.id + '.' + (i + 1)), 'gd.' + g.id + '.ok']) })),
  paths: G.paths.map((p) => ({ id: p.id, admin: !!p.admin, roles: p.roles, lessons: p.lessons, texts: texts(['path.' + p.id + '.t', 'path.' + p.id + '.d']) })),
  situations: G.situations.map((x) => ({ id: x[0], guide: G.sitGuide[x[0]] || null, texts: texts(['sit.' + x[0] + '.q', 'sit.' + x[0] + '.a']) })),
  other_ar: Object.fromEntries(Object.keys(HS.dict.ar || {}).filter((k) => HELP_PREFIXES.some((p) => k.startsWith(p))).map((k) => [k, HS.t(k)])),
};
require('fs').writeFileSync(process.argv[2], JSON.stringify(cat));   // a file: requiring test_startup.js also prints its own test lines
