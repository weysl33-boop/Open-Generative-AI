import 'server-only';

import * as catalogRepo from '../repositories/aiCatalog.js';

// Application boundary for model-catalog administration. Route handlers keep
// request/auth concerns here and do not couple themselves to repository SQL.
export const listCanonicalModels = (options) => catalogRepo.listCanonicalModels(options);
export const getCanonicalModelById = (id) => catalogRepo.getCanonicalModelById(id);
export const upsertCanonicalModel = (model) => catalogRepo.upsertCanonicalModel(model);
export const listProviders = () => catalogRepo.listProviders();
export const getProviderById = (id) => catalogRepo.getProviderById(id);
export const createProvider = (provider) => catalogRepo.createProvider(provider);
export const updateProvider = (id, updates) => catalogRepo.updateProvider(id, updates);
export const deleteProvider = (id) => catalogRepo.deleteProvider(id);
export const listProviderModelsByModelId = (modelId, options) => catalogRepo.listProviderModelsByModelId(modelId, options);
export const getProviderModelById = (id) => catalogRepo.getProviderModelById(id);
export const upsertProviderModel = (mapping) => catalogRepo.upsertProviderModel(mapping);
export const deleteProviderModel = (id) => catalogRepo.deleteProviderModel(id);
export const getRoutingPolicy = (modelId) => catalogRepo.getRoutingPolicy(modelId);
export const upsertRoutingPolicy = (policy) => catalogRepo.upsertRoutingPolicy(policy);
export const getModelPricing = (modelId) => catalogRepo.getModelPricing(modelId);
export const upsertModelPricing = (pricing) => catalogRepo.upsertModelPricing(pricing);
export const listCanonicalPricingRows = () => catalogRepo.listCanonicalPricingRows();
