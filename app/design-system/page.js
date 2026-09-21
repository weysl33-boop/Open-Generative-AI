'use client';

import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  Gem,
  Image as ImageIcon,
  Mic,
  Play,
  Plus,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label, FieldMessage } from 'studio/ui/field';
import { Progress, Skeleton, Spinner, Alert, EmptyState } from 'studio/ui/feedback';
import { SegmentedControl } from 'studio/ui/navigation';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  PopoverContent,
  PopoverRoot,
  PopoverTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
} from 'studio/ui/overlay';
import { Modal, ModalContent, ModalFooter } from 'studio/ui/overlay';
import {
  PromptAspectRatioIcon,
  PromptAction,
  PromptComposer,
  PromptControls,
  PromptFooter,
  PromptQualityIcon,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from 'studio/prompt';

/**
 * The living surface of the design system.
 *
 * Every number on this page is read back out of the browser with
 * getComputedStyle — nothing is retyped. The previous gallery hard-coded
 * `#181d2a` next to a token labelled --bg-overlay, so it kept "documenting"
 * values long after the tokens moved. A gallery that restates values is a
 * second source of truth; this one cannot drift because it owns no data.
 */

const TOKEN_GROUPS = [
  {
    title: 'Surface elevation',
    note: 'Dark-first and neutral. Content stays the brightest thing on screen.',
    vars: [
      '--bg-canvas',
      '--bg-base',
      '--bg-surface',
      '--bg-surface-raised',
      '--bg-overlay',
      '--bg-subtle',
      '--bg-inverse',
      '--bg-surface-glass',
      '--bg-overlay-glass',
    ],
  },
  {
    title: 'Text hierarchy',
    note: 'Four levels. Contrast against every surface is verified below.',
    vars: ['--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled', '--text-inverse', '--text-on-accent'],
  },
  {
    title: 'Borders',
    note: 'Alpha-based so one value reads correctly on all five surfaces.',
    vars: ['--border-subtle', '--border-default', '--border-strong', '--border-accent'],
  },
  {
    title: 'Brand accent',
    note: 'The only saturated colour in the product. Primary action, focus, active, progress — nothing else.',
    vars: ['--accent-primary', '--accent-hover', '--accent-active', '--accent-soft', '--accent-pressed', '--accent-ring', '--accent-line'],
  },
  {
    title: 'Feedback',
    note: 'Each translucent variant is its own token: Tailwind v3 cannot apply /alpha to a var() colour.',
    vars: [
      '--success', '--success-soft', '--success-line',
      '--warning', '--warning-soft', '--warning-line',
      '--danger', '--danger-soft', '--danger-hover', '--danger-pressed', '--danger-line', '--danger-ring',
      '--info', '--info-soft', '--info-line',
    ],
  },
  {
    title: 'Neutral washes',
    note: 'The only permitted white-alpha values in the system.',
    vars: ['--hover-neutral', '--hover-neutral-strong', '--press-neutral', '--scrim'],
  },
];

const GEOMETRY_GROUPS = [
  {
    title: 'Radius — exactly six steps',
    vars: ['--radius-xs', '--radius-sm', '--radius-md', '--radius-lg', '--radius-xl', '--radius-2xl', '--radius-full'],
  },
  {
    title: 'Control height contract',
    note: '38px is the product default. A different height needs a stated design reason, not an ad-hoc class.',
    vars: ['--control-xs', '--control-sm', '--control-md', '--control-lg', '--header-h', '--sidebar-w', '--sidebar-w-collapsed'],
  },
  {
    title: 'Spacing — 4px grid',
    vars: ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-8', '--space-10', '--space-12', '--space-16'],
  },
  {
    title: 'Elevation — no coloured glow anywhere',
    vars: ['--elevation-1', '--elevation-2', '--elevation-3', '--elevation-4'],
  },
  {
    title: 'Motion',
    vars: ['--motion-fast', '--motion-base', '--motion-slow', '--motion-page', '--ease-standard', '--ease-enter', '--ease-exit'],
  },
  {
    title: 'Layer ladder — never invent a number',
    vars: [
      '--z-base', '--z-raised', '--z-sticky', '--z-header', '--z-drawer',
      '--z-dropdown', '--z-popover', '--z-overlay', '--z-modal', '--z-toast', '--z-tooltip',
    ],
  },
  {
    title: 'Floating geometry',
    note: 'Viewport-relative, so these cannot come from the 4px grid.',
    vars: [
      '--modal-w', '--modal-max-h', '--sheet-max-h', '--drawer-max-h',
      '--menu-min-w', '--popover-min-w', '--popover-max-h',
      '--composer-max-h', '--composer-max-h-md', '--composer-w-mobile',
    ],
  },
];

const TYPE_STEPS = [
  ['text-display', 'Display'],
  ['text-page-title', 'Page title'],
  ['text-section-title', 'Section title'],
  ['text-card-title', 'Card title'],
  ['text-body', 'Body'],
  ['text-body-sm', 'Body small'],
  ['text-label', 'Label'],
  ['text-mono', 'Mono'],
  ['text-caption', 'Caption'],
  ['text-micro', 'Micro'],
];

const SURFACES = ['--bg-canvas', '--bg-base', '--bg-surface', '--bg-surface-raised', '--bg-overlay'];
const INKS = ['--text-primary', '--text-secondary', '--text-tertiary', '--text-disabled'];

/** null until the browser has resolved the token — true on the server render. */
function parseColor(value) {
  if (!value) return null;
  const v = value.trim();
  const hex = v.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    const s = hex[1];
    const full = s.length === 3 || s.length === 4
      ? s.split('').map((c) => c + c).join('')
      : s;
    const n = parseInt(full.slice(0, 6), 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255, a: full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1 };
  }
  const fn = v.match(/^rgba?\(([^)]+)\)$/i);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }
  return null;
}

