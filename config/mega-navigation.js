/**
 * Mega Navigation Configuration (参考 Higgsfield.ai 双栏 Mega Menu 模式)
 * 
 * 整合全站一级导航、各模块 Features（工具特性）与 Models（底层模型矩阵）。
 * 支持中英多语言、Badge 状态标识、以及直接携带参数跳转进入工作室。
 */

export const MEGA_NAV_CATEGORIES = [
  {
    id: 'images',
    tabId: 'image', // 默认点击大类时落地的 tab
    label: {
      zh: '图像',
      en: 'Image',
    },
    href: '/studio?tab=image',
    badge: null,
    features: [
      {
        id: 'image',
        tabId: 'image',
        icon: 'image',
        label: {
          zh: '图像工作室',
          en: 'Create Image',
        },
        description: {
          zh: '文本生图与多模型画板',
          en: 'Generate AI images with multi-models',
        },
        badge: 'HOT',
        href: '/studio?tab=image',
      },
      {
        id: 'headshot',
        tabId: 'headshot',
        icon: 'user',
        label: {
          zh: 'AI 肖像',
          en: 'AI Headshot',
        },
        description: {
          zh: '一键生成专业写真与爆头照',
          en: 'Generate professional portraits & headshots',
        },
        badge: 'TOP',
        href: '/studio?tab=headshot',
      },
      {
        id: 'layers',
        tabId: 'layers',
        icon: 'layers',
        label: {
          zh: '图层工作室',
          en: 'Layers Studio',
        },
        description: {
          zh: '专业图层分离与画布编辑',
          en: 'Visual ideation & layered canvas editing',
        },
        badge: null,
        href: '/studio?tab=layers',
      },
      {
        id: 'design-agent',
        tabId: 'design-agent',
        icon: 'sparkles',
        label: {
          zh: '设计智能体',
          en: 'Design Agent',
        },
        description: {
          zh: '海报、Banner 与商用视觉自动化',
          en: 'Automated poster & commercial visual design',
        },
        badge: 'NEW',
        href: '/studio?tab=design-agent',
      },
      {
        id: 'ai-influencer',
        tabId: 'ai-influencer',
        icon: 'bot',
        label: {
          zh: 'AI 网红工作室',
          en: 'AI Influencer',
        },
        description: {
          zh: '打造并管理专属虚拟数字人 IP',
          en: 'Create and manage your AI virtual idol',
        },
        badge: 'HOT',
        href: '/studio?tab=ai-influencer',
      },
    ],
    models: [
      {
        id: 'seedream-5-0-pro',
        modelKey: 'bytedance-seedream-5.0-pro',
        tabId: 'image',
        name: 'Seedream 5.0 Pro',
        provider: 'ByteDance',
        description: {
          zh: '更强的一致性、细节丰富度与图文响应能力，支持多参考图',
          en: 'Enhanced consistency, detail richness, and prompt responsiveness',
        },
        badge: '5.0 Pro',
        href: '/studio?tab=image&model=bytedance-seedream-5.0-pro',
      },
      {
        id: 'seedream-5-0',
        modelKey: 'bytedance-seedream-v5.0',
        tabId: 'image',
        name: 'Seedream 5.0',
        provider: 'ByteDance',
        description: {
          zh: '全面升级的通用图像生成，兼顾构图美感与文字渲染',
          en: 'Comprehensive universal image generation with great composition & text rendering',
        },
        badge: '5.0',
        href: '/studio?tab=image&model=bytedance-seedream-v5.0',
      },
      {
        id: 'seedance-2-character',
        modelKey: 'seedance-2-character',
        tabId: 'image',
        name: 'Seedance 2 Character',
        provider: 'ByteDance',
        description: {
          zh: '针对角色设计与一致性强化的专门模型',
          en: 'Specialized model for character design and consistency reinforcement',
        },
        badge: '2.0',
        href: '/studio?tab=image&model=seedance-2-character',
      },
      {
        id: 'seedream-4-5',
        modelKey: 'bytedance-seedream-v4.5',
        tabId: 'image',
        name: 'Seedream 4.5',
        provider: 'ByteDance',
        description: {
          zh: '强化一致性、风格与图文响应，画面质感细腻',
          en: 'Enhanced consistency, style, and text-to-image response',
        },
        badge: '4.5',
        href: '/studio?tab=image&model=bytedance-seedream-v4.5',
      },
      {
        id: 'vidu-q2',
        modelKey: 'vidu-q2',
        tabId: 'image',
        name: 'Vidu Q2',
        provider: 'ShengShu',
        description: {
          zh: '生动多模态高品质图像生成底座',
          en: 'Vivid multimodal high-quality image generation foundation',
        },
        badge: 'Q2',
        href: '/studio?tab=image&model=vidu-q2',
      },
      {
        id: 'flux-2-klein',
        modelKey: 'flux-2-klein',
        tabId: 'image',
        name: 'FLUX.2 Klein',
        provider: 'Black Forest Labs',
        description: {
          zh: '极速高精度渲染，擅长超写实细节与复杂构图',
          en: 'Ultra-fast high-precision rendering, realistic details and complex composition',
        },
        badge: '2.0',
        href: '/studio?tab=image&model=flux-2-klein',
      },
      {
        id: 'kling-o3',
        modelKey: 'kling-o3',
        tabId: 'image',
        name: 'Kling O3',
        provider: 'Kuaishou',
        description: {
          zh: '新一代自研多模态图像生成，超高细节与材质真实度',
          en: 'Next-gen multimodal generation with superior detail and textures',
        },
        badge: 'O3',
        href: '/studio?tab=image&model=kling-o3',
      },
      {
        id: 'nano-banana-pro',
        modelKey: 'nano-banana-pro',
        tabId: 'image',
        name: 'Nano Banana Pro',
        provider: 'Google DeepMind',
        description: {
          zh: '顶级 4K 超微细节与写实光影',
          en: 'Best 4K image model with micro-detail precision',
        },
        badge: 'TOP',
        href: '/studio?tab=image&model=nano-banana-pro',
      },
      {
        id: 'midjourney-v7',
        modelKey: 'midjourney-v7',
        tabId: 'image',
        name: 'Midjourney v7',
        provider: 'Midjourney',
        description: {
          zh: '顶尖艺术质感与审美，支持角色一致性与风格参考',
          en: 'Top artistic aesthetics, supports character and style references',
        },
        badge: 'v7',
        href: '/studio?tab=image&model=midjourney-v7',
      },
    ],
  },
  {
    id: 'video',
    tabId: 'cinema',
    label: {
      zh: '视频',
      en: 'Video',
    },
    href: '/studio?tab=cinema',
    badge: null,
    features: [
      {
        id: 'cinema',
        tabId: 'cinema',
        icon: 'video',
        label: {
          zh: '电影影视工作室',
          en: 'Cinema Studio',
        },
        description: {
          zh: '电影级景深、运镜与电影感调色',
          en: 'Cinematic film-grade aesthetic & lens controls',
        },
        badge: 'TOP',
        href: '/studio?tab=cinema',
      },
      {
        id: 'video',
        tabId: 'video',
        icon: 'video',
        label: {
          zh: '视频工作室',
          en: 'Video Studio',
        },
        description: {
          zh: '文生视频与图生视频基础工作台',
          en: 'Text & image to video foundation workspace',
        },
        badge: null,
        href: '/studio?tab=video',
      },
      {
        id: 'clipping',
        tabId: 'clipping',
        icon: 'zap',
        label: {
          zh: 'AI 剪辑',
          en: 'AI Clipping',
        },
        description: {
          zh: '智能识别高光片段与自动化剪辑',
          en: 'Smart highlight extraction & automated editing',
        },
        badge: null,
        href: '/studio?tab=clipping',
      },
      {
        id: 'motion-control',
        tabId: 'motion-control',
        icon: 'compass',
        label: {
          zh: '动作控制',
          en: 'Motion Control',
        },
        description: {
          zh: '骨骼姿态追踪与动作轨迹驱动',
          en: 'Skeletal pose tracking & motion transfer',
        },
        badge: null,
        href: '/studio?tab=motion-control',
      },
      {
        id: 'vibe-motion',
        tabId: 'vibe-motion',
        icon: 'zap',
        label: {
          zh: '动感运镜',
          en: 'Vibe Motion',
        },
        description: {
          zh: '推拉摇移与复杂动态摄像机转场',
          en: 'Dynamic camera paths, zooms and pans',
        },
        badge: null,
        href: '/studio?tab=vibe-motion',
      },
      {
        id: 'lipsync',
        tabId: 'lipsync',
        icon: 'bot',
        label: {
          zh: '唇形同步',
          en: 'Lip Sync',
        },
        description: {
          zh: '音频与人物嘴型高精度对齐匹配',
          en: 'Precision lip sync matching voice & audio',
        },
        badge: 'HOT',
        href: '/studio?tab=lipsync',
      },
      {
        id: 'body-swap',
        tabId: 'body-swap',
        icon: 'user',
        label: {
          zh: '换体工作室',
          en: 'Body Swap',
        },
        description: {
          zh: '角色身形替换与动作无缝融合',
          en: 'Seamless character body & pose replacement',
        },
        badge: null,
        href: '/studio?tab=body-swap',
      },
      {
        id: 'marketing',
        tabId: 'marketing',
        icon: 'sparkles',
        label: {
          zh: '营销工作室',
          en: 'Marketing Studio',
        },
        description: {
          zh: '爆款带货短视频与电商切片制作',
          en: 'High-converting marketing clips & ads',
        },
        badge: 'NEW',
        href: '/studio?tab=marketing',
      },
    ],
    models: [
      {
        id: 'kling-v2-pro',
        modelKey: 'kling-v2-pro',
        name: 'Kling 2.0 Pro',
        provider: 'Kuaishou',
        description: {
          zh: '逼真物理模拟与大范围连贯动态',
          en: 'Physics-informed simulation & large-scale motion',
        },
        badge: 'TOP',
        href: '/studio?tab=cinema&model=kling-v2-pro',
      },
      {
        id: 'minimax-hailuo',
        modelKey: 'minimax-hailuo',
        name: 'MiniMax Hailuo',
        provider: 'MiniMax',
        description: {
          zh: '电影级叙事张力与自然生动的微表情',
          en: 'Cinematic storytelling & rich micro-expressions',
        },
        badge: 'NEW',
        href: '/studio?tab=cinema&model=minimax-hailuo',
      },
      {
        id: 'runway-gen3-alpha',
        modelKey: 'runway-gen3-alpha',
        name: 'Runway Gen-3 Alpha',
        provider: 'Runway',
        description: {
          zh: '影视行业级镜头控制与高保真画质',
          en: 'Industry-grade camera controls & visual fidelity',
        },
        badge: 'TOP',
        href: '/studio?tab=cinema&model=runway-gen3-alpha',
      },
      {
        id: 'luma-dream-machine',
        modelKey: 'luma-dream-machine',
        name: 'Luma Dream Machine',
        provider: 'Luma AI',
        description: {
          zh: '自然光影动态与顺滑转场过渡',
          en: 'Realistic lighting dynamics & seamless transitions',
        },
        badge: null,
        href: '/studio?tab=cinema&model=luma-dream-machine',
      },
      {
        id: 'cogvideox-5b',
        modelKey: 'cogvideox-5b',
        name: 'CogVideoX 5B',
        provider: 'Zhipu AI',
        description: {
          zh: '高动态稳定性与优质语义还原',
          en: 'High temporal stability & prompt alignment',
        },
        badge: null,
        href: '/studio?tab=cinema&model=cogvideox-5b',
      },
    ],
  },
  {
    id: 'audio',
    tabId: 'audio',
    label: {
      zh: '音频',
      en: 'Audio',
    },
    href: '/studio?tab=audio',
    badge: null,
    features: [
      {
        id: 'audio',
        tabId: 'audio',
        icon: 'audio',
        label: {
          zh: '音频工作室',
          en: 'Audio Studio',
        },
        description: {
          zh: 'AI 全曲编曲、人声克隆与专业音效',
          en: 'AI song composition, voice cloning & sound FX',
        },
        badge: 'HOT',
        href: '/studio?tab=audio',
      },
    ],
    models: [
      {
        id: 'suno-v4',
        modelKey: 'suno-v4',
        name: 'Suno v4',
        provider: 'Suno',
        description: {
          zh: '全曲高保真编曲与极富感染力的人声演唱',
          en: 'Full-song generation with emotive vocal styles',
        },
        badge: 'TOP',
        href: '/studio?tab=audio&model=suno-v4',
      },
      {
        id: 'udio-130',
        modelKey: 'udio-130',
        name: 'Udio 130',
        provider: 'Udio',
        description: {
          zh: '母带级专业音乐制作与高保真分轨',
          en: 'Studio-grade music production & stem separation',
        },
        badge: 'NEW',
        href: '/studio?tab=audio&model=udio-130',
      },
      {
        id: 'elevenlabs-v3',
        modelKey: 'elevenlabs-v3',
        name: 'ElevenLabs v3',
        provider: 'ElevenLabs',
        description: {
          zh: '超拟真人性化语音合成与多语言克隆',
          en: 'Ultra-realistic humanlike voice synthesis & cloning',
        },
        badge: 'TOP',
        href: '/studio?tab=audio&model=elevenlabs-v3',
      },
    ],
  },
  {
    id: 'agents-automation',
    tabId: 'workflows',
    label: {
      zh: '智能体与工作流',
      en: 'Agents & Workflows',
    },
    href: '/studio?tab=workflows',
    badge: 'NEW',
    features: [
      {
        id: 'workflows',
        tabId: 'workflows',
        icon: 'zap',
        label: {
          zh: 'AI 创作工作流',
          en: 'Workflows',
        },
        description: {
          zh: '可视化节点编排与全链路自动化生成',
          en: 'Visual node orchestration & automated pipeline',
        },
        badge: 'HOT',
        href: '/studio?tab=workflows',
      },
      {
        id: 'agents',
        tabId: 'agents',
        icon: 'bot',
        label: {
          zh: '创作智能体',
          en: 'Agents',
        },
        description: {
          zh: '自主思考与分步执行的 AI 创作助理',
          en: 'Autonomous thinking & multi-step creative assistant',
        },
        badge: 'NEW',
        href: '/studio?tab=agents',
      },
      {
        id: 'apps',
        tabId: 'apps',
        icon: 'compass',
        label: {
          zh: '探索应用',
          en: 'Explore Apps',
        },
        description: {
          zh: '开箱即用的垂类场景 AI 快捷工具',
          en: 'Turnkey domain-specific AI quick tools',
        },
        badge: null,
        href: '/studio?tab=apps',
      },
    ],
    models: [
      {
        id: 'deepseek-r1',
        modelKey: 'deepseek-r1',
        name: 'DeepSeek-R1',
        provider: 'DeepSeek',
        description: {
          zh: '深度长思考与复杂多步骤任务规划',
          en: 'Deep reasoning & complex multi-step task planning',
        },
        badge: 'TOP',
        href: '/studio?tab=agents&model=deepseek-r1',
      },
      {
        id: 'claude-3-7-sonnet',
        modelKey: 'claude-3-7-sonnet',
        name: 'Claude 3.7 Sonnet',
        provider: 'Anthropic',
        description: {
          zh: '顶级多模态编排与代码/工作流生成',
          en: 'Premier multimodal orchestration & workflow coding',
        },
        badge: 'TOP',
        href: '/studio?tab=workflows&model=claude-3-7-sonnet',
      },
      {
        id: 'gpt-4o',
        modelKey: 'gpt-4o',
        name: 'GPT-4o',
        provider: 'OpenAI',
        description: {
          zh: '全能高响应多模态视觉理解与任务执行',
          en: 'Omni high-speed multimodal vision & execution',
        },
        badge: null,
        href: '/studio?tab=agents&model=gpt-4o',
      },
    ],
  },
  {
    id: 'community',
    tabId: null,
    label: {
      zh: '社区',
      en: 'Community',
    },
    href: '/community',
    badge: null,
    features: [
      {
        id: 'explore-feed',
        tabId: null,
        icon: 'compass',
        label: {
          zh: '探索灵感',
          en: 'Explore Feed',
        },
        description: {
          zh: '浏览全球创作者精选作品与提示词',
          en: 'Browse featured creations & prompts worldwide',
        },
        badge: 'HOT',
        href: '/community',
      },
      {
        id: 'remix-hub',
        tabId: null,
        icon: 'sparkles',
        label: {
          zh: '一键同款',
          en: 'Remix Hub',
        },
        description: {
          zh: '一键载入热门作品参数与工作流',
          en: 'One-click load popular parameters & workflows',
        },
        badge: 'NEW',
        href: '/community?tab=remix',
      },
    ],
    models: [],
  },
];

