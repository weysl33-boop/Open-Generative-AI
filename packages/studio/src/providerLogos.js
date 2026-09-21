// Centralized Provider Logos and Styles configuration for ImageStudio and VideoStudio
// Supports local SVGs as fallback to avoid 403 / 404 CDN missing issues.

export const KREA_LOGO = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgNTEyIDUxMiIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiIGNsaXAtcnVsZT0iZXZlbm9kZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgc3Ryb2tlLW1pdGVybGltaXQ9IjIiPjxnIHRyYW5zZm9ybT0ic2NhbGUoMzIpIj48Y2xpcFBhdGggaWQ9InByZWZpeF9fYSI+PHBhdGggZD0iTTAgMGgxNnYxNkgweiIvPjwvY2xpcFBhdGg+PGcgY2xpcC1wYXRoPSJ1cmwoI3ByZWZpeF9fYSkiPjxwYXRoIGQ9Ik00Ljk0Ny4wMTFDNi4yNTEtLjA4IDcuNDAxLjgyNyA3LjU3IDIuMDhjLjE2IDEuMTktLjY1NSAyLjM0LTEuODc5IDIuNjEtLjMwNy4wNjgtLjY0Ny4wNDktLjk3Mi4wOS0uNzY4LjA5LTEuNDgzLjQ0LTIuMDI4Ljk4OWwtLjAwNy4wMDNoLS4wMDZsLS4wMDUtLjAwNS0uMDAyLS4wMDYuMDAzLS4wMTJhLjAzLjAzIDAgMDAuMDA2LS4wMTZDMi42NyA0LjYxNSAyLjY2OCAzLjQ5OCAyLjY3IDIuMzggMi42NzMgMS4xNCAzLjY1Mi4xMDMgNC45NDcuMDF6Ii8+PHBhdGggZD0iTTUuMDg1IDEwLjM3NUMzLjQyNiAxMC4zNiAyLjIzNyA4LjcyOCAyLjgxNSA3LjJhMi40NDcgMi40NDcgMCAwMTIuMDM0LTEuNTU4Yy4yODQtLjAzLjYyNC0uMDIyLjg5Ny0uMDcyIDEuNDAzLS4yNiAyLjQ4Ny0xLjMzNCAyLjcwNS0yLjcuMDQ5LS4zMDIuMDIzLS42NjQuMDk1LS45ODUuMzMxLTEuNDg4IDIuMDM3LTIuMzIzIDMuNDY5LTEuNjVhMi4zOTMgMi4zOTMgMCAwMTEuMzcgMS44MDZjLjAyNS4xNjIuMDM0LjM2My4wMjUuNjAzLS4xNjIgNC4zMTItMy44NDUgNy43NjUtOC4zMjUgNy43MjhtMi4wOS42ODdhLjAyOS4wMjkgMCAwMS0uMDE2LS4wMTV2LS4wMDRsLjAwMS0uMDA0YzAtLjAwMiAwLS4wMDMuMDAyLS4wMDRsLjAwNC0uMDAyYTkuMzc1IDkuMzc1IDAgMDA0LjQyMy0yLjM1Yy4wMjItLjAyMS4wNDMtLjAyLjA2Mi4wMDQuMTk5LjI2NC40MDguNTQ3LjU3NS44MTdhNy44MjcgNy44MjcgMCAwMTEuMTg3IDQuMjE0Yy0uMDYyIDEuMjU5LTEuMTE0IDIuMjczLTIuNDQzIDIuMjgtMS4xNzUuMDA4LTIuMjA5LS43OTQtMi40MzEtMS45MTYtLjA1NC0uMjY2LS4wMzgtLjYzMy0uMDgyLS45MTRhMy4xNzEgMy4xNzEgMCAwMC0xLjI2Ni0yLjA5NmwtLjAxNi0uMDF6bS0yLjQ4NyA0LjkwMWMtLjk5OS0uMTczLTEuODAyLS45NDktMS45ODEtMS45MTQtLjAyOS0uMi0uMDQxLS40MDEtLjAzNy0uNjAzdi0zLjE5YzAtLjAxMS4wMDMtLjAxMy4wMTEtLjAwNi42NTMuNTggMS4zNC45MzUgMi4yMzYuOTkzbC4yNC4wMDhjMS4xNjcuMDM4IDIuMTU2LjgwMiAyLjM4NCAxLjkxMy4zMzcgMS42NDMtMS4xNSAzLjA5Ny0yLjg1NCAyLjhoLjAwMXoiLz48L2c+PC9nPjwvc3ZnPg==";
export const META_LOGO = "data:image/svg+xml;base64,PHN2ZyBpZD0iTGF5ZXJfMSIgZGF0YS1uYW1lPSJMYXllciAxIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHhtbG5zOnhsaW5rPSJodHRwOi8vd3d3LnczLm9yZy8xOTk5L3hsaW5rIiB2aWV3Qm94PSIwIDAgMjg3LjU2IDE5MSI+PGRlZnM+PHN0eWxlPi5jbHMtMXtmaWxsOiMwMDgxZmI7fS5jbHMtMntmaWxsOnVybCgjbGluZWFyLWdyYWRpZW50KTt9LmNscy0ze2ZpbGw6dXJsKCNsaW5lYXItZ3JhZGllbnQtMik7fTwvc3R5bGU+PGxpbmVhckdyYWRpZW50IGlkPSJsaW5lYXItZ3JhZGllbnQiIHgxPSI2Mi4zNCIgeTE9IjEwMS40NSIgeDI9IjI2MC4zNCIgeTI9IjkxLjQ1IiBncmFkaWVudFRyYW5zZm9ybT0ibWF0cml4KDEsIDAsIDAsIC0xLCAwLCAxOTIpIiBncmFkaWVudFVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHN0b3Agb2Zmc2V0PSIwIiBzdG9wLWNvbG9yPSIjMDA2NGUxIi8+PHN0b3Agb2Zmc2V0PSIwLjQiIHN0b3AtY29sb3I9IiMwMDY0ZTEiLz48c3RvcCBvZmZzZXQ9IjAuODMiIHN0b3AtY29sb3I9IiMwMDczZWUiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMDgyZmIiLz48L2xpbmVhckdyYWRpZW50PjxsaW5lYXJHcmFkaWVudCBpZD0ibGluZWFyLWdyYWRpZW50LTIiIHgxPSI0MS40MiIgeTE9IjUzIiB4Mj0iNDEuNDIiIHkyPSIxMjYiIGdyYWRpZW50VHJhbnNmb3JtPSJtYXRyaXgoMSwgMCwgMCwgLTEsIDAsIDE5MikiIGdyYWRpZW50VW5pdHM9InVzZXJTcGFjZU9uVXNlIj48c3RvcCBvZmZzZXQ9IjAiIHN0b3AtY29sb3I9IiMwMDgyZmIiLz48c3RvcCBvZmZzZXQ9IjEiIHN0b3AtY29sb3I9IiMwMDY0ZTAiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48dGl0bGU+ZmFjZWJvb2stbWV0YTwvdGl0bGU+PHBhdGggY2xhc3M9ImNscy0xIiBkPSJNMzEuMDYsMTI2YzAsMTEsMi40MSwxOS40MSw1LjU2LDI0LjUxQTE5LDE5LDAsMCwwLDUzLjE5LDE2MGM4LjEsMCwxNS41MS0yLDI5Ljc5LTIxLjc2LDExLjQ0LTE1LjgzLDI0LjkyLTM4LDM0LTUybDE1LjM2LTIzLjZjMTAuNjctMTYuMzksMjMtMzQuNjEsMzcuMTgtNDdDMTgxLjA3LDUuNiwxOTMuNTQsMCwyMDYuMDksMGMyMS4wNywwLDQxLjE0LDEyLjIxLDU2LjUsMzUuMTEsMTYuODEsMjUuMDgsMjUsNTYuNjcsMjUsODkuMjcsMCwxOS4zOC0zLjgyLDMzLjYyLTEwLjMyLDQ0Ljg3QzI3MSwxODAuMTMsMjU4LjcyLDE5MSwyMzguMTMsMTkxVjE2MGMxNy42MywwLDIyLTE2LjIsMjItMzQuNzQsMC0yNi40Mi02LjE2LTU1Ljc0LTE5LjczLTc2LjY5LTkuNjMtMTQuODYtMjIuMTEtMjMuOTQtMzUuODQtMjMuOTQtMTQuODUsMC0yNi44LDExLjItNDAuMjMsMzEuMTctNy4xNCwxMC42MS0xNC40NywyMy41NC0yMi43LDM4LjEzbC05LjA2LDE2Yy0xOC4yLDMyLjI3LTIyLjgxLDM5LjYyLTMxLjkxLDUxLjc1Qzg0Ljc0LDE4Myw3MS4xMiwxOTEsNTMuMTksMTkxYy0yMS4yNywwLTM0LjcyLTkuMjEtNDMtMjMuMDlDMy4zNCwxNTYuNiwwLDE0MS43NiwwLDEyNC44NVoiLz48cGF0aCBjbGFzcz0iY2xzLTIiIGQ9Ik0yNC40OSwzNy4zQzM4LjczLDE1LjM1LDU5LjI4LDAsODIuODUsMGMxMy42NSwwLDI3LjIyLDQsNDEuMzksMTUuNjEsMTUuNSwxMi42NSwzMiwzMy40OCw1Mi42Myw2Ny44MWw3LjM5LDEyLjMyYzE3Ljg0LDI5LjcyLDI4LDQ1LDMzLjkzLDUyLjIyLDcuNjQsOS4yNiwxMywxMiwxOS45NCwxMiwxNy42MywwLDIyLTE2LjIsMjItMzQuNzRsMjcuNC0uODZjMCwxOS4zOC0zLjgyLDMzLjYyLTEwLjMyLDQ0Ljg3QzI3MSwxODAuMTMsMjU4LjcyLDE5MSwyMzguMTMsMTkxYy0xMi44LDAtMjQuMTQtMi43OC0zNi42OC0xNC42MS05LjY0LTkuMDgtMjAuOTEtMjUuMjEtMjkuNTgtMzkuNzFMMTQ2LjA4LDkzLjZjLTEyLjk0LTIxLjYyLTI0LjgxLTM3Ljc0LTMxLjY4LTQ1QzEwNyw0MC43MSw5Ny41MSwzMS4yMyw4Mi4zNSwzMS4yM2MtMTIuMjcsMC0yMi42OSw4LjYxLTMxLjQxLDIxLjc4WiIvPjxwYXRoIGNsYXNzPSJjbHMtMyIgZD0iTTgyLjM1LDMxLjIzYy0xMi4yNywwLTIyLjY5LDguNjEtMzEuNDEsMjEuNzhDMzguNjEsNzEuNjIsMzEuMDYsOTkuMzQsMzEuMDYsMTI2YzAsMTEsMi40MSwxOS40MSw1LjU2LDI0LjUxTDEwLjE0LDE2Ny45MUMzLjM0LDE1Ni42LDAsMTQxLjc2LDAsMTI0Ljg1LDAsOTQuMSw4LjQ0LDYyLjA1LDI0LjQ5LDM3LjMsMzguNzMsMTUuMzUsNTkuMjgsMCw4Mi44NSwwWiIvPjwvc3ZnPg==";
export const TOPAZ_LOGO = "data:image/svg+xml;base64,PHN2ZyBmaWxsPSJjdXJyZW50Q29sb3IiIGZpbGwtcnVsZT0iZXZlbm9kZCIgaGVpZ2h0PSIxZW0iIHN0eWxlPSJmbGV4Om5vbmU7bGluZS1oZWlnaHQ6MSIgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMWVtIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjx0aXRsZT5Ub3BhekxhYnM8L3RpdGxlPjxwYXRoIGQ9Ik0yIDE1LjM1N1YyMmg2LjY1di02LjY0M0gyek0xNS4zMiAxNS4zNTdWOC43MTRIOC42N3Y2LjY0M2g2LjY1ek0yMiA4LjY0M1YyaC02LjY1djYuNjQzSDIyeiI+PC9wYXRoPjwvc3ZnPg==";
export const VOLCENGINE_LOGO = "data:image/svg+xml;base64,PHN2ZyBmaWxsPSJjdXJyZW50Q29sb3IiIGZpbGwtcnVsZT0iZXZlbm9kZCIgaGVpZ2h0PSIxZW0iIHN0eWxlPSJmbGV4Om5vbmU7bGluZS1oZWlnaHQ6MSIgdmlld0JveD0iMCAwIDI0IDI0IiB3aWR0aD0iMWVtIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjx0aXRsZT5Wb2xjZW5naW5lPC90aXRsZT48cGF0aCBkPSJNNy4yOSA1LjM2TDMuMTQ4IDIxLjczN2EuMjE1LjIxNSAwIDAwLjIwMy4yNjFoOC4yOWEuMjE0LjIxNCAwIDAwLjIxNS0uMjYxTDcuNyA1LjM1OWEuMjE0LjIxNCAwIDAwLS40MSAweiIgZmlsbC1vcGFjaXR5PSIuNSI+PC9wYXRoPjxwYXRoIGNsaXAtcnVsZT0iZXZlbm9kZCIgZD0iTTQuNTUzIDE2LjE4bC0xLjQwNiA1LjU1OGEuMjE0LjIxNCAwIDAwLjIwMy4yNjFoMi40Mi00LjU1MWEuMjE0LjIxNCAwIDAxLS4yMTQtLjI2bDIuMjc1LTguOTYxYS4yMTQuMjE0IDAgMDEuNDA5IDBsLjg2NCAzLjQwMnoiPjwvcGF0aD48cGF0aCBkPSJNMTQuNDQuMTVhLjIxNC4yMTQgMCAwMC0uNDEgMEw4LjM2NiAyMS43MzlhLjIxNC4yMTQgMCAwMC4yMTQuMjYxSDE5LjlhLjIxNC4yMTQgMCAwMC4yMTUtLjI2MUwxNC40NC4xNTF6IiBmaWxsLW9wYWNpdHk9Ii41Ij48L3BhdGg+PHBhdGggY2xpcC1ydWxlPSJldmVub2RkIiBkPSJNMTYuNjk0IDIyaDMuMjA3YS4yMTUuMjE1IDAgMDAuMjE0LS4yNjJsLTEuODM5LTYuOTkzIDEuMTY0LTQuNTkyYS4yMTQuMjE0IDAgMDEuNDExIDBsMi45NTEgMTEuNTg2YS4yMTQuMjE0IDAgMDEtLjIxNC4yNjFoLTUuODk0eiI+PC9wYXRoPjxwYXRoIGQ9Ik0xMC4yNzggNy43NDFMNi42ODUgMjEuNzM2YS4yMTQuMjE0IDAgMDAuMjE0LjI2NGg3LjE3YS4yMTYuMjE2IDAgMDAuMjE0LS4xNjYuMjE2LjIxNiAwIDAwMC0uMDk4TDEwLjY4NyA3Ljc0MmEuMjE0LjIxNCAwIDAwLS40MDkgMHoiPjwvcGF0aD48L3N2Zz4=";
export const MMAUDIO_LOGO = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMiAxMHY0Ii8+PHBhdGggZD0iTTYgNnYxMiIvPjxwYXRoIGQ9Ik0xMCAzdjE4Ii8+PHBhdGggZD0iTTE0IDh2OCIvPjxwYXRoIGQ9Ik0xOCA1djE0Ii8+PHBhdGggZD0iTTIyIDEwdjQiLz48L3N2Zz4=";
export const TALK_LOGO = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNMjEgMTVhMiAyIDAgMCAxLTIgMkg3bC00IDRWNWEyIDIgMCAwIDEgMi0yaDE0YTIgMiAwIDAgMSAyIDJ6Ii8+PHBhdGggZD0iTTggOWg4Ii8+PHBhdGggZD0iTTggMTNoNSIvPjwvc3ZnPg==";
export const VIDEO_LOGO = "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHN0cm9rZT0iY3VycmVudENvbG9yIiBzdHJva2Utd2lkdGg9IjIiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB4PSIyIiB5PSI0IiB3aWR0aD0iMTUiIGhlaWdodD0iMTYiIHJ4PSIyIi8+PHBhdGggZD0ibTIyIDctNSA1IDUgNVY3eiIvPjwvc3ZnPg==";

