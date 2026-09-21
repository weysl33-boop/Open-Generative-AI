/**
 * KOYO Studio — shared class recipes.
 *
 * These are the only approved visual recipes for interactive elements.
 * Every value resolves from the design tokens in app/globals.css, so a
 * change to a token propagates to the whole product.
 *
 * Rules encoded here:
 *  - Exactly one control-height contract: 28 / 32 / 38 (default) / 44.
 *  - Exactly one focus treatment, always visible, never removed.
 *  - No coloured glow. Elevation is neutral shadow only.
 *  - No raw hex, no arbitrary px, no ad-hoc radius.
 *
 * NO-CONFLICT INVARIANT
 * `cn` is a plain joiner — it does not deduplicate like tailwind-merge, and
 * Tailwind emits height utilities in reverse scale order (`.h-control-xs`
 * lands after `.h-control-lg`, so the *smaller* one wins). A base recipe
 * here must therefore never carry a height, horizontal padding, radius or
 * font-size of its own; those come only from controlClasses() so a composed
 * string contains exactly one class per property.
 */

export const CONTROL_HEIGHT = {
  xs: 'h-control-xs',   // 28px — compact inline stepper, segment
  sm: 'h-control-sm',   // 32px — toolbar, secondary action, menu row
  md: 'h-control-md',   // 38px — DEFAULT for every studio control
  lg: 'h-control-lg',   // 44px — primary CTA, marketing forms
};

/** Horizontal padding paired 1:1 with the height contract. 4px grid. */
const CONTROL_X_PADDING = {
  xs: 'px-2',
  sm: 'px-2.5',
  md: 'px-3',
  lg: 'px-4',
};

const CONTROL_RADIUS = {
  xs: 'rounded-sm',
  sm: 'rounded-md',
  md: 'rounded-md',
  lg: 'rounded-md',
};

/** Typography ramp — the only sizes an interactive element may use. */
const CONTROL_TEXT = {
  xs: 'text-label',
  sm: 'text-label',
  md: 'text-body',
  lg: 'text-body',
};

/**
 * The single source of an element's dimensions. Returns exactly one height,
 * one width (icon mode), one horizontal padding, one radius and one size.
 *
 * `text` and `pad` are overrides rather than additions: a caller that needs
 * denser type or a wider hit box passes it in here, so the composed string
 * still carries exactly one class per property.
 */
export function controlClasses(size = 'md', { icon = false, text, pad } = {}) {
  const s = CONTROL_HEIGHT[size] ? size : 'md';
  return [
    CONTROL_HEIGHT[s],
    icon ? `w-control-${s} px-0` : pad || CONTROL_X_PADDING[s],
    CONTROL_RADIUS[s],
    text || CONTROL_TEXT[s],
  ].join(' ');
}

/**
 * One focus treatment for the whole product. Applied to every interactive
 * surface. `` here is safe only because the global sheet also
 * declares an unconditional `:focus-visible` outline, so focus is replaced
 * with a stronger ring rather than removed.
 */
export const FOCUS_RING =
  'outline-none focus-visible:ring-2 focus-visible:ring-brand-ring focus-visible:border-brand';

export const FOCUS_RING_DANGER =
  'outline-none focus-visible:ring-2 focus-visible:ring-danger-ring focus-visible:border-danger';

/**
 * Shared base for anything that behaves as a control. Dimension-free and
 * weight-free: size comes from controlClasses(), weight from BUTTON_WEIGHT,
 * so a composed string never carries two classes for one property.
 */
export const CONTROL_BASE = [
  'inline-flex items-center justify-center gap-2 whitespace-nowrap select-none',
  'border text-ink',
  'transition-[background-color,border-color,color,box-shadow]',
  'duration-fast ease-standard',
  FOCUS_RING,
  'disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed',
].join(' ');

/**
 * The only saturated colour in the product is reserved for `primary`, and
 * `primary` is the only variant that carries semibold weight — hierarchy is
 * expressed by which variant you pick, never by ad-hoc overrides.
 */
export const BUTTON_WEIGHT = {
  primary: 'font-semibold',
  secondary: 'font-medium',
  tertiary: 'font-medium',
  outline: 'font-medium',
  danger: 'font-medium',
};

/**
 * Button variants. `primary` is the single brand action used by every
 * Generate / Create / Run / Submit in the product.
 */
