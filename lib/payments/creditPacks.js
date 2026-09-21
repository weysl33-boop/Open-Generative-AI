const CREDIT_PACKS = [
  { id: 'credit_490', credits: 490, priceCny: 49, displayOrder: 1, featured: true },
  { id: 'credit_1400', credits: 1400, priceCny: 140, displayOrder: 2 },
  { id: 'credit_2100', credits: 2100, priceCny: 210, displayOrder: 3 },
  { id: 'credit_3500', credits: 3500, priceCny: 350, displayOrder: 4 },
  { id: 'credit_7000', credits: 7000, priceCny: 700, displayOrder: 5 },
  { id: 'credit_14000', credits: 14000, priceCny: 1400, displayOrder: 6 },
  { id: 'credit_70000', credits: 70000, priceCny: 7000, displayOrder: 7 },
].map((pack) => Object.freeze({ ...pack, name: `${pack.credits.toLocaleString('en-US')} 通用算力` }));

export function listCreditPacks() {
  return CREDIT_PACKS.map((pack) => ({ ...pack }));
}

export function findCreditPackById(id) {
  const pack = CREDIT_PACKS.find((item) => item.id === String(id || ''));
  return pack ? { ...pack } : null;
}