function over(color, backdrop) {
  if (!color || color.a >= 1) return color;
  return {
    r: color.r * color.a + backdrop.r * (1 - color.a),
    g: color.g * color.a + backdrop.g * (1 - color.a),
    b: color.b * color.a + backdrop.b * (1 - color.a),
    a: 1,
  };
}

function luminance(c) {
  const ch = [c.r, c.g, c.b].map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

function ratio(fg, bg) {
  if (!fg || !bg) return null;
  const a = luminance(fg);
  const b = luminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function grade(r) {
  if (r == null) return { label: 'n/a', className: 'text-ink-subtle' };
  if (r >= 7) return { label: 'AAA', className: 'text-success' };
  if (r >= 4.5) return { label: 'AA', className: 'text-success' };
  if (r >= 3) return { label: 'AA large', className: 'text-warning' };
  return { label: 'fail', className: 'text-danger' };
}

function useResolvedVars(names) {
  const [values, setValues] = useState({});
  const key = names.join('|');
  useEffect(() => {
    const cs = getComputedStyle(document.documentElement);
    const next = {};
    for (const n of key.split('|')) next[n] = cs.getPropertyValue(n).trim();
    setValues(next);
  }, [key]);
  return values;
}

function Section({ id, title, note, children }) {
  return (
    <section className="space-y-4" aria-labelledby={id}>
      <header className="space-y-1">
        <h2 id={id} className="text-section-title text-ink">
          {title}
        </h2>
        {note ? <p className="text-body-sm max-w-3xl text-ink-muted">{note}</p> : null}
      </header>
      {children}
    </section>
  );
}

function TokenList({ vars }) {
  const values = useResolvedVars(vars);
  return (
    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {vars.map((name) => (
        <li
          key={name}
          className="flex items-center gap-3 rounded-lg border border-line bg-well px-3 py-2"
        >
          <span
            aria-hidden="true"
            className="size-6 shrink-0 rounded-sm border border-line-strong"
            style={{ background: `var(${name})` }}
          />
          <span className="min-w-0 flex-1">
            <span className="text-label block truncate text-ink">{name}</span>
            <span className="text-mono block truncate text-ink-subtle">{values[name] || '—'}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Renders a probe with a real utility class and reports what the browser made of it. */
function Measure({ probe, property, round = false }) {
  const [value, setValue] = useState(null);
  useEffect(() => {
    const node = document.createElement('span');
    node.className = probe;
    // A height utility on an inline box does nothing, so the probe has to be a
    // box for the measurement to mean anything.
    node.style.display = 'inline-flex';
    node.style.position = 'absolute';
    node.style.visibility = 'hidden';
    node.textContent = 'Ag';
    document.body.appendChild(node);
    const raw =
      property === 'height' ? node.getBoundingClientRect().height : getComputedStyle(node)[property];
    document.body.removeChild(node);
    setValue(round ? `${Math.round(Number(raw))}px` : String(raw));
  }, [probe, property, round]);
  return <span className="text-mono text-ink-subtle">{value ?? '…'}</span>;
}

function TypeRamp() {
  return (
    <div className="overflow-x-auto rounded-lg border border-line">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-line bg-well">
            {['Class', 'Rendered', 'Size', 'Line height', 'Weight'].map((h) => (
              <th key={h} className="text-label px-3 py-2 font-medium text-ink-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TYPE_STEPS.map(([cls, label]) => (
            <tr key={cls} className="border-b border-line-subtle last:border-b-0">
              <td className="px-3 py-2.5">
                <code className="text-mono text-ink-muted">{`.${cls}`}</code>
              </td>
              <td className={cn('px-3 py-2.5 text-ink', cls)}>{label}</td>
              <td className="px-3 py-2.5">
                <Measure probe={cls} property="fontSize" />
              </td>
              <td className="px-3 py-2.5">
                <Measure probe={cls} property="lineHeight" />
              </td>
              <td className="px-3 py-2.5">
                <Measure probe={cls} property="fontWeight" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * WCAG 1.4.3 exempts inactive UI: a disabled-text token is *supposed* to be
 * faint, so grading it as body text produces a permanent red cell and trains
 * reviewers to ignore the matrix. Exempt rows still print their ratio.
 */
const CONTRAST_EXEMPT = new Set(['--text-disabled']);

function ContrastMatrix() {
  const values = useResolvedVars([...SURFACES, ...INKS, '--accent-primary', '--text-on-accent']);
  const cells = [];
  for (const ink of INKS) {
    for (const surface of SURFACES) {
      const bg = parseColor(values[surface]);
      const fg = over(parseColor(values[ink]), bg);
      const r = ratio(fg, bg);
      const exempt = CONTRAST_EXEMPT.has(ink);
      cells.push({ ink, surface, r, exempt, g: exempt ? { label: 'exempt', className: 'text-ink-subtle' } : grade(r) });
    }
  }
  const accent = parseColor(values['--accent-primary']);
  const onAccent = over(parseColor(values['--text-on-accent']), accent);
  const onAccentRatio = ratio(onAccent, accent);

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line bg-well">
              <th className="text-label px-3 py-2 font-medium text-ink-muted">Token</th>
              {SURFACES.map((s) => (
                <th key={s} className="text-label px-3 py-2 text-left font-medium text-ink-muted">
                  {s.replace('--bg-', '')}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {INKS.map((ink) => (
              <tr key={ink} className="border-b border-line-subtle last:border-b-0">
                <td className="px-3 py-2">
                  <code className="text-mono text-ink">{ink}</code>
                </td>
                {SURFACES.map((surface) => {
                  const cell = cells.find((c) => c.ink === ink && c.surface === surface);
                  return (
                    <td key={surface} className="px-3 py-2">
                      <span className="text-body-sm tabular-nums">
                        {cell.r == null ? '—' : cell.r.toFixed(2)}
                      </span>
                      <span className={cn('text-caption ml-2 font-medium', cell.g.className)}>
                        {cell.g.label}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-body-sm text-ink-muted">
        Text on the brand accent:{' '}
        <span className="text-mono text-ink">{onAccentRatio ? onAccentRatio.toFixed(2) : '—'}</span>{' '}
        <span className={cn('font-medium', grade(onAccentRatio).className)}>{grade(onAccentRatio).label}</span>
        {' — '}
        <span className="text-ink-subtle">
          --text-disabled is exempt from WCAG 1.4.3 (inactive controls) and is listed for completeness.
        </span>
      </p>
    </div>
  );
}

function ControlHeights() {
  return (
    <div className="flex flex-wrap items-end gap-4">
      {['xs', 'sm', 'md', 'lg'].map((size) => (
        <div key={size} className="space-y-2 text-center">
          <Button size={size} variant="secondary">
            {size}
          </Button>
          <p className="text-caption text-ink-subtle">
            <Measure probe={`h-control-${size}`} property="height" round />
          </p>
        </div>
      ))}
    </div>
  );
}

function Geometry() {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {GEOMETRY_GROUPS.map((group) => (
        <Card key={group.title} padding="md" className="space-y-3">
          <CardHeader>
            <CardTitle className="text-body font-semibold">{group.title}</CardTitle>
            {group.note ? <CardDescription>{group.note}</CardDescription> : null}
          </CardHeader>
          <CardContent>
            <TokenList vars={group.vars} />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function Buttons() {
  const variants = ['primary', 'secondary', 'tertiary', 'outline', 'danger'];
  return (
    <div className="space-y-6">
      {variants.map((variant) => (
        <div key={variant} className="flex flex-wrap items-center gap-3">
          <span className="text-label w-24 shrink-0 text-ink-subtle">{variant}</span>
          {['xs', 'sm', 'md', 'lg'].map((size) => (
            <Button key={size} variant={variant} size={size}>
              {size}
            </Button>
          ))}
          <Button variant={variant} size="md" loading>
            loading
          </Button>
          <Button variant={variant} size="md" disabled>
            disabled
          </Button>
        </div>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-label w-24 shrink-0 text-ink-subtle">icon</span>
        {['icon-sm', 'icon-md', 'icon-lg'].map((size) => (
          <Button key={size} variant="tertiary" size={size} aria-label={size}>
            <Sparkles className="size-4" strokeWidth={1.8} />
          </Button>
        ))}
        <span className="text-caption text-ink-subtle">
          16px glyph, hit area follows the control contract (PART 10)
        </span>
      </div>
    </div>
  );
}

function Fields() {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="ds-input">Input</Label>
        <Input id="ds-input" placeholder="Search creations" />
        <FieldMessage>Muted helper text uses --text-tertiary.</FieldMessage>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ds-invalid" required>
          Invalid state
        </Label>
        <Input id="ds-invalid" invalid defaultValue="never-persisted" />
        <FieldMessage tone="danger">
          The red border is never the only signal — a message always accompanies it.
        </FieldMessage>
      </div>
      <div className="space-y-2">
        <Label htmlFor="ds-textarea">Textarea</Label>
        <Textarea id="ds-textarea" rows={3} placeholder="Describe the shot" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="ds-select">Select</Label>
        <Select defaultValue="flux-pro">
          <SelectTrigger id="ds-select">
            <SelectValue placeholder="Choose a model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="flux-pro">FLUX.1 Pro</SelectItem>
            <SelectItem value="flux-dev">FLUX.1 Dev</SelectItem>
            <SelectItem value="sd-35">Stable Diffusion 3.5</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

function Overlays() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Menu>
        <MenuTrigger asChild>
          <Button variant="secondary">Dropdown menu</Button>
        </MenuTrigger>
        <MenuContent>
          <MenuLabel>Generate with</MenuLabel>
          <MenuItem>
            <ImageIcon className="size-4" strokeWidth={1.8} /> Image
          </MenuItem>
          <MenuItem>
            <Play className="size-4" strokeWidth={1.8} /> Video
          </MenuItem>
          <MenuSeparator />
          <MenuItem>
            <Mic className="size-4" strokeWidth={1.8} /> Audio
          </MenuItem>
        </MenuContent>
      </Menu>

      <PopoverRoot>
        <PopoverTrigger asChild>
          <Button variant="outline">Popover</Button>
        </PopoverTrigger>
        <PopoverContent className="w-64">
          <p className="text-body-sm text-ink-muted">
            Popovers use --bg-overlay-glass and cap at --popover-max-h so a long parameter list
            never covers the canvas.
          </p>
        </PopoverContent>
      </PopoverRoot>

      <Tooltip content="Tooltips sit above modals on the ladder">
        <Button variant="tertiary">Tooltip</Button>
      </Tooltip>

      <Modal>
        <ModalContent
          title="Standard dialog"
          description="Centred on desktop, bottom sheet below the md breakpoint."
          size="md"
        >
          <p className="text-body-sm text-ink-muted">
            Width resolves from --modal-w and height from --modal-max-h, so a dialog can never sit
            flush against the viewport edge.
          </p>
          <ModalFooter>
            <Button variant="tertiary">Cancel</Button>
            <Button variant="primary">Confirm</Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}

function Selection() {
  const [tab, setTab] = useState('image');
  const [mode, setMode] = useState('fast');
  return (
    <div className="space-y-6">
      <Tabs defaultValue="usage">
        <TabsList>
          <TabsTrigger value="usage">Usage</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="w-full max-w-sm">
        <SegmentedControl
          ariaLabel="Generation mode"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'fast', label: 'Fast' },
            { value: 'quality', label: 'Quality' },
          ]}
        />
      </div>
      <div className="max-w-md">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList variant="segmented">
            <TabsTrigger value="image" variant="segmented">
              <ImageIcon className="size-4" strokeWidth={1.8} /> Image
            </TabsTrigger>
            <TabsTrigger value="video" variant="segmented">
              <Play className="size-4" strokeWidth={1.8} /> Video
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
    </div>
  );
}

function Status() {
  const statuses = ['queued', 'uploading', 'generating', 'completed', 'failed', 'cancelled'];
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {statuses.map((s) => (
          <StatusBadge key={s} status={s} />
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {['neutral', 'brand', 'success', 'warning', 'danger', 'info', 'outline'].map((tone) => (
          <Badge key={tone} tone={tone}>
            {tone}
          </Badge>
        ))}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <Alert tone="info" icon={<Boxes className="size-4" strokeWidth={1.8} />} title="Rendering">
          Queue position is shown as text, never colour alone.
        </Alert>
        <Alert tone="warning" icon={<AlertTriangle className="size-4" strokeWidth={1.8} />} title="Low credits">
          Warning carries an icon and a sentence, so it survives greyscale.
        </Alert>
      </div>
      <div className="space-y-3">
        <div className="flex items-center gap-4">
          <Spinner size="sm" />
          <Spinner size="md" />
          <Spinner size="lg" className="text-brand" />
        </div>
        <Progress value={62} label="Compositing" showValue />
        <Progress value={30} tone="success" label="Uploaded" />
        <div className="grid max-w-sm grid-cols-2 gap-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      </div>
      <EmptyState
        icon={<Gem className="size-5" strokeWidth={1.8} />}
        title="No renders yet"
        description="Generate something and it will appear here."
        action={<Button variant="primary">Create the first one</Button>}
      />
    </div>
  );
}

const INLINE_COMPOSER_POSITION = 'relative w-full';

function Composer() {
  const [prompt, setPrompt] = useState(
    'A cinematic portrait of an AI creator in a minimal technical studio, soft directional key light, shallow depth of field.',
  );
  const [model, setModel] = useState('flux-pro');
  const [ratio, setRatio] = useState('16:9');
  return (
    <div className="bg-base flex min-h-64 items-end justify-center rounded-xl border border-line p-4">
      <PromptComposer positionClassName={INLINE_COMPOSER_POSITION}>
        <PromptTextarea
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder="Describe what you want to make"
        />
        <PromptFooter>
          <PromptControls>
            <button
              type="button"
              className={promptMediaButtonClassName()}
              aria-label="Attach a reference image"
            >
              <Plus className="size-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              className={promptControlClassName({ active: model === 'flux-pro' })}
              onClick={() => setModel(model === 'flux-pro' ? 'sd-35' : 'flux-pro')}
            >
              <PromptQualityIcon />
              {model === 'flux-pro' ? 'FLUX.1 Pro' : 'SD 3.5'}
            </button>
            <button
              type="button"
              className={promptControlClassName()}
              onClick={() => setRatio(ratio === '16:9' ? '1:1' : '16:9')}
            >
              <PromptAspectRatioIcon className="size-3.5" />
              {ratio}
            </button>
          </PromptControls>
          <PromptAction>
            Generate
          </PromptAction>
        </PromptFooter>
      </PromptComposer>
    </div>
  );
}

export default function DesignSystemGallery() {
  return (
    <main className="bg-canvas text-ink mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-8 md:px-8 md:py-12">
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-page-title">KOYO Studio Design System</h1>
          <Badge tone="brand">tokens v3</Badge>
        </div>
        <p className="text-body-sm max-w-3xl text-ink-muted">
          Direction: Premium AI Creative Workspace — professional, cinematic, minimal, dense but
          breathable, quiet, technical, dark-first, creator-first. Every value on this page is read
          back from the browser with getComputedStyle, so it reports what actually renders rather
          than what a document claims.
        </p>
      </header>

      <Section id="ds-color" title="Colour" note="app/globals.css is the only source of truth; tailwind.config.js maps names onto these variables and contains no literal value of its own.">
        <div className="space-y-8">
          {TOKEN_GROUPS.map((group) => (
            <div key={group.title} className="space-y-3">
              <h3 className="text-label text-ink-muted">
                {group.title}
                <span className="ml-2 font-normal text-ink-subtle">{group.note}</span>
              </h3>
              <TokenList vars={group.vars} />
            </div>
          ))}
        </div>
      </Section>

      <Section id="ds-contrast" title="Contrast, measured" note="WCAG 2.2 AA is verified arithmetically from the tokens above, not judged by eye.">
        <ContrastMatrix />
      </Section>

      <Section id="ds-type" title="Typography" note="One ramp of ten steps, floor at text-micro. Line height, tracking and weight travel with the size, so a text-* class is complete on its own.">
        <TypeRamp />
      </Section>

      <Section id="ds-geometry" title="Geometry, motion and layers">
        <Geometry />
      </Section>

      <Section id="ds-controls" title="Control heights" note="The four allowed heights, measured from the rendered DOM.">
        <ControlHeights />
      </Section>

      <Section id="ds-buttons" title="Buttons" note="variant=primary is reserved for the single main action of a view.">
        <Buttons />
      </Section>

      <Section id="ds-fields" title="Fields">
        <Fields />
      </Section>

      <Section id="ds-overlays" title="Overlays" note="Scrim, dropdown, popover, tooltip, dialog and drawer each own one rung of the layer ladder.">
        <Overlays />
      </Section>

      <Section id="ds-selection" title="Selection">
        <Selection />
      </Section>

      <Section id="ds-status" title="Status, feedback and empties">
        <Status />
      </Section>

      <Section id="ds-composer" title="Prompt Composer" note="The product's first-class component: 38px pills, 38px media slots, one glass panel, no per-studio variant.">
        <Composer />
      </Section>
    </main>
  );
}