export const BUTTON_VARIANTS = {
  primary: [
    'bg-brand text-ink-on-accent border-brand-line',
    'hover:bg-brand-hover hover:border-brand-hover',
    'active:bg-brand-active active:border-brand-active',
  ].join(' '),
  secondary: [
    'bg-raised text-ink border-line',
    'hover:bg-overlay hover:border-line-strong',
    'active:border-line-strong',
  ].join(' '),
  tertiary: [
    'bg-transparent text-ink-muted border-transparent',
    'hover:bg-wash hover:text-ink',
    'active:bg-wash-press',
  ].join(' '),
  outline: [
    'bg-transparent text-ink border-line',
    'hover:bg-wash hover:border-line-strong',
    'active:bg-wash-press',
  ].join(' '),
  danger: [
    'bg-danger-soft text-danger border-danger-line',
    'hover:bg-danger-hover hover:border-danger',
    'active:bg-danger-pressed',
    FOCUS_RING_DANGER,
  ].join(' '),
};

/** Input / textarea family. Dimension-free; size comes from controlClasses. */
export const FIELD_BASE = [
  'w-full bg-well text-ink placeholder:text-ink-subtle',
  'border border-line',
  'transition-[background-color,border-color,box-shadow] duration-fast ease-standard',
  FOCUS_RING,
  'disabled:cursor-not-allowed disabled:opacity-40',
  'readonly:cursor-default',
  'aria-[invalid=true]:border-danger',
].join(' ');

/** Floating layer (dropdown, popover, command menu). */
export const OVERLAY_PANEL = [
  'bg-overlay border border-line-strong rounded-lg shadow-elevation-3',
  'text-ink overflow-hidden',
].join(' ');

/**
 * Menu / dropdown option row. Carries no horizontal padding: an inset item
 * needs a wider left gutter than a normal one, and `px-*` plus `pl-*` in the
 * same string would be an unresolved conflict (see NO-CONFLICT INVARIANT).
 * Consumers compose it with MENU_ITEM_PAD or MENU_ITEM_INSET.
 */
export const MENU_ITEM = [
  'flex w-full items-center gap-2 rounded-sm',
  'text-body text-left text-ink-muted',
  'transition-[background-color,color] duration-fast ease-standard',
  'hover:bg-wash hover:text-ink',
  'focus:bg-wash focus:text-ink outline-none',
  'data-[state=checked]:text-brand data-[selected=true]:text-brand',
  'data-[disabled]:pointer-events-none data-[disabled]:opacity-40',
].join(' ');

export const MENU_ITEM_PAD = 'px-2.5';
export const MENU_ITEM_INSET = 'pl-8 pr-2.5';

/**
 * Modal / drawer layer. SCRIM + panel live here rather than in a component so
 * the app-side `components/ui/dialog` shell and the studio `ModalContent`
 * cannot end up with two different scrims (z-index ladder is fixed by tokens;
 * PART 24).
 */
export const SCRIM = 'fixed inset-0 z-overlay bg-scrim backdrop-blur-sm';

export const MODAL_PANEL = [
  'fixed left-1/2 top-1/2 z-modal w-modal max-h-modal -translate-x-1/2 -translate-y-1/2',
  'overflow-y-auto rounded-xl border border-line-strong bg-overlay text-ink',
  'p-6 shadow-elevation-4 animate-scale-in',
].join(' ');

/**
 * On a phone a centred dialog is the wrong object: it becomes a bottom sheet
 * you can reach with a thumb (PART 17). Both axes of the centring transform
 * have to be released here — `max-md:left-0` alone would leave translateX
 * running and push the sheet half off screen.
 */
export const MODAL_PANEL_MOBILE = [
  'max-md:top-auto max-md:bottom-0 max-md:left-0 max-md:translate-x-0 max-md:translate-y-0',
  'max-md:w-full max-md:max-w-none max-md:max-h-sheet',
  'max-md:rounded-b-none max-md:rounded-t-xl max-md:p-5',
].join(' ');

export const SHEET_PANEL = [
  'fixed z-modal flex flex-col border-line-strong bg-overlay text-ink shadow-elevation-4',
  'animate-fade-in',
].join(' ');

export const DIALOG_TITLE = 'text-section-title text-ink';
export const DIALOG_DESCRIPTION = 'text-body-sm mt-1 text-ink-muted';
export const DIALOG_FOOTER =
  'mt-6 flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end';
export const DIALOG_HEADER = 'flex flex-col gap-1 text-left';

/**
 * Dismiss affordance. Position-free on purpose: a studio modal keeps it in the
 * header row, an app dialog floats it in the corner — both must still be a
 * 38px target, because it is the primary touch control on a phone (PART 10).
 */
export const DIALOG_CLOSE_BUTTON = [
  'flex size-control-md shrink-0 items-center justify-center rounded-md text-ink-subtle',
  'transition-[background-color,color] duration-fast ease-standard',
  'hover:bg-wash hover:text-ink',
  FOCUS_RING,
].join(' ');

/** Named modal widths, shared so the same size means the same box everywhere. */
export const MODAL_SIZE = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
};

/**
 * Card family. CARD_BASE carries no background or border-colour: a selected
 * card has to replace both, and two `bg-*` utilities in one class string have
 * no defined winner (see NO-CONFLICT INVARIANT). Exactly one CARD_SURFACE
 * goes in alongside the base.
 */
