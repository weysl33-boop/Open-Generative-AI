# Subscription and Credit-Pack Page — Design QA

**Result**

- Visual QA passed: no actionable P0/P1/P2 design or interaction findings remain.
- The request is implemented locally and the verified preview is running at `http://127.0.0.1:3150/pricing`.
- Deployment readiness is not claimed: the final repository production build is blocked by an unrelated duplicate binding in the untracked `lib/emailAdmin.js`; that file was left untouched to preserve existing user work.

**Source visual truth**

- `C:\Users\weysl\.codex\attachments\634c9fc8-647f-4725-aaf7-f789b94843c2\image-1.png` — 1530 × 1225 px, subscription page.
- `C:\Users\weysl\.codex\attachments\634c9fc8-647f-4725-aaf7-f789b94843c2\image-2.png` — 1090 × 849 px, generic credit-pack reference.

**Rendered implementation evidence**

- Desktop subscription view: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\implementation-pricing-desktop-1530x1225.png` — 1530 × 1225 CSS px and pixels, `deviceScaleFactor: 1`.
- Desktop credit-pack anchor: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\implementation-credit-packs-desktop-1090x849.png` — 1090 × 849 CSS px and pixels, `deviceScaleFactor: 1`; `#credit-packs` top offset is 0 px.
- Mobile credit-pack anchor: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\implementation-credit-packs-mobile-390x844.png` — 390 × 844 CSS px and pixels, `deviceScaleFactor: 1`.
- Purchase confirmation states: `implementation-subscription-checkout-modal.png` and `implementation-credit-pack-checkout-modal.png` in the same temporary directory.
- Real unconfigured-payment state: `implementation-pricing-real-payment-disabled.png` in the same temporary directory.
- Next development toolbar was hidden in screenshots only; no application styles or page content were altered for capture. No framework error overlay was present.

**Full-view and focused comparisons**

- Full subscription comparison: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\compare-image1-final-side-by-side.png`; the supplied source and browser-rendered implementation are displayed side by side at identical 1530 × 1225 dimensions.
- Focused plan-card comparison: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\compare-plan-cards-focused.png`; source crop 1358 × 803 px and implementation crop 1321 × 802 px, both taken from the same 1530 × 1225 viewport at 1:1 density. The small width difference is the actual content-grid width, not a scale mismatch.
- Full credit-pack comparison: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\compare-image2-final-side-by-side.png`; source and implementation are each 1090 × 849 px at 1:1 density. The source is a modal, while the implementation intentionally integrates the same generic-pack interaction into the canonical pricing page.
- Focused generic-pack grid comparison: `C:\Users\weysl\AppData\Local\Temp\koyosim-pricing-qa-20260921-e54d1b7f\compare-credit-pack-grid-focused.png`; both card-grid crops are 816 × 199 px at native scale.

**State and interactions tested**

- Fresh disposable PostgreSQL preview database migrated through migration 028; public plan details and the seven server-catalog generic credit packs load from local API routes.
- Four commercial subscription cards are displayed. Personal/team/enterprise audience controls are absent. Monthly is the only purchasable billing period; quarterly/yearly remain visibly unavailable until server fulfillment support exists.
- Browser-only visual mocks enabled payment providers and a synthetic signed-in user to inspect the subscription and credit-pack confirmation modals. The confirmation summaries showed Starter with 2,400 credits and the selected 1,400-credit pack at ¥140. The final payment control was never clicked and checkout POST count stayed at 0.
- An unmocked anonymous session showed all subscription and credit-pack purchase CTAs disabled because the isolated database has no configured payment providers.
- Selecting a different credit pack updates the selected state. The 1090 px desktop and 390 px mobile views have no horizontal overflow; the seven pack cards display without clipping.
- `/subscription` redirects to `/pricing`; `/zh/subscription` redirects to `/zh/pricing`. The pricing page close control returns to the previous route.
- Browser console errors and page errors: none on the pricing flow or real-provider-disabled state.

**Required fidelity surfaces**

- Typography: the same compact sans-serif hierarchy, large centered headline, plan names/prices, and small grouped feature labels are preserved; card text wraps without clipping at the tested widths.
- Spacing/layout: modal-like outer frame, centered monthly selector, right-aligned generic-pack CTA, four tall desktop plan cards, and the reference-like 4-column generic pack grid now align closely. The desktop plan cards begin at approximately y=342 and end at y=1144, matching the reference's y=344 to y=1146 region.
- Color/tokens: black surfaces, lime accent for tags/popular/flagship indicators, and magenta for premium purchase emphasis match the source hierarchy. The flagship tag and plan badges were corrected in the final comparison iteration.
- Image/assets: no raster artwork is required. Existing Lucide icons are used; the briefcase glyph is outlined rather than the reference's filled mark, a minor P3 difference.
- Copy/content: feature groups follow the reference's video, image, and additional-benefit sections. Current monthly prices and bonus-credit amounts come from the server plan catalog. Reference strike-through prices and discount-fold claims are intentionally omitted because the current server catalog has no verified original-price fields; quarterly/yearly remain disabled to reflect actual fulfillment support.

**Comparison history**

1. Initial reference pass found the old global shell competing with the modal-like reference, the title and section hierarchy too compressed, and credit-pack deep links landing with unrelated content above the section. The page was placed in an inset frame with a close control, the hero/plan hierarchy was enlarged, the redundant plan heading was removed, and the anchor was made data-load-aware.
2. First desktop side-by-side pass found the plan/credit controls clustered together, the plan cards too short, and the credit section appearing too early in the first viewport. The monthly selector was centered and the generic-pack action right-aligned; desktop top padding and plan-card height were increased to match the reference proportions.
3. Credit-anchor comparison then showed preceding card footers in the viewport because the page has no fixed header. Both section anchors now use zero scroll margin. The generic pack uses a briefcase icon and no extra “入门包” badge, matching the reference's simpler card treatment. The final review also changed the flagship pill and bonus badges to lime. Post-fix full-view and focused comparisons are linked above.

**Remaining non-blocking differences / risks**

- P3 visual polish: the small credit-pack briefcase is a line icon rather than the filled briefcase in the reference.
- No original monthly-price strike-throughs are shown; the current backend does not provide verified previous prices, so adding them would be inventing commercial data.
- The local production build could not complete because `lib/emailAdmin.js` currently imports and redeclares `sendEmailSmtpTest` under the same identifier. This unrelated untracked user file was not modified. The changed pricing route did compile and run in Next development mode, and its UI/API/DB tests passed; a clean full production build remains unverified until that separate issue is addressed.
- No live payment, production database write, or deployment was performed.

final result: passed
