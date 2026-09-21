import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getRecastModelById, getLipSyncModelById, getAudioModelById, getMotionControlModelById, t2iModels, i2iModels } from './models.js';
import {
    buildVideoToolPayload,
    serializeVideoToolOptions,
} from './videoToolCapabilities.js';
import { buildImageSizePayload } from './imageSizing.js';
import { buildImageInputPayload, getImageInputValidationError, normalizePrimaryImageUrls } from './imageInputContracts.js';
import { pollForGenerationResult } from './utils/generationLifecycle.js';
import { getModelMediaCapabilities, mapReferenceParams } from './modelCapabilities.js';
import { buildSupplementalInputPayload } from './modelParameters.js';
import { getGroupedVideoConfiguration } from './groupedVideoModels.js';
import { submitPlatformGeneration } from './platformGeneration.js';

// In an http(s) browser we route through the host app's proxy (Next.js routes
// under /api/* re-issue the call server-side) so api.muapi.ai CORS is bypassed.
// SSR (no window) and Electron's file:// renderer call the upstream directly.
const BASE_URL = (typeof window !== 'undefined' && window.location?.protocol?.startsWith('http'))
    ? '/api'
    : 'https://api.muapi.ai';
const PROXY_WF_BASE = '/api/workflow';
const FILE_UPLOAD_TIMEOUT_MS = 300_000;
const FILE_UPLOAD_PENDING_PROGRESS = 99;

function notifyAuthRequired(status, detail) {
    if (typeof window === 'undefined') return;
    if (status !== 401 && status !== 403) return;
    window.dispatchEvent(new CustomEvent('muapi:auth-required', { detail: { status, message: detail } }));
}

function assertRequiredPrompt(model, params) {
    if (model?.promptRequired && !String(params.prompt || '').trim()) {
        throw new Error('Prompt is required for this model.');
    }
}

function includeRequiredArrayDefaults(model, payload) {
    const defaults = {};
    for (const field of model?.required || []) {
        if (payload[field] !== undefined || model?.inputs?.[field]?.type !== 'array') continue;
        defaults[field] = [];
    }
    return Object.keys(defaults).length > 0 ? { ...defaults, ...payload } : payload;
}

async function pollForResult(requestId, key, maxAttempts = 900, interval = 2000) {
    return pollForGenerationResult({
        baseUrl: BASE_URL,
        requestId,
        apiKey: key,
        maxAttempts,
        interval,
        onAuthRequired: notifyAuthRequired,
    });
}

function getHostedStudioId() {
    if (typeof window === 'undefined') return 'studio';
    const segments = String(window.location?.pathname || '').split('/').filter(Boolean);
    const studioIndex = segments.lastIndexOf('studio');
    return studioIndex >= 0 ? (segments[studioIndex + 1] || 'image') : 'studio';
}

function normalizePredictionResult(submitData, result, outputUrl) {
    const requestId = submitData?.request_id || submitData?.id || result?.request_id || result?.id;
    return {
        ...result,
        ...(requestId ? { request_id: requestId } : {}),
        url: outputUrl,
    };
}

async function submitAndPoll(endpoint, payload, key, onRequestId, maxAttempts = 60, platformModelId = endpoint) {
    // The shell opens the account dialog only when a model request is about
    // to consume quota. It resolves after login so the original request can
    // continue without making the user click Generate a second time.
    const accountGate = typeof window !== 'undefined' && window.__KOYOSIM_REQUIRE_ACCOUNT__;
    if (accountGate) {
        const user = await accountGate();
        if (!user) throw new Error('Generation cancelled: account login is required.');
        // Hosted KoyoSIM generation must use the server-owned quote, wallet
        // reservation, idempotency, worker and settlement path. Never forward a
        // browser API key or fall back to the legacy provider proxy here.
        return submitPlatformGeneration({
            modelId: platformModelId,
            studioId: getHostedStudioId(),
            prompt: payload?.prompt || '',
            parameters: payload,
            label: payload?.label,
            onRequestId,
            maxAttempts,
            onAuthRequired: notifyAuthRequired,
        });
    }
    let requestKey = key;
    if (!requestKey && typeof window !== 'undefined' && window.__KOYOSIM_REQUIRE_API_KEY__) {
        requestKey = await window.__KOYOSIM_REQUIRE_API_KEY__();
    }
    if (!requestKey) {
        const cookieMatch = typeof document !== 'undefined' && document.cookie.match(/muapi_key=([^;]+)/);
        if (cookieMatch) requestKey = cookieMatch[1];
    }
    if (!requestKey) {
        requestKey = 'koyosim-account-session';
    }
    const url = `${BASE_URL}/api/v1/${endpoint}`;
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': requestKey },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        notifyAuthRequired(response.status, errText);
        throw new Error(`API Request Failed: ${response.status} ${response.statusText} - ${errText.slice(0, 100)}`);
    }
    const submitData = await response.json();
    const requestId = submitData.request_id || submitData.id;
    if (!requestId) return submitData;
    if (onRequestId) onRequestId(requestId);
    const result = await pollForResult(requestId, requestKey, maxAttempts);
    const outputUrl = result.outputs?.[0] || result.url || result.output?.url;
    return normalizePredictionResult(submitData, result, outputUrl);
}

