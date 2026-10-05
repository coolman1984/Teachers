# Design — how Hessa looks and behaves

Same family as the owner's Trip Orders system: calm surfaces, one bold place (the front desk), trust colours that mean only one
thing, Arabic first. This file is the contract for every new screen; `tests/test_design.py` and `tests/test_acceptance.py` enforce
most of it.

## Tokens (css/tokens.css)

Everything visual comes from CSS variables; a view never writes a colour.

| Token | Use |
|---|---|
| `--canvas`, `--surface`, `--surface-2`, `--raised` | page, cards, quiet fills, dialogs |
| `--ink`, `--ink-2`, `--ink-3` | text, secondary text, hints |
| `--line`, `--line-2` | borders, separators |
| `--brand`, `--brand-soft` | the navy identity: sidebar, primary emphasis |
| `--signal` | the amber accent: the one action that matters on a screen (check in, save the receipt) |
| `--ok`, `--warn`, `--bad`, `--info` (+ `-soft`) | **trust colours only**: paid/present, attention, debt/absent/error, information |

Themes: `daylight` (default), `night` (default dark), `asphalt`, `highway`, `contrast` (WCAG AA+). Size `s / m / l / xl` sets
`--fs`; density `comfortable / compact`; motion follows the system unless the person chooses.

## Layout

- **Logical CSS only**: `margin-inline-start`, `inset-inline-end`, `text-align: start` — never left/right. Arrows mirror in RTL.
- Every auto grid caps its column at the screen: `repeat(auto-fit, minmax(min(18rem, 100%), 1fr))`. A fixed `minmax(22rem, …)` is
  385 px at the XL font — wider than a phone (found by the acceptance sweep, 2026-10-05).
- Grid and flex children that hold text get `min-width: 0`; long names wrap (`overflow-wrap: anywhere`), money never breaks
  inside a number (only between the currency and the number on small phones).
- Side-by-side layouts (`.grid.two-col`, `.split`) become one column under 900 px. Phones get the bottom tab bar.
- Numbers are Western digits, money `1,250 ج.م` / `EGP 1,250`, dates `dd/mm/yyyy`, 24 h times; codes, receipt numbers and phone
  numbers sit in `<bdi dir="ltr">` inside Arabic text.

## Components (js/ui.js, js/core.js)

| Need | Use |
|---|---|
| a page | `HS.views.<id> = HS.withData({ render(ctx) → html, mount(root, ctx) })`, head = `.page-head` |
| a list record | side panel `HS.panel.open({title, body, footer, mount})` — stackable, Esc closes |
| a question | `HS.dialog` / `U.confirm({danger, reason})` (a reason of 3+ characters for anything that reverses money or data) |
| a save | `U.run(promise, okKey, btn)` → toast on success, the reason on failure, the button re-enabled |
| choices | `.seg` (segmented control, wraps on phones), `.chip`, `.badge` |
| a message in the page | `.tip` (+ `ok / warn / bad`) with an icon |
| nothing to show | `U.empty(icon, title, hint)` — always says what to do next |
| loading | `.skeleton` blocks of the final shape, never a spinner alone |
| a spreadsheet | `/api/xlsx` (sheets in the reader's language) or `U.csv` + `U.download` (formula-safe) |
| paper | `HS.printHTML(html)` for A4, `HS.printReceipt` for receipts (80 / 58 mm / A5 per PC, page measured to the receipt) |

## States every screen has

Empty (with the next step), loading (skeleton), error (the server's reason in the reader's language — `err.*` keys), no permission
(a lock and who can do it), **offline** (the red bar on every page, save buttons dimmed, writes refused — never a hidden queue).

## Words

Every visible text is a key in **both** `js/i18n/en.js` and `js/i18n/ar.js` (Formal Arabic, glossary in EXECUTION_PLAN Part D1).
User guides are in simple Egyptian Arabic. A server sentence that reaches a person carries a key (`Problem('err.x', …)`,
`GatewayError(…, 'gw.err.x')`); fixed log sentences are translated in the page (`HS.audit.securityDetail`) and the stored log is never
rewritten.

## The parent page (gateway/public)

Separate, tiny (under 120 KB, system fonts), read only, Arabic first + English, light/dark from the phone, no inline styles (its
CSP forbids them), the last copy offline with its age, wiped when the link is stopped.
