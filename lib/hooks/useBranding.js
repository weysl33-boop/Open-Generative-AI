'use client';

import { useState, useEffect } from 'react';

export const DEFAULT_BRAND = {
  brandName: 'koyosim',
  brandSlogan: 'AI 创意工作室',
  logoType: 'icon',
  logoUrl: '',
  logoIcon: 'layers',
  logoBgColor: '#22d3ee',
  logoTextColor: '#000000',
  logoHref: '/studio',
  logoTarget: '_self',
  showBrandName: true,
};

export const DEFAULT_NAVIGATION = [
  {
    id: 'nav_community',
    label: '即梦社区',
    labelEn: 'Community',
    href: '/community',
    icon: 'flame',
    iconColor: '#fb923c',
    style: 'gradient',
    badge: 'HOT',
    enabled: true,
    target: '_self',
    order: 1,
  },
  {
    id: 'nav_creations',
    label: '我的作品',
    labelEn: 'My Creations',
    href: '/creations',
    icon: 'folder',
    iconColor: '#facc15',
    style: 'subtle',
    badge: '',
    enabled: true,
    target: '_self',
    order: 2,
  },
];

let cachedBranding = null;
let fetchPromise = null;

export function useBranding() {
  const [brand, setBrand] = useState(cachedBranding?.brand || DEFAULT_BRAND);
  const [navigation, setNavigation] = useState(cachedBranding?.navigation || DEFAULT_NAVIGATION);
  const [isLoading, setIsLoading] = useState(!cachedBranding);

  useEffect(() => {
    let isMounted = true;

    if (cachedBranding) {
      setBrand(cachedBranding.brand);
      setNavigation(cachedBranding.navigation);
      setIsLoading(false);
      return;
    }

    if (!fetchPromise) {
      fetchPromise = fetch('/api/site/branding', { cache: 'no-store' })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.brand && data?.navigation) {
            cachedBranding = {
              brand: { ...DEFAULT_BRAND, ...data.brand },
              navigation: Array.isArray(data.navigation) ? data.navigation : DEFAULT_NAVIGATION,
            };
          }
          return cachedBranding;
        })
        .catch(() => null)
        .finally(() => {
          fetchPromise = null;
        });
    }

    fetchPromise.then((result) => {
      if (isMounted && result) {
        setBrand(result.brand);
        setNavigation(result.navigation);
        setIsLoading(false);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  return {
    brand,
    navigation,
    isLoading,
  };
}