export function resolveModelQualityOrResolution(modelOrId, selectedQuality) {
    let model = modelOrId;
    if (typeof modelOrId === 'string') {
        model = getModelById(modelOrId) || getI2IModelById(modelOrId) ||
            (Array.isArray(t2iModels) ? t2iModels.find(m => m.id === modelOrId || m.endpoint === modelOrId) : null) ||
            (Array.isArray(i2iModels) ? i2iModels.find(m => m.id === modelOrId || m.endpoint === modelOrId) : null);
    }
    if (!model || !model.inputs) return null;

    let field = null;
    let inputDef = null;
    if (model.inputs.quality) {
        field = 'quality';
        inputDef = model.inputs.quality;
    } else if (model.inputs.resolution) {
        field = 'resolution';
        inputDef = model.inputs.resolution;
    }
    if (!field || !inputDef) return null;

    const enumList = Array.isArray(inputDef.enum) ? inputDef.enum : [];
    const defaultVal = inputDef.default || enumList[0] || null;

    if (!selectedQuality) {
        return {
            field,
            value: defaultVal,
            toString() { return this.value || ''; },
            valueOf() { return this.value || ''; }
        };
    }

    // Exact match in enum
    if (enumList.includes(selectedQuality)) {
        return {
            field,
            value: selectedQuality,
            toString() { return this.value || ''; },
            valueOf() { return this.value || ''; }
        };
    }

    const raw = String(selectedQuality).trim();
    const lower = raw.toLowerCase();

    // Categorize input into quality tiers:
    // Tier 1: 1k, 1.5k, 720, basic, low, 标清, standard
    // Tier 2: 2k, 1080, medium, 高清, 中
    // Tier 3: 4k, 8k, high, ultra, 超清
    const isTier1 = /1k|1\.5k|720|basic|low|标清|standard/i.test(lower);
    const isTier3 = /4k|8k|ultra|超清/i.test(lower) || (lower === 'high' && !/medium|中/i.test(lower));
    const isTier2 = /2k|1080|medium|中/i.test(lower) || (/高清/i.test(raw) && !/超清/i.test(raw));

    // Check target enum patterns
    const hasBasicHigh = enumList.includes('basic') && enumList.includes('high');
    const hasLowMedHigh = enumList.includes('low') && enumList.includes('high');
    const hasLowerK = enumList.some(e => /^\d+k$/i.test(e) && e === e.toLowerCase());
    const hasUpperK = enumList.some(e => /^\d+K$/.test(e));

    let mappedValue = null;

    if (hasBasicHigh) {
        if (isTier1) mappedValue = 'basic';
        else mappedValue = 'high';
    } else if (hasLowMedHigh) {
        if (isTier1) mappedValue = 'low';
        else if (isTier3) mappedValue = 'high';
        else mappedValue = enumList.includes('medium') ? 'medium' : 'high';
    } else if (hasLowerK) {
        if (isTier1) mappedValue = enumList.includes('1k') ? '1k' : defaultVal;
        else if (isTier3) mappedValue = enumList.includes('4k') ? '4k' : (enumList.includes('2k') ? '2k' : defaultVal);
        else mappedValue = enumList.includes('2k') ? '2k' : (enumList.includes('1k') ? '1k' : defaultVal);
    } else if (hasUpperK) {
        if (isTier1) mappedValue = enumList.includes('1K') ? '1K' : defaultVal;
        else if (isTier3) mappedValue = enumList.includes('4K') ? '4K' : (enumList.includes('2K') ? '2K' : defaultVal);
        else mappedValue = enumList.includes('2K') ? '2K' : (enumList.includes('1K') ? '1K' : defaultVal);
    }

    // Direct case-insensitive match check
    if (!mappedValue) {
        const caseMatch = enumList.find(e => e.toLowerCase() === lower);
        if (caseMatch) mappedValue = caseMatch;
    }

    if (!mappedValue || !enumList.includes(mappedValue)) {
        mappedValue = defaultVal;
    }

    return {
        field,
        value: mappedValue,
        toString() { return this.value || ''; },
        valueOf() { return this.value || ''; }
    };
}

