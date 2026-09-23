BEGIN;

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_jimeng_ai', '即梦AI', '/assets/avatars/default-01.svg', 'creator', '即梦 AI 官方精选创作与参数解析实验室', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_lenscraft', 'LensCraft 影像所', '/assets/avatars/default-02.svg', 'creator', '探索胶片光学与数字渲染的交融之美', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_minimal_design', 'Minimal Industrial', '/assets/avatars/default-03.svg', 'creator', '专注硬核工业品与极简材质视觉表达', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_cyber_motion', 'CyberMotion 动画组', '/assets/avatars/default-04.svg', 'creator', 'AI 影视动态分镜与科幻世界观构建', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_zen_ink', '墨境工作室', '/assets/avatars/default-05.svg', 'creator', '东方意象当代数字艺术转译', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_aura_lab', 'Aura Visual Lab', '/assets/avatars/default-06.svg', 'creator', '捕捉光线的呼吸与弥散情绪', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_tiny_world', 'TinyWorld 移轴社', '/assets/avatars/default-07.svg', 'creator', '用微缩移轴的视角重新审视世界', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO auth_usr.users (id, display_name, avatar_url, role, bio, created_at, updated_at)
VALUES ('usr_vintage_bokeh', 'Vintage Bokeh 光学社', '/assets/avatars/default-08.svg', 'creator', '老镜头玄学与光斑收集狂人', now(), now())
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, avatar_url = EXCLUDED.avatar_url, bio = EXCLUDED.bio, updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  '7681561564197031193', 'usr_jimeng_ai', '竖版啤酒艺术海报', '潮流实验性设计 (Anti-Design)，工业平面风格，点阵网点与解构美学。',
  'image', '/assets/community/case-beer-poster.webp', '/assets/community/case-beer-poster.webp', '一张3:4竖版啤酒艺术海报，潮流实验性设计 (Anti-Design)，工业平面风格。【产品展示】@image1 啤酒罐体以居中剪影方式呈现于画面正中，罐体表面经过点阵打印效果艺术化处理；四周散布技术参数文字和装饰符号。【构图】顶部和底部各有巨大黑色粗体字被画面边缘"切断"，形成视觉张力；罐体居中，周围留有呼吸空间；四角和边缘散布小号说明文字和几何符号，形成信息框架。【色彩方案】银白色罐身为画面焦点，深蓝色块作为背景局部装饰，大面积黑色文字，金黄色作为点缀装饰色；整体底色为带有磨损质感的灰白色，模拟复古复印纸纸张感。【光影】罐体经过点阵化/半调网点艺术处理，非真实光影而是图形化表现；整体画面带有颗粒状复印机纸张质感和轻微磨损痕迹；无传统摄影光影，以平面图形语言为主。【文字排版】顶部超大黑体日文"初搾り"被上边缘切断只显示下半部分；底部超大黑体英文"RYUSEI"被下边缘切断只显示上半部分；罐身上方英文"BREWED FOR GREAT MOMENTS" / "CRAFTED BY TRADITION"；左侧小字"EST. 1902" / "HAPPOSHU" / "ALC. 5.5% / 350ml"；右侧装饰性英文"EXPERIMENTAL BY NATURE"斜向排列；罐身日文"龍星麦酒"保留为品牌标识。【质感要求】画面具有强烈的平面设计实验性和解构美学；复古复印纸质感与现代极简排版形成反差张力；点阵处理效果精细统一；整体如艺术展览级别的限量版海报。', '低质量, 模糊, 真实摄影反光, 变形文字, 杂乱背景, 噪点失真',
  'Seedream 5.0 Pro', '{"aspect_ratio": "3:4", "resolution": "1536x2048", "model": "Seedream 5.0 Pro", "reference_image": "/assets/community/case-beer-ref-can.webp", "reference_type": "\u667a\u80fd\u53c2\u8003", "reference_strength": 0.85, "sampler": "DPM++ 2M Karras", "steps": 32, "cfg_scale": 7.5, "seed": 7681561564, "engine": "Jimeng / Koyo-Visual 5.0"}'::jsonb, ARRAY['潮流海报', '工业平面', '点阵艺术', '包装设计', '智能参考']::text[], 223, 36,
  8920, 145, 18, 'published', true,
  '2026-09-04T10:28:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_cinema_vintage_70s', 'usr_lenscraft', '70年代复古电影胶片肖像', '柯达 Portra 400 经典暖调，柔和丁达尔光晕与自然大光圈散景。',
  'image', '/assets/cinema/70s_cinema_prime.webp', '/assets/cinema/70s_cinema_prime.webp', '70年代复古电影质感胶片写真，柯达 Portra 400 暖调颗粒，柔和丁达尔光晕，电影级散景虚化，大光圈定焦镜头摄影，暖色调，胶片颗粒感，高光溢出。', '数字塑料感, 过度锐化, 灰暗, 偏色',
  'FLUX.1 Cinematic', '{"aspect_ratio": "16:9", "resolution": "2048x1152", "model": "FLUX.1 Cinematic", "sampler": "Euler a", "steps": 28, "cfg_scale": 6.5, "seed": 9382104, "engine": "FLUX Schnell Ultra"}'::jsonb, ARRAY['电影质感', '胶片写真', '复古光影', '大光圈']::text[], 188, 24,
  5410, 89, 12, 'published', true,
  '2026-09-08T14:15:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_industrial_macro', 'usr_minimal_design', '蔡司大画幅工业微距美学', '极致微距与工业美学，冷调金属拉丝质感与光影折射棚拍。',
  'image', '/assets/cinema/premium_large_format_digital.webp', '/assets/cinema/premium_large_format_digital.webp', '极致微距与工业美学，德系蔡司大画幅数码微距镜头，冷调金属拉丝质感与光影折射，高精度产品级棚拍，极简背景，锐利边缘，光影渐层。', '杂乱反光, 灰尘划痕, 模糊失焦',
  'Midjourney v6.1', '{"aspect_ratio": "4:3", "resolution": "1920x1440", "model": "Midjourney v6.1", "sampler": "DPM++ SDE Karras", "steps": 35, "cfg_scale": 8, "seed": 1047192, "engine": "Midjourney Turbo"}'::jsonb, ARRAY['工业设计', '蔡司微距', '金属质感', '商业摄影']::text[], 156, 18,
  4290, 67, 9, 'published', true,
  '2026-09-11T09:40:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_cyberpunk_rain_video', 'usr_cyber_motion', '霓虹赛博雨夜宽银幕分镜', '未来赛博都市雨夜，霓虹倒影与宽银幕变形镜头光斑，慢动作电影运镜。',
  'video', '/assets/cinema/classic_anamorphic.webp', '/assets/cinema/classic_anamorphic.webp', '未来赛博都市雨夜，霓虹倒影，宽银幕变形镜头光斑，雨滴从镜头滑落，慢动作电影运镜，全景深，冷暖对比色调。', '画面卡顿, 噪点块, 画面拉伸变形',
  'Sora 2.0 Turbo', '{"aspect_ratio": "16:9", "resolution": "1920x1080", "model": "Sora 2.0 Turbo", "fps": 30, "duration": "5s", "camera_motion": "Pan Right & Slow Push", "engine": "OpenAI Sora Video Engine"}'::jsonb, ARRAY['赛博朋克', '雨夜霓虹', '宽银幕', '电影运镜']::text[], 312, 48,
  12400, 230, 34, 'published', true,
  '2026-09-13T18:20:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_zen_ink_modern', 'usr_zen_ink', '新中式东方禅意概念解构', '新中式禅意美学，水墨留白与工笔重彩碰撞，金箔肌理与松柏光影。',
  'image', '/assets/cinema/vintage_prime.webp', '/assets/cinema/vintage_prime.webp', '新中式禅意美学，水墨留白与工笔重彩碰撞，金箔肌理与松柏光影，东方意境概念艺术，纸张纤维肌理，典雅东方留白。', '俗艳杂乱, 现代塑料感, 结构错误',
  'Seedream 5.0 Pro', '{"aspect_ratio": "3:4", "resolution": "1536x2048", "model": "Seedream 5.0 Pro", "sampler": "DPM++ 2M Karras", "steps": 30, "cfg_scale": 7, "seed": 8491023, "engine": "Jimeng / Koyo-Visual 5.0"}'::jsonb, ARRAY['新中式', '水墨禅意', '概念设计', '金箔肌理']::text[], 245, 30,
  6730, 112, 15, 'published', true,
  '2026-09-15T11:00:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_halation_diffusion', 'usr_aura_lab', '柔焦光晕弥散梦幻氛围', '胶片光晕弥散效果，梦幻复古氛围感，柔焦高光溢出与暖光漫反射。',
  'image', '/assets/cinema/halation_diffusion.webp', '/assets/cinema/halation_diffusion.webp', '胶片光晕弥散效果，梦幻复古氛围感，柔焦高光溢出，暖光漫反射，杂志封面级排版构图，情绪叙事感。', '冷硬死黑, 杂乱边缘, 欠曝',
  'FLUX.1 Schnell', '{"aspect_ratio": "1:1", "resolution": "1536x1536", "model": "FLUX.1 Schnell", "sampler": "Euler", "steps": 25, "cfg_scale": 6, "seed": 6271903, "engine": "FLUX Schnell Ultra"}'::jsonb, ARRAY['梦幻氛围', '柔焦弥散', '杂志封面', '光晕艺术']::text[], 198, 22,
  5120, 78, 11, 'published', true,
  '2026-09-16T15:45:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_tilt_shift_creative', 'usr_tiny_world', '移轴微缩城市创意摄影', '移轴摄影微缩模型质感，城市街道俯瞰与极窄景深，高饱和度玩具感都市。',
  'image', '/assets/cinema/creative_tilt_lens.webp', '/assets/cinema/creative_tilt_lens.webp', '移轴摄影，微缩景观模型质感，城市街道俯瞰，极窄景深，高饱和度玩具感都市生活，精致透视，模型微距感。', '全景深, 扁平无层次, 灰暗',
  'Midjourney v6.1', '{"aspect_ratio": "16:9", "resolution": "2048x1152", "model": "Midjourney v6.1", "sampler": "DPM++ 2M Karras", "steps": 30, "cfg_scale": 7, "seed": 4819203, "engine": "Midjourney Turbo"}'::jsonb, ARRAY['移轴摄影', '微缩模型', '俯瞰视角', '创意摄影']::text[], 172, 16,
  4580, 63, 8, 'published', false,
  '2026-09-18T08:12:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();