export const PROVIDER_LOGOS = {
  openai: "https://cdn.muapi.ai/models/openai.png",
  google: "https://cdn.muapi.ai/models/gemini.png",
  kling: "https://cdn.muapi.ai/models/kling.png",
  alibaba: "https://cdn.muapi.ai/models/alibaba.png",
  bytedance: "https://cdn.muapi.ai/models/bytedance.png",
  blackforest: "https://cdn.muapi.ai/models/bfl.png",
  minimax: "https://cdn.muapi.ai/models/minimax.png",
  suno: "https://cdn.muapi.ai/models/suno.png",
  anthropic: "https://cdn.muapi.ai/models/claude.png",
  meshy: "https://cdn.muapi.ai/models/meshy-3.png",
  tripo3d: "https://cdn.muapi.ai/models/tripo3d.png",
  grok: "https://cdn.muapi.ai/models/xai.png",
  xai: "https://cdn.muapi.ai/models/xai.png",
  muapi: "https://cdn.muapi.ai/models/muapi.png",
  midjourney: "https://cdn.muapi.ai/models/midjourney.png",
  vidu: "https://cdn.muapi.ai/models/vidu.png",
  runway: "https://cdn.muapi.ai/models/runway.png",
  luma: "https://cdn.muapi.ai/models/luma.png",
  ideogram: "https://cdn.muapi.ai/models/ideogram.png",
  leonardoai: "https://cdn.muapi.ai/models/leonardoai.png",
  hunyuan: "https://cdn.muapi.ai/models/hunyuan.png",
  hidream: "https://cdn.muapi.ai/models/hidream.png",
  lightricks: "https://cdn.muapi.ai/models/lightricks.png",
  pixverse: "https://cdn.muapi.ai/models/pixverse.png",
  reve: "https://cdn.muapi.ai/models/reve.png",
  stability: "https://cdn.muapi.ai/models/stability.png",
  krea: KREA_LOGO,
  meta: META_LOGO,
  topaz: TOPAZ_LOGO,
  volcengine: VOLCENGINE_LOGO,
  "volcengine-lipsync": VOLCENGINE_LOGO,
  "happy-horse": "https://cdn.muapi.ai/models/kling.png",
  mmaudio: MMAUDIO_LOGO,
  "infinite-talk": TALK_LOGO,
  video: VIDEO_LOGO,
};