export async function generateImage(apiKey, params) {
    const modelInfo = getModelById(params.model) || (Array.isArray(t2iModels) ? t2iModels.find(m => m.endpoint === params.model || m.id === params.model) : null);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {
        ...buildSupplementalInputPayload(modelInfo, params),
        prompt: params.prompt
    };
    if (modelInfo) Object.assign(payload, buildImageSizePayload(modelInfo, params.aspect_ratio));
    else if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.width) payload.width = params.width;
    if (params.height) payload.height = params.height;
    if (modelInfo && !modelInfo.inputs?.width && !modelInfo.inputs?.height) {
        delete payload.width;
        delete payload.height;
    }
    const resolvedQuality = resolveModelQualityOrResolution(
        modelInfo,
        params.quality || params.resolution || params.selectedQuality
    );
    if (resolvedQuality?.field && resolvedQuality?.value) {
        payload[resolvedQuality.field] = resolvedQuality.value;
    } else {
        delete payload.quality;
        delete payload.resolution;
    }
    if (params.image_url) { 
        payload.image_url = params.image_url; 
        payload.strength = params.strength || 0.6; 
    } else if (params.images_list) {
        payload.images_list = params.images_list;
    } else {
        payload.image_url = null;
    }
    if (params.seed && params.seed !== -1) payload.seed = params.seed;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60, modelInfo?.id || endpoint);
}

export async function generateI2I(apiKey, params) {
    const modelInfo = getI2IModelById(params.model) || (Array.isArray(i2iModels) ? i2iModels.find(m => m.endpoint === params.model || m.id === params.model) : null);
    const endpoint = modelInfo?.endpoint || params.model;
    const imageField = modelInfo?.imageField || 'image_url';
    const imagesList = normalizePrimaryImageUrls(params.images_list, params.image_url);
    const inputError = getImageInputValidationError(modelInfo, 'i2i', {
        prompt: params.prompt,
        primaryImageUrls: imagesList,
        auxiliaryImageUrls: params,
    });
    if (inputError) throw new Error(inputError);
    const payload = {
        ...mapReferenceParams(modelInfo, params),
        ...buildSupplementalInputPayload(modelInfo, params),
        ...buildImageInputPayload(modelInfo, 'i2i', params)
    };
    if (imagesList.length > 0) {
        if (imageField === 'images_list') payload.images_list = imagesList;
        else payload[imageField] = imagesList[0];
    }
    if (modelInfo) Object.assign(payload, buildImageSizePayload(modelInfo, params.aspect_ratio));
    else if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.width) payload.width = params.width;
    if (params.height) payload.height = params.height;
    if (modelInfo && !modelInfo.inputs?.width && !modelInfo.inputs?.height) {
        delete payload.width;
        delete payload.height;
    }
    const resolvedQuality = resolveModelQualityOrResolution(
        modelInfo,
        params.quality || params.resolution || params.selectedQuality
    );
    if (resolvedQuality?.field && resolvedQuality?.value) {
        payload[resolvedQuality.field] = resolvedQuality.value;
    } else {
        delete payload.quality;
        delete payload.resolution;
    }
    if (modelInfo?.inputs?.name) {
        payload.name = params.name || modelInfo.inputs.name.default;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 60, modelInfo?.id || endpoint);
}

export async function decomposeLayers(apiKey, params) {
    const endpoint = 'bytedance-seedream-5.0-pro-layer';
    const payload = {
        image_url: params.image_url,
        prompt: params.prompt || '',
        resolution: params.resolution || 'auto',
        output_format: params.output_format || 'png'
    };
    const result = await submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 300, endpoint);
    const rawImages = result.images || result.output?.images || result.outputs || (result.url ? [result.url] : []);
    const images = Array.isArray(rawImages) ? rawImages : [rawImages];
    return { ...result, images };
}

export async function generateVideo(apiKey, params) {
    const modelInfo = getVideoModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const mediaCapabilities = getModelMediaCapabilities(modelInfo);
    assertRequiredPrompt(modelInfo, params);
    let payload = {
        ...mapReferenceParams(modelInfo, params),
        ...buildSupplementalInputPayload(modelInfo, params)
    };
    if (params.prompt) payload.prompt = params.prompt;
    if (params.request_id) payload.request_id = params.request_id;
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (typeof params.generate_audio === 'boolean') payload.generate_audio = params.generate_audio;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    if (!mediaCapabilities.image.field && params.image_url) payload.image_url = params.image_url;
    if (!mediaCapabilities.image.field && params.images_list?.length > 0) payload.images_list = params.images_list;
    if (!mediaCapabilities.video.field && params.videos_list?.length > 0) payload.videos_list = params.videos_list;
    if (!mediaCapabilities.video.field && params.video_files?.length > 0) payload.video_files = params.video_files;
    Object.assign(payload, serializeVideoToolOptions(modelInfo, params.options));
    payload = includeRequiredArrayDefaults(modelInfo, payload);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || endpoint);
}