INSERT INTO ai_studio.community_posts (
  id, user_id, title, description,
  media_type, media_url, cover_url, prompt, negative_prompt,
  model_name, parameters, tags, likes_count, coins_count,
  views_count, remix_count, comments_count, status, is_featured,
  created_at, updated_at
) VALUES (
  'case_swirl_bokeh_portrait', 'usr_vintage_bokeh', '八羽怪旋转焦外唯美肖像', '苏联经典八羽怪镜头独特的旋转焦外光斑，梦幻逆光轮廓与情绪人像。',
  'image', '/assets/cinema/swirl_bokeh_portrait.webp', '/assets/cinema/swirl_bokeh_portrait.webp', '苏联八羽怪经典镜头，独特的旋转焦外光斑，梦幻逆光轮廓，情绪感人物肖像，高光边缘色散，胶片色彩。', '呆板虚化, 塑料人皮, 惨白光照',
  'Seedream 5.0 Pro', '{"aspect_ratio": "3:4", "resolution": "1536x2048", "model": "Seedream 5.0 Pro", "sampler": "DPM++ 2M Karras", "steps": 32, "cfg_scale": 7.5, "seed": 3918204, "engine": "Jimeng / Koyo-Visual 5.0"}'::jsonb, ARRAY['旋转焦外', '八羽怪', '胶片人像', '情绪摄影']::text[], 210, 28,
  5890, 94, 14, 'published', false,
  '2026-09-19T16:30:00.000Z'::timestamptz, now()
) ON CONFLICT (id) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  media_type = EXCLUDED.media_type,
  media_url = EXCLUDED.media_url,
  cover_url = EXCLUDED.cover_url,
  prompt = EXCLUDED.prompt,
  negative_prompt = EXCLUDED.negative_prompt,
  model_name = EXCLUDED.model_name,
  parameters = EXCLUDED.parameters,
  tags = EXCLUDED.tags,
  likes_count = EXCLUDED.likes_count,
  coins_count = EXCLUDED.coins_count,
  views_count = EXCLUDED.views_count,
  remix_count = EXCLUDED.remix_count,
  comments_count = EXCLUDED.comments_count,
  is_featured = EXCLUDED.is_featured,
  updated_at = now();
COMMIT;
