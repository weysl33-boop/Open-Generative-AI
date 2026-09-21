import {
  Badge as StudioBadge,
  StatusBadge as StudioStatusBadge,
} from "studio/ui/surface";

/**
 * App-side face of the single badge primitive. Only the legacy `variant`
 * vocabulary is translated here; the recipe — including the 4px radius that
 * --radius-xs documents for badges — lives in studio/ui/surface.
 *
 * `default`, `secondary` and `neutral` were three names for one grey chip; they
 * now resolve to the same tone, which is the point of the exercise.
 */
const TONE_ALIAS = {
  default: "neutral",
  secondary: "neutral",
  neutral: "neutral",
  accent: "brand",
  brand: "brand",
  destructive: "danger",
};

function Badge({ variant, tone, ...props }) {
  const key = variant || tone || "neutral";
  return <StudioBadge tone={TONE_ALIAS[key] || key} {...props} />;
}

function StatusBadge({ status, ...props }) {
  return <StudioStatusBadge status={status} {...props} />;
}

export { Badge, StatusBadge };
export default Badge;