export async function generateI2V(apiKey, params) {
    const modelInfo = getI2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    assertRequiredPrompt(modelInfo, params);
    let payload = {
        ...mapReferenceParams(modelInfo, params),
        ...buildSupplementalInputPayload(modelInfo, params)
    };
    if (params.prompt) payload.prompt = params.prompt;
    if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
    if (params.duration) payload.duration = params.duration;
    if (params.resolution) payload.resolution = params.resolution;
    if (typeof params.generate_audio === 'boolean') payload.generate_audio = params.generate_audio;
    if (params.quality) payload.quality = params.quality;
    if (params.mode) payload.mode = params.mode;
    if (modelInfo?.inputs?.name) {
        payload.name = params.name || modelInfo.inputs.name.default;
    }
    payload = includeRequiredArrayDefaults(modelInfo, payload);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || endpoint);
}

export async function generateMarketingStudioAd(apiKey, params) {
    const endpoint = params.resolution === '1080p' ? 'sd-2-vip-omni-reference-1080p' : 'seedance-2-vip-omni-reference';
    const payload = {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || '16:9',
        duration: params.duration || 5,
        images_list: params.images_list || [],
        video_files: params.video_files || []
    };
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, endpoint);
}

export async function processV2V(apiKey, params) {
    const modelInfo = getV2VModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const toolPayload = buildVideoToolPayload(modelInfo, params);
    let payload = {
        ...buildSupplementalInputPayload(modelInfo, params),
        ...toolPayload,
        ...mapReferenceParams(modelInfo, params),
    };
    if (modelInfo?.hasPrompt && params.prompt) {
        payload.prompt = params.prompt;
    }
    if (getGroupedVideoConfiguration(modelInfo?.id)) {
        for (const field of ['duration', 'aspect_ratio', 'resolution', 'quality']) {
            if (modelInfo.inputs?.[field] && params[field] !== undefined) {
                payload[field] = params[field];
            }
        }
    }
    payload = includeRequiredArrayDefaults(modelInfo, payload);
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || endpoint);
}

