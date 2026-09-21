/**
 * Model description metadata and capability tags for Image Studio models.
 * Aligns with high-quality UI representations (e.g. Figure 1).
 */

export const MODEL_DESCRIPTIONS = {
  // ── Seedream / ByteDance 系列 ──
  "seedream-5.0": {
    zh: "更强的一致性、细节丰富度与图文响应能力，支持多参考图",
    en: "Enhanced consistency, detail richness, and prompt responsiveness.",
    tag: "Pro",
    badge: "5.0 Pro",
    recommended: true,
  },
  "bytedance-seedream-5.0-pro": {
    zh: "专业级画质，强化一致性、风格与多图语义理解",
    en: "Professional grade quality, enhanced consistency & multi-image understanding.",
    tag: "Pro",
    badge: "5.0 Pro",
    recommended: true,
  },
  "bytedance-seedream-v5.0": {
    zh: "全面升级的通用图像生成，兼顾构图美感与文字渲染",
    en: "Comprehensive universal image generation with great composition & text rendering.",
    tag: "Pro",
    badge: "5.0",
  },
  "bytedance-seedream-v4.5": {
    zh: "强化一致性、风格与图文响应，画面质感细腻",
    en: "Enhanced consistency, style, and text-to-image response.",
    tag: "4.5",
    badge: "4.5",
  },
  "bytedance-seedream-v4": {
    zh: "支持多参考图、系列组图生成，美学多样性表现出众",
    en: "Supports multiple reference images and sequential image generation.",
    tag: "4.0",
    badge: "4.0",
  },
  "bytedance-seedream-v3": {
    zh: "影视质感，文字更准，直出 2K 高清图",
    en: "Cinematic texture, accurate text rendering, native 2K HD.",
    tag: "3.0",
    badge: "3.0",
  },

  // ── Flux 系列 ──
  "flux-2-klein": {
    zh: "极速高精度渲染，擅长超写实细节与复杂构图",
    en: "Ultra-fast high-precision rendering, realistic details and complex composition.",
    tag: "Klein",
    badge: "2.0",
    recommended: true,
  },
  "flux-2-klein-4b": {
    zh: "轻量高效，极速生成超高质感写实人像与概念设计",
    en: "Lightweight & efficient, rapid realistic portrait & concept design.",
    tag: "4B",
    badge: "Klein 4B",
  },
  "flux-2-klein-9b": {
    zh: "大参数量旗舰，顶尖美学表现与多风格自由探索",
    en: "Flagship 9B parameters, top-tier aesthetic performance.",
    tag: "9B",
    badge: "Klein 9B",
  },
  "flux-dev": {
    zh: "开源界顶尖生图基底，解剖结构与光影质感出众",
    en: "Top-tier open foundation model, superior anatomy and lighting.",
    tag: "Dev",
    badge: "Dev",
  },

  // ── Midjourney 系列 ──
  "midjourney-v7": {
    zh: "顶尖艺术质感与审美，支持角色一致性与风格参考",
    en: "Top artistic aesthetics, supports character and style references.",
    tag: "v7",
    badge: "v7",
    recommended: true,
  },
  "midjourney-v6": {
    zh: "经典高审美模型，真实光影与摄影级画质",
    en: "Classic high-aesthetic model, photorealistic lighting.",
    tag: "v6",
    badge: "v6",
  },

  // ── Stability AI / SDXL ──
  "sdxl": {
    zh: "经典高扩展性底模，支持丰富艺术风格与精准结构控制",
    en: "Classic high-extensibility base model with rich style support.",
    tag: "SDXL",
    badge: "1.0",
  },

  // ── Kling / 快手可灵 ──
  "kling-o1": {
    zh: "电影级镜头感与光影渲染，高保真人像表现",
    en: "Cinematic framing, lighting rendering, and high-fidelity portraits.",
    tag: "O1",
    badge: "O1",
  },
  "kling-o3": {
    zh: "新一代自研多模态图像生成，超高细节与材质真实度",
    en: "Next-gen multimodal generation with superior detail and textures.",
    tag: "O3",
    badge: "O3",
    recommended: true,
  },

  // ── Qwen / 阿里通义 ──
  "qwen-image-2.0": {
    zh: "强大的中英文文字渲染与复杂语义理解，支持高分辨率直出",
    en: "Superior bilingual text rendering & complex prompt comprehension.",
    tag: "2.0",
    badge: "2.0 Pro",
  },
  "qwen-plus": {
    zh: "专业级图像编辑与主体参考，保持元素高度一致",
    en: "Professional image editing and subject reference consistency.",
    tag: "Plus",
    badge: "Plus",
  },

  // ── MiniMax / 海螺 ──
  "minimax-image-01": {
    zh: "自研多模态生图底座，擅长主体参考与艺术视觉风格",
    en: "Proprietary multimodal model, strong subject reference & art styles.",
    tag: "01",
    badge: "01",
  },

  // ── Google Imagen ──
  "google-imagen4": {
    zh: "Google 最新 Imagen 4 引擎，超高画质与逼真照片感",
    en: "Google Imagen 4 engine, ultra-high fidelity and photorealism.",
    tag: "Imagen 4",
    badge: "Ultra",
  },

  // ── Wan ──
  "wan2.7": {
    zh: "超高分辨率图像生成与多风格创作，色彩表现亮丽",
    en: "Ultra-high resolution image generation with vibrant colors.",
    tag: "2.7",
    badge: "2.7",
  },
};

/**
 * Get description for a model family or variant ID.
 */
export function getModelDescription(modelId, locale = "zh") {
  if (!modelId) return "";
  const cleanId = modelId.toLowerCase().replace(/-edit$/, "").replace(/-(t2i|i2i)$/, "");
  
  for (const [key, val] of Object.entries(MODEL_DESCRIPTIONS)) {
    if (cleanId === key || cleanId.includes(key) || key.includes(cleanId)) {
      return locale.startsWith("zh") ? val.zh : val.en;
    }
  }

  return locale.startsWith("zh")
    ? "专业多模态高品质图像生成底座"
    : "Professional multimodal high-quality image generation model.";
}

/**
 * Get badge or tag for a model family.
 */
export function getModelBadge(modelId) {
  if (!modelId) return null;
  const cleanId = modelId.toLowerCase().replace(/-edit$/, "").replace(/-(t2i|i2i)$/, "");
  
  for (const [key, val] of Object.entries(MODEL_DESCRIPTIONS)) {
    if (cleanId === key || cleanId.includes(key) || key.includes(cleanId)) {
      return val.badge || val.tag || null;
    }
  }
  return null;
}