/**
 * 辅助函数：根据当前语言获取格式化后的导航项
 * @param {string} locale
 */
export function getMegaNavCategories(locale = 'zh') {
  const isZh = locale?.startsWith('zh') ?? true;
  const langKey = isZh ? 'zh' : 'en';

  return MEGA_NAV_CATEGORIES.map((cat) => ({
    ...cat,
    label: cat.label[langKey] || cat.label.en,
    features: (cat.features || []).map((feat) => ({
      ...feat,
      label: feat.label[langKey] || feat.label.en,
      description: feat.description[langKey] || feat.description.en,
    })),
    models: (cat.models || []).map((m) => ({
      ...m,
      description: m.description[langKey] || m.description.en,
    })),
  }));
}

export function getMegaNavCopy(locale = 'zh') {
  const isZh = locale?.startsWith('zh') ?? true;
  return {
    explore: isZh ? '探索' : 'Explore',
    features: isZh ? '功能与工具' : 'Features',
    models: isZh ? '核心模型矩阵' : 'Models',
    modelsReady: isZh ? '款就绪' : 'Ready',
  };
}

/**
 * 辅助函数：通过 tabId 查找 Feature
 */
export function findFeatureByTabId(tabId) {
  for (const cat of MEGA_NAV_CATEGORIES) {
    const found = cat.features?.find((f) => f.tabId === tabId);
    if (found) return found;
  }
  return null;
}

/**
 * 辅助函数：通过 modelKey 查找 Model
 */
export function findModelByKey(modelKey) {
  for (const cat of MEGA_NAV_CATEGORIES) {
    const found = cat.models?.find((m) => m.modelKey === modelKey);
    if (found) return found;
  }
  return null;
}
