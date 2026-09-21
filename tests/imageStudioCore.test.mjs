import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('calculatePixelDimensions, findClosestAspectRatio, findClosestSupportedAspectRatio, and extractOutputUrl logic test', async () => {
  const source = await readFile(new URL('../packages/studio/src/components/ImageStudio.jsx', import.meta.url), 'utf8');
  
  // Extract helper functions
  const calcMatch = source.match(/export function calculatePixelDimensions[\s\S]*?\n\}/);
  const findMatch = source.match(/export function findClosestAspectRatio[\s\S]*?\n\}/);
  const findSuppMatch = source.match(/export function findClosestSupportedAspectRatio[\s\S]*?\n\}/);
  const extractMatch = source.match(/export function extractOutputUrl[\s\S]*?\n\}/);

  assert.ok(calcMatch, 'calculatePixelDimensions must exist');
  assert.ok(findMatch, 'findClosestAspectRatio must exist');
  assert.ok(findSuppMatch, 'findClosestSupportedAspectRatio must exist');
  assert.ok(extractMatch, 'extractOutputUrl must exist');

  const context = {};
  const code = `
    ${calcMatch[0].replace('export function', 'function')}
    ${findMatch[0].replace('export function', 'function')}
    ${findSuppMatch[0].replace('export function', 'function')}
    ${extractMatch[0].replace('export function', 'function')}
    this.calculatePixelDimensions = calculatePixelDimensions;
    this.findClosestAspectRatio = findClosestAspectRatio;
    this.findClosestSupportedAspectRatio = findClosestSupportedAspectRatio;
    this.extractOutputUrl = extractOutputUrl;
  `;
  vm.runInNewContext(code, context);
  const { calculatePixelDimensions, findClosestAspectRatio, findClosestSupportedAspectRatio, extractOutputUrl } = context;

  // 1. Standard ratios & qualities
  const dim1k = calculatePixelDimensions('1:1', '1K');
  assert.equal(dim1k.width, 1024);
  assert.equal(dim1k.height, 1024);
  assert.equal(dim1k.isAdaptive, false);

  const dim2k = calculatePixelDimensions('1:1', '2K');
  assert.equal(dim2k.width, 2048);
  assert.equal(dim2k.height, 2048);

  const dim4k = calculatePixelDimensions('1:1', '4K');
  assert.equal(dim4k.width, 4096);
  assert.equal(dim4k.height, 4096);

  const dim16_9_1k = calculatePixelDimensions('16:9', '1K');
  assert.equal(dim16_9_1k.width, 1280);
  assert.equal(dim16_9_1k.height, 720);

  const dim16_9_2k = calculatePixelDimensions('16:9', '2K');
  assert.equal(dim16_9_2k.width, 2560);
  assert.equal(dim16_9_2k.height, 1440);

  const dim16_9_4k = calculatePixelDimensions('16:9', '4K');
  assert.equal(dim16_9_4k.width, 3840);
  assert.equal(dim16_9_4k.height, 2160);

  const dim9_16_2k = calculatePixelDimensions('9:16', '2K');
  assert.equal(dim9_16_2k.width, 1440);
  assert.equal(dim9_16_2k.height, 2560);

  // 2. Adaptive ratio
  const adaptiveDim = calculatePixelDimensions('adaptive', '2K');
  assert.equal(adaptiveDim.isAdaptive, true);
  assert.equal(adaptiveDim.width, 2048);
  assert.equal(adaptiveDim.height, 2048);

  // 3. findClosestAspectRatio mapping
  assert.equal(findClosestAspectRatio(1920, 1080), '16:9');
  assert.equal(findClosestAspectRatio(2560, 1440), '16:9');
  assert.equal(findClosestAspectRatio(1080, 1920), '9:16');
  assert.equal(findClosestAspectRatio(1440, 2560), '9:16');
  assert.equal(findClosestAspectRatio(1024, 1024), '1:1');
  assert.equal(findClosestAspectRatio(2048, 2048), '1:1');
  assert.equal(findClosestAspectRatio(1600, 1200), '4:3');
  assert.equal(findClosestAspectRatio(1200, 1600), '3:4');
  assert.equal(findClosestAspectRatio(1500, 1000), '3:2');
  assert.equal(findClosestAspectRatio(1000, 1500), '2:3');
  assert.equal(findClosestAspectRatio(2560, 1080), '21:9');

  // 4. findClosestSupportedAspectRatio mapping
  assert.equal(findClosestSupportedAspectRatio(1920, 1080, ['1:1', '16:9', '9:16']), '16:9');
  assert.equal(findClosestSupportedAspectRatio(1080, 1920, ['1:1', '16:9', '9:16']), '9:16');
  // When 3:4 (0.75) is not supported, map to closest supported: 9:16 (0.5625, diff 0.1875) vs 1:1 (1.0, diff 0.25)
  assert.equal(findClosestSupportedAspectRatio(1200, 1600, ['1:1', '16:9', '9:16']), '9:16');
  assert.equal(findClosestSupportedAspectRatio(1600, 1200, ['1:1', '16:9', '9:16']), '1:1');
  assert.equal(findClosestSupportedAspectRatio(0, 0, ['16:9']), '16:9');

  // 5. extractOutputUrl extraction formats
  assert.equal(extractOutputUrl('https://example.com/direct.jpg'), 'https://example.com/direct.jpg');
  assert.equal(extractOutputUrl({ url: 'https://example.com/res.jpg' }), 'https://example.com/res.jpg');
  assert.equal(extractOutputUrl({ result_url: 'https://example.com/result.jpg' }), 'https://example.com/result.jpg');
  assert.equal(extractOutputUrl({ image_url: 'https://example.com/img.jpg' }), 'https://example.com/img.jpg');
  assert.equal(extractOutputUrl({ outputs: ['https://example.com/out0.jpg'] }), 'https://example.com/out0.jpg');
  assert.equal(extractOutputUrl({ output: ['https://example.com/out_arr.jpg'] }), 'https://example.com/out_arr.jpg');
  assert.equal(extractOutputUrl({ output: { url: 'https://example.com/out_obj.jpg' } }), 'https://example.com/out_obj.jpg');
  assert.equal(extractOutputUrl({ images: ['https://example.com/images0.jpg'] }), 'https://example.com/images0.jpg');
  assert.equal(extractOutputUrl(null), null);
  assert.equal(extractOutputUrl({}), null);
});