export const CARD_BASE = [
  'rounded-xl border',
  'text-ink',
  'transition-[background-color,border-color,box-shadow] duration-base ease-standard',
].join(' ');

export const CARD_SURFACE = {
  default: 'bg-surface border-line',
  flat: 'bg-surface border-transparent',
  selected: 'bg-brand-soft border-brand',
};

export const CARD_INTERACTIVE = [
  'cursor-pointer hover:border-line-strong hover:bg-raised',
].join(' ');

/** Semantic status colours for generation lifecycle states. */
export const STATUS_TONE = {
  queued: 'text-warning bg-warning-soft border-warning-line',
  uploading: 'text-info bg-info-soft border-info-line',
  generating: 'text-brand bg-brand-soft border-brand-line',
  processing: 'text-brand bg-brand-soft border-brand-line',
  completed: 'text-success bg-success-soft border-success-line',
  failed: 'text-danger bg-danger-soft border-danger-line',
  cancelled: 'text-ink-subtle bg-wash border-line',
};

/* ------------------------------------------------------------------ */
/* Prompt Composer — the product's first-class component               */
/*                                                                     */
/* The composer owns exactly one control height (38px) and one icon    */
/* footprint (38px square). Every studio parameter pill, media slot     */
/* and popover derives from these, so a studio cannot drift to the      */
/* 34/36/40/42px spread the runtime audit measured across 757 controls. */
/* ------------------------------------------------------------------ */

export const PROMPT_PANEL = [
  'w-full bg-surface-glass backdrop-blur-sm rounded-composer border border-line',
  'flex flex-col gap-3 p-4 shadow-elevation-3',
].join(' ');

export const PROMPT_TEXTAREA = [
  'w-full resize-none border-none bg-transparent pt-1',
  'text-ink placeholder:text-ink-subtle',
  'min-h-control-md max-h-composer md:max-h-composer-lg overflow-y-auto',
  'disabled:cursor-not-allowed disabled:opacity-40',
  FOCUS_RING,
].join(' ');

export const PROMPT_FOOTER = [
  'relative flex flex-col items-stretch justify-between gap-3',
  'border-t border-line-subtle pt-3 sm:flex-row sm:items-center',
].join(' ');

/** Composer pill: 38px tall, label-weight type via controlClasses('md', {text}). */
export const PROMPT_CONTROL_IDLE =
  'bg-wash text-ink border-line hover:bg-wash-strong hover:border-line-strong';

export const PROMPT_CONTROL_ACTIVE =
  'bg-brand-soft text-brand border-brand-line hover:bg-brand-pressed';

/** Square 38px media slot: attach button, reference thumbnail, remove chip. */
export const PROMPT_MEDIA_SQUARE = [
  'relative flex shrink-0 items-center justify-center overflow-hidden',
  'rounded-md border',
  'transition-[background-color,border-color,color] duration-fast ease-standard',
  FOCUS_RING,
].join(' ');

export const PROMPT_MEDIA_IDLE =
  'border-line bg-well text-ink-muted hover:border-line-strong hover:text-ink';

export const PROMPT_MEDIA_ACTIVE = 'border-brand-line bg-brand-soft text-brand';

/** Parameter popover anchored above its trigger. */
export const PROMPT_POPOVER = [
  'min-w-44 max-h-popover rounded-lg border border-line-strong',
  'bg-overlay-glass p-2.5 text-ink shadow-elevation-3 animate-fade-in overflow-y-auto',
].join(' ');

export const PROMPT_POPOVER_ANCHOR = 'absolute bottom-full left-0 z-popover mb-2.5';

export const PROMPT_POPOVER_SECTION =
  'mb-1.5 border-b border-line-subtle px-1 pb-2 text-label font-medium uppercase tracking-wide text-ink-subtle';

/**
 * The control row wraps rather than scrolling or clipping.
 *
 * A horizontal `overflow-x-auto` rail was the first attempt, and it is the
 * failure PART 23 names: on a phone the pills past the edge look and behave
 * exactly like pills that do not exist. Clipping is worse — the studio shell
 * is `overflow-hidden`, so the `Draw` and `Generate` controls at 768px simply
 * stopped existing with no scrollbar to hint otherwise. Wrapping costs the
 * composer a second row at narrow widths and keeps every control reachable at
 * all ten graded viewports.
 *
 * No `flex-1`: the footer is `flex-col` below `sm` and `justify-between` above
 * it, so growth is both unnecessary and vertical where it would distort the
 * composer. `min-w-0` is what lets the rail give up width and wrap.
 */
export const PROMPT_CONTROLS_ROW = [
  'flex min-w-0 flex-wrap items-center gap-2 pb-0.5 sm:pb-0',
].join(' ');