export async function estimateV2VCost(params, signal) {
    const modelInfo = getV2VModelById(params?.model);
    const endpoint = modelInfo?.endpoint || params?.model;
    if (!endpoint) {
        throw new Error('A V2V model is required to estimate cost.');
    }

    const payload = buildVideoToolPayload(modelInfo, params);
    const response = await fetch(`${BASE_URL}/api/v1/models/${endpoint}/estimate-cost`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
    });

    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Cost estimate failed: ${response.status} ${response.statusText} - ${errText.slice(0, 100)}`);
    }

    let data;
    try {
        data = await response.json();
    } catch {
        throw new Error('Cost estimate returned invalid JSON.');
    }

    if (typeof data?.cost !== 'number' || !Number.isFinite(data.cost) || data.cost < 0) {
        throw new Error('Cost estimate returned an invalid cost.');
    }
    if (typeof data.currency !== 'string' || !/^[A-Za-z]{3}$/.test(data.currency.trim())) {
        throw new Error('Cost estimate returned an invalid currency.');
    }

    return {
        cost: data.cost,
        currency: data.currency.trim().toUpperCase(),
    };
}

export async function processRecast(apiKey, params) {
    const modelInfo = getRecastModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const videoField = modelInfo?.videoField || 'video_url';
    const payload = { [videoField]: params.video_url };
    if (modelInfo?.imageField && params.image_url) {
        payload[modelInfo.imageField] = params.image_url;
    }
    if (modelInfo?.hasPrompt && params.prompt) {
        payload.prompt = params.prompt;
    }
    if (params.aspect_ratio) {
        payload.aspect_ratio = params.aspect_ratio;
    }
    if (params.character_orientation) {
        payload.character_orientation = params.character_orientation;
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || endpoint);
}

export async function processMotionControl(apiKey, params) {
    const model = params.model || 'seedance-2.5-motion-control';
    const mode = params.mode || 'motion_transfer';
    const internalPrompt = mode === 'objects_swap'
        ? "Keep the rest of the scene as filmed, swap the characters, products, or clothes with the reference images."
        : "Extract motion from the reference video and rebuild the scene with the new characters and assets, preserving the original motion, choreography, and camera movements.";

    const userPrompt = String(params.prompt || '').trim();
    const finalPrompt = userPrompt ? `${internalPrompt} ${userPrompt}` : internalPrompt;

    let imagesList = [];
    if (Array.isArray(params.images_list)) {
        imagesList = params.images_list;
    } else if (params.images) {
        imagesList = Array.isArray(params.images) ? params.images : [params.images];
    } else if (params.image_url) {
        imagesList = [params.image_url];
    }

    let duration = Number(params.duration) || 5;

    const payload = {
        video_url: params.video_url,
        images_list: imagesList,
        aspect_ratio: params.aspect_ratio || '16:9',
        duration: duration,
        generate_audio: !!params.generate_audio,
        prompt: finalPrompt
    };

    if (model === 'seedance-2-motion-control') {
        if (payload.duration > 15) payload.duration = 15;
        if (payload.duration < 4) payload.duration = 4;
        if (payload.images_list.length > 9) payload.images_list = payload.images_list.slice(0, 9);
        payload.quality = params.quality === 'basic' ? 'basic' : 'high';
        if (params.seed !== undefined && params.seed !== -1) payload.seed = Number(params.seed);
    } else {
        if (payload.duration > 30) payload.duration = 30;
        if (payload.duration < 4) payload.duration = 4;
        if (payload.images_list.length > 30) payload.images_list = payload.images_list.slice(0, 30);
        payload.high_bitrate = !!params.high_bitrate;
        if (params.seed !== undefined && params.seed !== -1) payload.seed = Number(params.seed);
    }

    return submitAndPoll(model, payload, apiKey, params.onRequestId, 900, model);
}

export async function processLipSync(apiKey, params) {
    const modelInfo = getLipSyncModelById(params.model);
    const endpoint = modelInfo?.endpoint || params.model;
    const payload = {};
    if (params.audio_url) payload.audio_url = params.audio_url;
    if (params.image_url) payload.image_url = params.image_url;
    if (params.video_url) payload.video_url = params.video_url;
    if (modelInfo?.hasPrompt) payload.prompt = params.prompt || '';
    if (params.resolution) payload.resolution = params.resolution;
    if (params.seed !== undefined && params.seed !== -1) payload.seed = params.seed;
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || endpoint);
}

export async function generateAudio(apiKey, params) {
    const modelId = params._modelId || params.model;
    const modelInfo = getAudioModelById(modelId);
    const endpoint = modelInfo?.endpoint || modelId;
    const payload = {};
    const skipKeys = ['_modelId', 'onRequestId'];
    for (const key in params) {
        if (!skipKeys.includes(key) && params[key] !== undefined && params[key] !== null) {
            payload[key] = params[key];
        }
    }
    return submitAndPoll(endpoint, payload, apiKey, params.onRequestId, 900, modelInfo?.id || modelId);
}

export async function uploadFile(apiKey, file, onProgress) {
    let uploadKey = apiKey || (typeof window !== 'undefined' && window.__KOYOSIM_REQUIRE_API_KEY__
        ? await window.__KOYOSIM_REQUIRE_API_KEY__()
        : null);
    if (!uploadKey) {
        const cookieMatch = typeof document !== 'undefined' && document.cookie.match(/muapi_key=([^;]+)/);
        if (cookieMatch) uploadKey = cookieMatch[1];
    }
    if (!uploadKey) uploadKey = 'koyosim-account-session';

    return new Promise((resolve, reject) => {
        const url = `${BASE_URL}/api/v1/upload_file`;
        const formData = new FormData();
        formData.append('file', file);

        const xhr = new XMLHttpRequest();
        xhr.open('POST', url);
        xhr.setRequestHeader('x-api-key', uploadKey);
        xhr.timeout = FILE_UPLOAD_TIMEOUT_MS;

        if (onProgress) {
            xhr.upload.onprogress = (event) => {
                if (event.lengthComputable) {
                    const percentComplete = Math.min(
                        Math.round((event.loaded / event.total) * 100),
                        FILE_UPLOAD_PENDING_PROGRESS
                    );
                    onProgress(percentComplete);
                }
            };
        }

        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const data = JSON.parse(xhr.responseText);
                    const fileUrl = data.url || data.file_url || data.data?.url;
                    if (!fileUrl) {
                        reject(new Error('No URL returned from file upload'));
                    } else {
                        onProgress?.(100);
                        resolve(fileUrl);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse upload response'));
                }
            } else {
                let detail = xhr.statusText;
                try {
                    const errObj = JSON.parse(xhr.responseText);
                    detail = errObj.detail || detail;
                } catch (e) {
                    // fallback to statusText
                }
                notifyAuthRequired(xhr.status, detail);
                reject(new Error(`File upload failed: ${xhr.status} - ${detail}`));
            }
        };

        xhr.onerror = () => reject(new Error('Network error during file upload'));
        xhr.ontimeout = () => reject(new Error('File upload timed out. Please try again.'));
        xhr.send(formData);
    });
}

export async function getUserBalance(apiKey) {
    const response = await fetch(`${BASE_URL}/api/v1/account/balance`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        notifyAuthRequired(response.status, errText);
        throw new Error(`Failed to fetch balance: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function getTemplateWorkflows(apiKey) {
    const response = await fetch(`${BASE_URL}/workflow/get-template-workflows`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    // The template catalogue is optional upstream content: a 404 means "no
    // published templates", which must render an empty gallery rather than an error.
    if (response.status === 404) {
        return [];
    }
    if (!response.ok) {
        const errText = await response.text();
        notifyAuthRequired(response.status, errText);
        throw new Error(`Failed to fetch template workflows: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function getUserWorkflows(apiKey) {
    const response = await fetch(`${BASE_URL}/workflow/get-workflow-defs`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch user workflows: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function getPublishedWorkflows(apiKey) {
    const response = await fetch(`${BASE_URL}/workflow/get-published-workflows`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch published workflows: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

// Agents — uses direct URL → https://api.muapi.ai/agents/...
export async function getTemplateAgents(apiKey) {
    const response = await fetch(`${BASE_URL}/agents/templates/agents`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch template agents: ${response.status} - ${errText.slice(0, 100)}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.agents || data.items || []);
};

export async function getUserAgents(apiKey) {
    const response = await fetch(`${BASE_URL}/agents/user/agents`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch user agents: ${response.status} - ${errText.slice(0, 100)}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.agents || data.items || []);
};

export async function getPublishedAgents(apiKey) {
    // MuAPI: GET /agents/featured/agents
    const response = await fetch(`${BASE_URL}/agents/featured/agents`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch featured agents: ${response.status} - ${errText.slice(0, 100)}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : (data.agents || data.items || []);
};

// GET /agents/user/conversations — returns the user's chat history across all agents
export async function getUserConversations(apiKey) {
    const response = await fetch(`${BASE_URL}/agents/user/conversations`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch conversations: ${response.status} - ${errText.slice(0, 100)}`);
    }
    const data = await response.json();
    return Array.isArray(data) ? data : [];
};

// GET /agents/by-slug/{slug} — public agent details (works unauthenticated for
// published/template agents; x-api-key is sent for consistency but not required).
export async function getAgentBySlug(apiKey, slug) {
    const response = await fetch(`${BASE_URL}/agents/by-slug/${slug}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch agent: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// GET /agents/by-slug/{slug}/{conversationId} — chat history for one conversation.
export async function getAgentConversation(apiKey, agentSlug, conversationId) {
    const response = await fetch(`${BASE_URL}/agents/by-slug/${agentSlug}/${conversationId}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch conversation: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// POST /agents/by-slug/{slug}/chat — send a message, returns {request_id, status}
// to poll via pollAgentChatResult.
export async function sendAgentChatMessage(apiKey, agentSlug, { message, conversationId, attachments } = {}) {
    const response = await fetch(`${BASE_URL}/agents/by-slug/${agentSlug}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({
            message,
            conversation_id: conversationId || null,
            attachments: attachments || null,
            stream: false
        })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to send message: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// Polls /api/v1/predictions/{requestId}/result until the agent turn completes.
// Unlike submitAndPoll's generic media polling, a completed agent-chat result is
// the full {conversation_id, messages, is_complete, suggestions} envelope, not a
// media URL — while processing, the endpoint doesn't surface intermediate status
// text (get_result_url_from_output only returns output_data once COMPLETED), so
// this just waits until is_complete rather than showing incremental progress.
export async function pollAgentChatResult(apiKey, requestId, { maxAttempts = 150, interval = 2000 } = {}) {
    const url = `${BASE_URL}/api/v1/predictions/${requestId}/result`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey
            }
        });
        if (response.status === 400) {
            const errBody = await response.json().catch(() => ({}));
            throw new Error(errBody?.detail?.error || 'Agent failed to respond');
        }
        if (!response.ok) {
            if (attempt === maxAttempts) throw new Error(`Poll failed: ${response.status}`);
            continue;
        }
        const data = await response.json();
        if (data.is_complete) return data;
    }
    throw new Error('Agent response timed out.');
}

// POST /agents — create a new persona agent (no skill picker in this minimal
// embedded form; skill_ids defaults to [] server-side, so the agent is created
// as a plain system-prompt-driven assistant with no extra tool skills attached).
export async function createAgent(apiKey, payload) {
    const response = await fetch(`${BASE_URL}/agents`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create agent: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function createWorkflow(apiKey, payload) {
    const response = await fetch(`${BASE_URL}/workflow/create`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to create workflow: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function updateWorkflowName(apiKey, workflowId, name) {
    const response = await fetch(`${BASE_URL}/workflow/update-name/${workflowId}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ name })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to rename workflow: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function deleteWorkflow(apiKey, workflowId) {
    const response = await fetch(`${BASE_URL}/workflow/delete-workflow-def/${workflowId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to delete workflow: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function getWorkflowInputs(apiKey, workflowId) {
    const response = await fetch(`${BASE_URL}/workflow/${workflowId}/api-inputs`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch workflow inputs: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function executeWorkflow(apiKey, workflowId, inputs) {
    const response = await fetch(`${BASE_URL}/workflow/${workflowId}/api-execute`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ inputs })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to execute workflow: ${response.status} - ${errText.slice(0, 100)}`);
    }
    const submitData = await response.json();
    const runId = submitData.run_id || submitData.id;
    if (!runId) return submitData;
    
    // Poll for results
    return await pollWorkflowResult(runId, apiKey);
};

async function pollWorkflowResult(runId, apiKey, maxAttempts = 900, interval = 2000) {
    const pollUrl = `${BASE_URL}/workflow/run/${runId}/api-outputs`;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise(resolve => setTimeout(resolve, interval));
        try {
            const response = await fetch(pollUrl, {
                headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
            });
            if (!response.ok) {
                if (response.status >= 500) continue;
                throw new Error(`Poll Failed: ${response.status}`);
            }
            const data = await response.json();
            const status = data.status?.toLowerCase();
            if (status === 'completed' || status === 'succeeded' || status === 'success') return data;
            if (status === 'failed' || status === 'error') throw new Error(`Workflow failed: ${data.error || 'Unknown error'}`);
        } catch (error) {
            if (attempt === maxAttempts) throw error;
        }
    }
    throw new Error('Workflow timed out after polling.');
};

export async function getAllNodeSchemas(apiKey, workflowId) {
    const response = await fetch(`${BASE_URL}/workflow/${workflowId}/node-schemas`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch node schemas: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function getWorkflowData(apiKey, workflowId) {
    const response = await fetch(`${BASE_URL}/workflow/get-workflow-def/${workflowId}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch workflow data: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
};

export async function getNodeSchemas(apiKey, workflowId) {
    const response = await fetch(`${BASE_URL}/workflow/${workflowId}/api-node-schemas`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch node schemas: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function runSingleNode(apiKey, workflowId, nodeId, payload) {
    const response = await fetch(`${BASE_URL}/workflow/${workflowId}/node/${nodeId}/run`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify(payload)
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to run single node: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function deleteNodeRun(apiKey, nodeRunId) {
    const response = await fetch(`${BASE_URL}/workflow/node-run/${nodeRunId}`, {
        method: 'DELETE',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to delete node run: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function getNodeStatus(apiKey, runId) {
    const response = await fetch(`${BASE_URL}/workflow/run/${runId}/status`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to get node status: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

/**
 * Handle proxy requests centralizing communication logic with MuAPI.
 * This is used by the server-side entry points.
 */
export async function handleProxyRequest(prefix, path, method, headers, body, apiKey) {
    const url = `${BASE_URL}/${prefix}/${path}`;
    
    const finalHeaders = new Headers(headers);
    finalHeaders.delete('host');
    finalHeaders.delete('connection');
    finalHeaders.delete('content-length'); // Let fetch recalculate this for safety

    if (apiKey) {
        finalHeaders.set('x-api-key', apiKey);
    }

    try {
        const response = await fetch(url, {
            method,
            headers: finalHeaders,
            body: (method !== 'GET' && method !== 'HEAD') ? body : undefined,
            redirect: 'follow',
        });

        const contentType = response.headers.get('Content-Type') || 'application/json';
        const buffer = await response.arrayBuffer();
        
        return {
            status: response.status,
            contentType,
            data: buffer
        };
    } catch (error) {
        console.error(`MuAPI Proxy error for ${url}:`, error);
        throw error;
    }
}

/**
 * A centralized handler for Next.js API routes or middleware.
 */
export async function handleServerSideProxy(prefix, request, params, apiKey) {
    try {
        const slug = await params;
        const pathSegments = slug.path || [];
        const path = pathSegments.join('/');
        
        const method = request.method;
        let body = null;
        if (method !== 'GET' && method !== 'HEAD') {
            body = await request.arrayBuffer();
        }

        const { search } = new URL(request.url);
        const pathWithSearch = search ? `${path}${search}` : path;

        return await handleProxyRequest(
            prefix, 
            pathWithSearch, 
            method, 
            request.headers, 
            body, 
            apiKey
        );
    } catch (error) {
        console.error(`Server proxy failed:`, error);
        throw error;
    }
}

export async function calculateDynamicCost(apiKey, taskName, payload) {
    const response = await fetch(`${BASE_URL}/api/v1/app/calculate_dynamic_cost`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ task_name: taskName, payload })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to calculate dynamic cost: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function registerAppInterest(apiKey, appName) {
    const response = await fetch(`${BASE_URL}/app/interest`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        },
        body: JSON.stringify({ app_name: appName })
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to register interest: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function getAppInterests(apiKey) {
    const response = await fetch(`${BASE_URL}/app/interests`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch interests: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// Paginated past-generations list, scoped server-side to the calling identity
// (BYOK key or white-label session token) — see GET /api/v1/history.
export async function getHistory(apiKey, { cursor, limit = 50 } = {}) {
    const params = new URLSearchParams();
    if (cursor) params.set('cursor', cursor);
    if (limit) params.set('limit', String(limit));
    const response = await fetch(`${BASE_URL}/api/v1/history?${params.toString()}`, {
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey
        }
    });
    if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Failed to fetch history: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

// DELETE /api/v1/predictions/{requestId}/media — strips input/output media
// URLs from the request (S3 objects removed) and clears them from the row;
// used to back the "delete generated item" action against server-backed
// (backfilled) history lists, since removing an item from local component
// state alone doesn't touch the server record or its stored media.
export async function deleteMedia(apiKey, requestId) {
    const response = await fetch(`${BASE_URL}/api/v1/predictions/${requestId}/media`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey }
    });
    if (!response.ok) {
        const errText = await response.text();
        notifyAuthRequired(response.status, errText);
        throw new Error(`Failed to delete: ${response.status} - ${errText.slice(0, 100)}`);
    }
    return await response.json();
}

export async function runClipping(apiKey, params) {
    const payload = {
        video_url: params.video_url,
        num_highlights: params.num_highlights || 3,
        aspect_ratio: params.aspect_ratio || "9:16",
        return_coordinates_only: !!params.return_coordinates_only
    };
    return submitAndPoll("ai-clipping", payload, apiKey, params.onRequestId, 900, "ai-clipping");
}

export async function runMotionGraphics(apiKey, params) {
    const payload = {
        prompt: params.prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration_seconds: params.duration_seconds || 6,
    };
    return submitAndPoll("motion-graphics", payload, apiKey, params.onRequestId, 900, "motion-graphics");
}

export async function runMotionGraphicsEdit(apiKey, params) {
    const payload = {
        request_id: params.request_id,
        edit_prompt: params.edit_prompt,
        aspect_ratio: params.aspect_ratio || "16:9",
        duration_seconds: params.duration_seconds || 6,
    };
    return submitAndPoll("motion-graphics-edit", payload, apiKey, params.onRequestId, 900, "motion-graphics-edit");
}

export async function upscaleImage(apiKey, { model, image_url, resolution, upscale_factor, onRequestId }) {
    let endpoint = model;
    let payload = { image_url };
    if (model === "seedvr2-image-upscale") {
        payload.resolution = resolution || "4k";
    } else if (model === "topaz-image-upscale") {
        payload.upscale_factor = Number(upscale_factor) || 2;
    } else if (model === "ai-image-upscaler") {
        endpoint = "ai-image-upscale";
    }
    return submitAndPoll(endpoint, payload, apiKey, onRequestId, 90, model);
}

export async function removeBackground(apiKey, { image_url, onRequestId }) {
    const endpoint = "ai-background-remover";
    const payload = { image_url };
    return submitAndPoll(endpoint, payload, apiKey, onRequestId, 90, endpoint);
}

export async function expandImage(apiKey, { image_url, onRequestId }) {
    const endpoint = "ai-image-extension";
    const payload = { image_url };
    return submitAndPoll(endpoint, payload, apiKey, onRequestId, 90, endpoint);
}