test('ImageStudio source code integrity: no fake features, no !apiKey blocking, robust send, custom PX', async () => {
  const source = await readFile(new URL('../packages/studio/src/components/ImageStudio.jsx', import.meta.url), 'utf8');

  // 1. Fake media menus (video, script, audio) and fake prompt enhancer [T"] must NOT exist
  assert.equal(source.includes('function MediaMenuPopover'), false, 'MediaMenuPopover must be removed');
  assert.equal(source.includes('mediaMenuOpen'), false, 'mediaMenuOpen must be removed');
  assert.equal(source.includes('若需生成或编辑视频，可前往顶部导航'), false, 'Fake video toast must be removed');
  assert.equal(source.includes('剧本导入模式：支持直接向输入框输入长篇故事描述'), false, 'Fake script toast must be removed');
  assert.equal(source.includes('音频模式可用于音视频多模态创作'), false, 'Fake audio toast must be removed');
  assert.equal(source.includes('title="咒语优化"'), false, 'Fake [T"] button must be removed');
  assert.equal(source.includes('title="引用参考图"'), false, 'Redundant [@] button must be removed');

  // 2. Custom PX and dimensionMode must be present and linked
  assert.match(source, /dimensionMode/);
  assert.match(source, /setDimensionMode/);
  assert.match(source, /customWidth,\s*customHeight/);
  assert.match(source, /onChangeDimensions/);
  assert.match(source, /onSwapDimensions/);
  assert.match(source, /交换宽与高/);
  assert.match(source, /placeholder="宽"/);
  assert.match(source, /placeholder="高"/);

  // 3. No !apiKey blocking in handleGenerate: normal session users must be able to generate
  assert.doesNotMatch(source, /if \(!apiKey\) return;/, '!apiKey must not block execution');
  assert.doesNotMatch(source, /请先配置 API Key 才能生成图片/, 'API key alert must not block generation');

  // 4. Send button, IME composition protection, and robust error handling
  assert.match(source, /onKeyDown=\{/);
  assert.match(source, /e\.key === "Enter"/);
  assert.match(source, /isComposing/);
  assert.match(source, /handleGenerate/);
  assert.match(source, /Promise\.allSettled/);
  assert.match(source, /extractOutputUrl/);
  assert.match(source, /toast\.error\(errMsg\)/);
});

test('muapi.js supports payload.width and payload.height for custom PX models', async () => {
  const muapiSource = await readFile(new URL('../packages/studio/src/muapi.js', import.meta.url), 'utf8');
  assert.match(muapiSource, /if \(params\.width\) payload\.width = params\.width;/);
  assert.match(muapiSource, /if \(params\.height\) payload\.height = params\.height;/);
});

test('resolveModelQualityOrResolution and 422 prevention test', async () => {
  const { resolveModelQualityOrResolution } = await import('../packages/studio/src/muapi.js');
  const { getModelById } = await import('../packages/studio/src/models.js');

  assert.equal(typeof resolveModelQualityOrResolution, 'function', 'resolveModelQualityOrResolution must be exported');

  // 1. Seedream 5.0 (bytedance-seedream-v5.0) - enum ['basic', 'high']
  const seedream5 = getModelById('bytedance-seedream-v5.0');
  assert.ok(seedream5, 'bytedance-seedream-v5.0 model must exist');
  
  const s5_1k = resolveModelQualityOrResolution(seedream5, '1K');
  assert.equal(s5_1k.field, 'quality');
  assert.equal(s5_1k.value, 'basic');
  assert.equal(String(s5_1k), 'basic');

  const s5_2k = resolveModelQualityOrResolution(seedream5, '2K');
  assert.equal(s5_2k.field, 'quality');
  assert.equal(s5_2k.value, 'high');

  const s5_4k = resolveModelQualityOrResolution(seedream5, '4K');
  assert.equal(s5_4k.field, 'quality');
  assert.equal(s5_4k.value, 'high');

  const s5_raw_label = resolveModelQualityOrResolution(seedream5, '标清 1K');
  assert.equal(s5_raw_label.field, 'quality');
  assert.equal(s5_raw_label.value, 'basic');

  // 2. gpt-image-1.5 - enum ['low', 'medium', 'high']
  const gpt15 = getModelById('gpt-image-1.5');
  if (gpt15) {
    const gpt_1k = resolveModelQualityOrResolution(gpt15, '1K');
    assert.equal(gpt_1k.field, 'quality');
    assert.equal(gpt_1k.value, 'low');

    const gpt_2k = resolveModelQualityOrResolution(gpt15, '2K');
    assert.equal(gpt_2k.field, 'quality');
    assert.equal(gpt_2k.value, 'medium');

    const gpt_4k = resolveModelQualityOrResolution(gpt15, '4K');
    assert.equal(gpt_4k.field, 'quality');
    assert.equal(gpt_4k.value, 'high');
  }

  // 3. Lowercase k model - e.g. kling-o1-text-to-image ['1k', '2k']
  const klingO1 = getModelById('kling-o1-text-to-image');
  if (klingO1) {
    const k_1k = resolveModelQualityOrResolution(klingO1, '1K');
    assert.equal(k_1k.field, 'resolution');
    assert.equal(k_1k.value, '1k');

    const k_2k = resolveModelQualityOrResolution(klingO1, '2K');
    assert.equal(k_2k.field, 'resolution');
    assert.equal(k_2k.value, '2k');
  }

  // 4. Uppercase K model - e.g. bytedance-seedream-v4 ['1K', '2K', '4K']
  const seedream4 = getModelById('bytedance-seedream-v4');
  if (seedream4) {
    const s4_1k = resolveModelQualityOrResolution(seedream4, '1k');
    assert.equal(s4_1k.field, 'resolution');
    assert.equal(s4_1k.value, '1K');
  }

  // 5. Model with no quality/resolution inputs - e.g. flux-dev
  const fluxDev = getModelById('flux-dev');
  if (fluxDev) {
    const flux_res = resolveModelQualityOrResolution(fluxDev, '1K');
    assert.equal(flux_res, null, 'Model with no quality/resolution must return null');
  }

  // 6. Endpoint string lookup support (e.g. 'seedream-5.0')
  const s5_by_endpoint = resolveModelQualityOrResolution('seedream-5.0', '1K');
  assert.ok(s5_by_endpoint, 'resolveModelQualityOrResolution must support endpoint string lookup');
  assert.equal(s5_by_endpoint.field, 'quality');
  assert.equal(s5_by_endpoint.value, 'basic');

  // 7. Edge cases: null, undefined, empty string, fallback to default
  const s5_null = resolveModelQualityOrResolution(seedream5, null);
  assert.equal(s5_null.value, 'basic', 'null input should fall back to default');
  const s5_empty = resolveModelQualityOrResolution(seedream5, '');
  assert.equal(s5_empty.value, 'basic', 'empty string should fall back to default');

  // 8. Verify ImageStudio.jsx and muapi.js integration
  const studioSource = await readFile(new URL('../packages/studio/src/components/ImageStudio.jsx', import.meta.url), 'utf8');
  const muapiSource = await readFile(new URL('../packages/studio/src/muapi.js', import.meta.url), 'utf8');

  assert.match(studioSource, /resolveModelQualityOrResolution/, 'ImageStudio must use resolveModelQualityOrResolution');
  assert.match(studioSource, /supportsDimensions/, 'ImageStudio must guard width/height with supportsDimensions');
  assert.match(studioSource, /onSelectPresetDimension/, 'ImageStudio must provide onSelectPresetDimension');
  assert.match(studioSource, /keepCustomMode/, 'ImageStudio must support keepCustomMode to avoid resetting custom PX');
  assert.match(muapiSource, /resolveModelQualityOrResolution/, 'muapi.js must define and use resolveModelQualityOrResolution');
  assert.match(muapiSource, /delete payload\.width;/, 'muapi.js must filter width for unsupported models');
  assert.match(muapiSource, /delete payload\.height;/, 'muapi.js must filter height for unsupported models');
});

test('Simulated generation payload verifies 422 defense and custom PX preservation', async () => {
  const { resolveModelQualityOrResolution } = await import('../packages/studio/src/muapi.js');
  const { getModelById, t2iModels } = await import('../packages/studio/src/models.js');

  // Helper simulating the payload construction in ImageStudio.jsx and muapi.js
  function buildTestPayload(modelOrId, { prompt, aspect_ratio, width, height, selectedQuality }) {
    let model = typeof modelOrId === 'string'
      ? getModelById(modelOrId) || t2iModels.find(m => m.id === modelOrId || m.endpoint === modelOrId)
      : modelOrId;
    const supportsDimensions = Boolean(model?.inputs?.width || model?.inputs?.height);
    const resolvedQuality = resolveModelQualityOrResolution(model, selectedQuality);

    const payload = { prompt, aspect_ratio };
    if (supportsDimensions) {
      payload.width = width;
      payload.height = height;
    }
    if (resolvedQuality?.field && resolvedQuality?.value) {
      payload[resolvedQuality.field] = resolvedQuality.value;
    }
    return payload;
  }

  // 1. Seedream 5.0 with "1K": MUST be "basic", NO width/height
  const p1 = buildTestPayload('bytedance-seedream-v5.0', {
    prompt: 'A futuristic city',
    aspect_ratio: '1:1',
    width: 1024,
    height: 1024,
    selectedQuality: '1K',
  });
  assert.equal(p1.quality, 'basic', 'Seedream 5.0 with 1K must map quality to basic');
  assert.equal(p1.width, undefined, 'Seedream 5.0 must not include width');
  assert.equal(p1.height, undefined, 'Seedream 5.0 must not include height');
  assert.equal(p1.aspect_ratio, '1:1');

  // 2. Seedream 5.0 with "2K" and "4K": MUST be "high"
  const p2 = buildTestPayload('bytedance-seedream-v5.0', {
    prompt: 'A futuristic city',
    aspect_ratio: '16:9',
    width: 2560,
    height: 1440,
    selectedQuality: '2K',
  });
  assert.equal(p2.quality, 'high', 'Seedream 5.0 with 2K must map quality to high');

  const p3 = buildTestPayload('seedream-5.0', {
    prompt: 'A futuristic city',
    aspect_ratio: '16:9',
    width: 3840,
    height: 2160,
    selectedQuality: '4K',
  });
  assert.equal(p3.quality, 'high', 'Seedream 5.0 by endpoint with 4K must map quality to high');
  assert.equal(p3.width, undefined, 'Seedream 5.0 must not include width');

  // 3. Kling model with "1K": MUST be "1k" under "resolution"
  const p4 = buildTestPayload('kling-o1-text-to-image', {
    prompt: 'A cat',
    aspect_ratio: '1:1',
    selectedQuality: '1K',
  });
  assert.equal(p4.resolution, '1k');
  assert.equal(p4.quality, undefined);
});