export const invertLogos = [
  'openai',
  'blackforest',
  'runway',
  'ideogram',
  'lightricks',
  'grok',
  'xai',
  'krea',
  'topaz',
  'volcengine',
  'volcengine-lipsync',
  'mmaudio',
  'infinite-talk',
  'video'
];

export function getProviderLogo(provider) {
  if (!provider) return null;
  const key = String(provider).toLowerCase().trim();
  if (PROVIDER_LOGOS[key]) return PROVIDER_LOGOS[key];
  if (key === 'grok') return PROVIDER_LOGOS.xai;
  if (key === 'xai') return PROVIDER_LOGOS.grok;
  if (key.includes('volcengine')) return VOLCENGINE_LOGO;
  if (key.includes('happy-horse')) return PROVIDER_LOGOS.kling;
  if (key.includes('talk')) return TALK_LOGO;
  if (key.includes('audio')) return MMAUDIO_LOGO;
  return null;
}

export function getProviderStyle(provider) {
  const p = String(provider || '').toLowerCase().trim();
  switch (p) {
    case "grok":
    case "xai":
      return { text: "xI", bg: "bg-orange-500/10 text-orange-400 border-orange-500/25" };
    case "openai":
      return { text: "O", bg: "bg-success-soft text-success border-success-line" };
    case "google":
      return { text: "G", bg: "bg-info-soft text-info border-info-line" };
    case "blackforest":
      return { text: "BF", bg: "bg-warning-soft text-warning border-warning-line" };
    case "bytedance":
      return { text: "BD", bg: "bg-purple-500/10 text-purple-400 border-purple-500/25" };
    case "midjourney":
      return { text: "MJ", bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" };
    case "kling":
      return { text: "KL", bg: "bg-danger-soft text-danger border-danger-line" };
    case "vidu":
      return { text: "VD", bg: "bg-brand-soft text-brand border-brand-line" };
    case "minimax":
      return { text: "MX", bg: "bg-pink-500/10 text-pink-400 border-pink-500/25" };
    case "ideogram":
      return { text: "ID", bg: "bg-yellow-500/10 text-yellow-400 border-yellow-500/25" };
    case "luma":
      return { text: "LM", bg: "bg-teal-500/10 text-teal-400 border-teal-500/25" };
    case "alibaba":
      return { text: "AL", bg: "bg-sky-500/10 text-sky-400 border-sky-500/25" };
    case "leonardoai":
      return { text: "LE", bg: "bg-violet-500/10 text-violet-400 border-violet-500/25" };
    case "stability":
      return { text: "SD", bg: "bg-fuchsia-500/10 text-fuchsia-400 border-fuchsia-500/25" };
    case "krea":
      return { text: "KR", bg: "bg-teal-500/10 text-teal-300 border-teal-500/25" };
    case "meta":
      return { text: "ME", bg: "bg-info-soft text-info border-info-line" };
    case "topaz":
      return { text: "TP", bg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/25" };
    case "happy-horse":
      return { text: "HH", bg: "bg-warning-soft text-warning border-warning-line" };
    case "volcengine":
    case "volcengine-lipsync":
      return { text: "VC", bg: "bg-danger-soft text-danger border-danger-line" };
    case "mmaudio":
      return { text: "MM", bg: "bg-violet-500/10 text-violet-400 border-violet-500/25" };
    case "infinite-talk":
      return { text: "IT", bg: "bg-success-soft text-success border-success-line" };
    case "video":
      return { text: "VD", bg: "bg-sky-500/10 text-sky-400 border-sky-500/25" };
    default:
      const name = provider ? String(provider).toUpperCase() : "AI";
      return { text: name.substring(0, 2), bg: "bg-primary/10 text-primary border-primary/25" };
  }
}
