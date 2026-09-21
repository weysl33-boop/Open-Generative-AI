"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import toast, { Toaster } from "react-hot-toast";
import { ArrowUp, Image as ImageIcon, Pencil } from "lucide-react";
import { Spinner } from "../ui/Feedback";
import { generateImage, generateI2I, uploadFile, resolveModelQualityOrResolution } from "../muapi.js";
export { resolveModelQualityOrResolution };
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import DrawModal from "./DrawModal.jsx";
import ModelParameterControls from "./ModelParameterControls.jsx";
import MobileGenerationActions, {
  GenerationCopyButtons,
} from "./MobileGenerationActions.jsx";
import {
  t2iModels,
  getAspectRatiosForModel,
  getResolutionsForModel,
  getQualityFieldForModel,
  getAspectRatiosForI2IModel,
  getResolutionsForI2IModel,
  getQualityFieldForI2IModel,
  getMaxImagesForI2IModel,
  getEffectsForI2IModel,
  getDefaultEffectForI2IModel,
  getI2IModelById,
} from "../models.js";
import {
  getFamilyVariant,
  getImageReferenceVariant,
  imageModelCatalog,
  imageModelPickerEntries,
  imageModelPickerEntryByVariantId,
} from "../modelFamilies.js";
import {
  buildReferenceParams,
  getModelMediaCapabilities,
} from "../modelCapabilities.js";
import {
  buildSupplementalInputPayload,
  createModelParameterValues,
  getSupplementalModelInputs,
} from "../modelParameters.js";
import {
  PROMPT_CONTROL_LABEL_CLASS,
  PROMPT_MEDIA_PREVIEW_CLASS,
  PromptAspectRatioIcon,
  PromptAction,
  PromptChevronIcon,
  PromptComposer,
  PromptControls,
  PromptFooter,
  PromptMenuItem,
  PromptMenuList,
  PromptPopover,
  PromptPopoverHeader,
  PromptQualityIcon,
  PromptTextarea,
  promptControlClassName,
  promptMediaButtonClassName,
} from "./prompt/PromptComposer.jsx";
import en from "../messages/en/imageStudio.json";
import zh from "../messages/zh/imageStudio.json";
import ja from "../messages/ja-JP/imageStudio.json";
import ko from "../messages/ko-KR/imageStudio.json";
import zhTw from "../messages/zh-TW/imageStudio.json";
import es from "../messages/es/imageStudio.json";
import { resolveCopy } from "../i18nUtils";
import {
  PROVIDER_LOGOS,
  invertLogos,
  getProviderLogo,
  getProviderStyle,
} from "../providerLogos.js";
import { getModelDescription, getModelBadge } from "../modelDescriptions.js";

// ─── helpers ────────────────────────────────────────────────────────────────

export function calculatePixelDimensions(ar, quality = "2K") {
  const is4K = typeof quality === "string" && (quality.includes("4K") || quality.includes("4k") || quality.includes("ultra"));
  const is15K = typeof quality === "string" && (quality.includes("1.5K") || quality.includes("1K") || quality.includes("720") || quality.includes("standard"));
  
  if (!ar || ar === "adaptive" || ar === "auto" || ar === "智能") {
    return { width: is4K ? 3840 : is15K ? 1024 : 2048, height: is4K ? 3840 : is15K ? 1024 : 2048, isAdaptive: true };
  }

  const strAr = String(ar);
  const ratioMap = {
    "1:1": is4K ? [4096, 4096] : is15K ? [1024, 1024] : [2048, 2048],
    "3:4": is4K ? [2880, 3840] : is15K ? [768, 1024] : [1728, 2304],
    "4:3": is4K ? [3840, 2880] : is15K ? [1024, 768] : [2304, 1728],
    "16:9": is4K ? [3840, 2160] : is15K ? [1280, 720] : [2560, 1440],
    "9:16": is4K ? [2160, 3840] : is15K ? [720, 1280] : [1440, 2560],
    "2:3": is4K ? [2730, 4096] : is15K ? [682, 1024] : [1664, 2496],
    "3:2": is4K ? [4096, 2730] : is15K ? [1024, 682] : [2496, 1664],
    "21:9": is4K ? [5040, 2160] : is15K ? [1680, 720] : [2880, 1234],
    "9:21": is4K ? [2160, 5040] : is15K ? [720, 1680] : [1234, 2880],
  };

  const found = ratioMap[strAr];
  if (found) {
    return { width: found[0], height: found[1], isAdaptive: false };
  }

  // Fallback ratio calculation
  const parts = strAr.split(":").map(Number);
  if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && parts[1] !== 0) {
    const base = is4K ? 4096 : is15K ? 1024 : 2048;
    const r = parts[0] / parts[1];
    if (r >= 1) {
      return { width: base, height: Math.round(base / r), isAdaptive: false };
    } else {
      return { width: Math.round(base * r), height: base, isAdaptive: false };
    }
  }

  return { width: 2048, height: 2048, isAdaptive: false };
}

export function findClosestAspectRatio(width, height) {
  if (!width || !height || width <= 0 || height <= 0) return "1:1";
  const ratio = width / height;
  const standardRatios = [
    { label: "1:1", val: 1 },
    { label: "16:9", val: 16 / 9 },
    { label: "9:16", val: 9 / 16 },
    { label: "4:3", val: 4 / 3 },
    { label: "3:4", val: 3 / 4 },
    { label: "3:2", val: 3 / 2 },
    { label: "2:3", val: 2 / 3 },
    { label: "21:9", val: 21 / 9 },
    { label: "9:21", val: 9 / 21 },
  ];
  let closest = standardRatios[0];
  let minDiff = Math.abs(ratio - standardRatios[0].val);
  for (const item of standardRatios) {
    const diff = Math.abs(ratio - item.val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }
  return closest.label;
}

export function findClosestSupportedAspectRatio(width, height, supportedRatios = []) {
  if (!width || !height || width <= 0 || height <= 0) {
    return supportedRatios[0] || "1:1";
  }
  const ratio = width / height;
  const ratiosToSearch = (supportedRatios && supportedRatios.length > 0)
    ? supportedRatios
    : ["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3", "21:9", "9:21"];

  const parseVal = (r) => {
    const parts = String(r).split(":").map(Number);
    if (parts.length === 2 && parts[1] !== 0 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return parts[0] / parts[1];
    }
    return 1;
  };

  let closest = ratiosToSearch[0];
  let minDiff = Math.abs(ratio - parseVal(ratiosToSearch[0]));

  for (const item of ratiosToSearch) {
    const val = parseVal(item);
    const diff = Math.abs(ratio - val);
    if (diff < minDiff) {
      minDiff = diff;
      closest = item;
    }
  }
  return closest;
}

export function extractOutputUrl(res) {
  if (!res) return null;
  if (typeof res === "string") return res;
  if (res.url && typeof res.url === "string") return res.url;
  if (res.result_url && typeof res.result_url === "string") return res.result_url;
  if (res.image_url && typeof res.image_url === "string") return res.image_url;
  if (Array.isArray(res.outputs) && res.outputs.length > 0) {
    const first = res.outputs[0];
    return typeof first === "string" ? first : first?.url || null;
  }
  if (Array.isArray(res.output) && res.output.length > 0) {
    const first = res.output[0];
    return typeof first === "string" ? first : first?.url || null;
  }
  if (res.output && typeof res.output === "string") return res.output;
  if (res.output?.url && typeof res.output.url === "string") return res.output.url;
  if (Array.isArray(res.images) && res.images.length > 0) {
    const first = res.images[0];
    return typeof first === "string" ? first : first?.url || null;
  }
  return null;
}

export function AspectLineIcon({ ratio, active = false, className = "" }) {
  if (ratio === "adaptive" || ratio === "auto" || ratio === "智能") {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M4 9V5a1 1 0 0 1 1-1h4" />
        <path d="M20 9V5a1 1 0 0 0-1-1h-4" />
        <path d="M4 15v4a1 1 0 0 0 1 1h4" />
        <path d="M20 15v4a1 1 0 0 1-1 1h-4" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  if (ratio === "custom") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
        <path d="M4 7V4h3" />
        <path d="M20 7V4h-3" />
        <path d="M4 17v3h3" />
        <path d="M20 17v3h-3" />
        <rect x="7" y="7" width="10" height="10" rx="1.5" strokeDasharray="2 2" />
      </svg>
    );
  }

  const borderClass = active ? "border-brand bg-brand-pressed" : "border-line-strong group-hover:border-brand-line";

  switch (ratio) {
    case "1:1":
      return <div className={`w-4 h-4 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "3:4":
      return <div className={`w-3.5 h-4.5 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "4:3":
      return <div className={`w-4.5 h-3.5 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "16:9":
      return <div className={`w-5 h-3 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "9:16":
      return <div className={`w-3 h-5 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "2:3":
      return <div className={`w-3 h-4.5 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "3:2":
      return <div className={`w-4.5 h-3 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    case "21:9":
      return <div className={`w-5.5 h-2.5 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
    default:
      return <div className={`w-4 h-4 rounded-xs border-2 ${borderClass} transition-colors ${className}`} />;
  }
}

async function downloadImage(url, filename) {
  try {
    const response = await fetch(url);
    const blob = await response.blob();
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(url, "_blank");
  }
}

// ─── UploadButton (inline picker) ───────────────────────────────────────────

function UploadButton({ apiKey, maxImages, onSelect, onClear, initialUrls = [], label = null, persistedHistory = null, onHistoryChange = null, copy }) {
  const t = copy.uploadButton;
  const [panelOpen, setPanelOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [selectedEntries, setSelectedEntries] = useState([]); // [{url, thumbnail}]
  const [uploadHistory, setUploadHistory] = useState(persistedHistory || []); // [{id, name, url, thumbnail}]
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  // Notify parent whenever uploadHistory changes (for localStorage persistence)
  const onHistoryChangeRef = useRef(onHistoryChange);
  onHistoryChangeRef.current = onHistoryChange;
  useEffect(() => {
    onHistoryChangeRef.current?.(uploadHistory);
  }, [uploadHistory]);

  // Sync if parent provides a new persistedHistory (e.g. on first mount from localStorage)
  useEffect(() => {
    if (persistedHistory && persistedHistory.length > 0) {
      setUploadHistory((prev) => {
        // Merge: add any entries from persistedHistory that aren't already present
        const existingUrls = new Set(prev.map(h => h.url));
        const missing = persistedHistory.filter(h => h.url && !existingUrls.has(h.url));
        return missing.length > 0 ? [...prev, ...missing] : prev;
      });
    }
  }, [persistedHistory]);
  
  const [lastUploadProgress, setLastUploadProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const triggerRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    if (!panelOpen) return;
    const handler = (e) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target)
      ) {
        setPanelOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [panelOpen]);

  // Sync initialUrls from parent (e.g. restored from localStorage)
  useEffect(() => {
    const nextUrls = initialUrls || [];
    const currentUrls = selectedEntries.map((entry) => entry.url);
    const isSame =
      nextUrls.length === currentUrls.length &&
      nextUrls.every((url, index) => url === currentUrls[index]);
    if (isSame) return;

    setSelectedEntries(nextUrls.map((url) => ({ url })));
    if (nextUrls.length === 0) return;

    // Also ensure restored selections are available in the history panel.
    setUploadHistory((history) => {
      const existingUrls = new Set(history.map((entry) => entry.url));
      const missing = nextUrls
        .filter((url) => !existingUrls.has(url))
        .map((url) => ({
          id: `restored-${url}`,
          name: "Restored Image",
          url,
          progress: 100,
        }));
      return missing.length > 0 ? [...missing, ...history] : history;
    });
  }, [initialUrls]); // eslint-disable-line react-hooks/exhaustive-deps

  // When maxImages changes, trim excess selections
  useEffect(() => {
    if (selectedEntries.length > maxImages) {
      const trimmed = selectedEntries.slice(0, maxImages);
      setSelectedEntries(trimmed);
      if (trimmed.length === 0) onClear?.();
    }
    if (fileInputRef.current) {
      fileInputRef.current.multiple = maxImages > 1;
    }
  }, [maxImages]); // eslint-disable-line react-hooks/exhaustive-deps

  const fireOnSelect = useCallback(
    (entries) => {
      if (!entries.length) return;
      const urls = entries.map((e) => e.url);
      onSelectRef.current?.({ url: urls[0], urls, thumbnail: entries[0].url });
    },
    [],
  );

  const handleFileChange = async (e) => {
    const files = Array.from(e.target.files);
    e.target.value = "";
    await processFiles(files);
  };

  const processFiles = async (files) => {
    if (!files.length) return;

    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const tooLarge = files.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        t.tooLargeAlert.replace("{names}", tooLarge.map((f) => f.name).join(", ")),
      );
      return;
    }

    setUploading(true);
    try {
      const toUpload =
        maxImages === 1
          ? files.slice(0, 1)
          : files.slice(0, maxImages - selectedEntries.length || 1);

      await Promise.all(
        toUpload.map(async (file) => {
          const id = Date.now().toString() + Math.random();

          // Add a placeholder to history immediately without local preview
          const placeholder = { id, name: file.name, url: null, progress: 0 };
          setUploadHistory((prev) => [placeholder, ...prev]);

          try {
            const uploadedUrl = await uploadFile(apiKey, file, (pct) => {
              setLastUploadProgress(pct);
              setUploadHistory((prev) =>
                prev.map((h) => (h.id === id ? { ...h, progress: pct } : h)),
              );
            });

            // Update history with real URL and Mark as 100%
            setUploadHistory((prev) =>
              prev.map((h) => {
                if (h.id === id) {
                  return { ...h, url: uploadedUrl, progress: 100 };
                }
                return h;
              }),
            );

            // Auto-select if there's room
            if (selectedEntries.length < maxImages) {
              const newEntry = { url: uploadedUrl };
              setSelectedEntries((prev) => [...prev, newEntry]);

              if (maxImages === 1) {
                fireOnSelect([newEntry]);
                setPanelOpen(false);
              }
            }
          } catch (err) {
            console.error("[UploadButton] Upload failed for", file.name, err);
            setUploadHistory((prev) => prev.filter((h) => h.id !== id));
            throw err;
          }
        }),
      );
    } catch (err) {
      toast.error(t.uploadFailedAlert.replace("{message}", err.message));
    } finally {
      setUploading(false);
      setLastUploadProgress(0);
    }
  };

  const handleTriggerDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleTriggerDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleTriggerDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleTriggerDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    const files = Array.from(e.dataTransfer?.files || []).filter((f) =>
      f.type.startsWith("image/"),
    );
    if (files.length > 0) {
      processFiles(files);
    }
  };

  const handleCellClick = (entry) => {
    const selIdx = selectedEntries.findIndex((e) => e.url === entry.url);
    const isSelected = selIdx !== -1;
    const atMax =
      maxImages > 1 && !isSelected && selectedEntries.length >= maxImages;
    if (atMax) return;

    if (maxImages === 1) {
      const newSelected = [{ url: entry.url, localUrl: entry.localUrl }];
      setSelectedEntries(newSelected);
      fireOnSelect(newSelected);
      setPanelOpen(false);
    } else {
      let next;
      if (isSelected) {
        next = selectedEntries.filter((_, i) => i !== selIdx);
        if (next.length === 0) onClear?.();
      } else {
        next = [
          ...selectedEntries,
          { url: entry.url, localUrl: entry.localUrl },
        ];
      }
      setSelectedEntries(next);
    }
  };

  const handleRemoveFromHistory = (e, entry) => {
    e.stopPropagation();
    if (entry.localUrl) URL.revokeObjectURL(entry.localUrl);
    setUploadHistory((prev) => prev.filter((h) => h.id !== entry.id));

    const next = selectedEntries.filter((s) => s.url !== entry.url);
    if (next.length !== selectedEntries.length) {
      setSelectedEntries(next);
      if (next.length === 0) onClear?.();
    }
  };

  const handleDone = (e) => {
    e.stopPropagation();
    fireOnSelect(selectedEntries);
    setPanelOpen(false);
  };

  const reset = () => {
    setSelectedEntries([]);
    setPanelOpen(false);
  };

  // expose reset via ref pattern — parent calls reset() directly
  // (handled by parent through uploadedImageUrls state reset)

  const isMulti = maxImages > 1;
  const count = selectedEntries.length;
  const hasSelection = count > 0;

  // Trigger icon content
  const triggerContent = uploading ? (
    <div className="flex flex-col items-center justify-center w-full h-full absolute inset-0 bg-scrim z-20 backdrop-blur-[2px]">
      <svg className="w-8 h-8 -rotate-90">
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          className="text-ink-subtle"
        />
        <circle
          cx="16"
          cy="16"
          r="14"
          stroke="currentColor"
          strokeWidth="2"
          fill="transparent"
          strokeDasharray={88}
          strokeDashoffset={88 - (88 * lastUploadProgress) / 100}
          className="text-brand transition-all duration-page"
        />
      </svg>
      <span className="absolute text-micro font-black text-brand leading-none">
        {lastUploadProgress}%
      </span>
    </div>
  ) : label === copy.promptBar.swapFaceLabel ? (
    hasSelection ? (
      <img src={selectedEntries[0].url} alt="" className="w-full h-full object-cover" />
    ) : (
      <span className="text-micro font-bold text-ink-subtle">{t.faceLabel}</span>
    )
  ) : (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      className="text-ink-subtle group-hover:text-brand transition-colors"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );

  const defaultLabel = isMulti ? t.addUpToImages.replace("{max}", maxImages) : t.referenceImageLabel;
  const triggerTitle = hasSelection
    ? count > 1
      ? t.multiSelectedTitle.replace("{count}", count).replace("{max}", maxImages)
      : isMulti
        ? t.singleSelectedTitle.replace("{max}", maxImages)
        : label || t.referenceImageLabel
    : label || defaultLabel;

  return (
    <div className="relative">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={isMulti}
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Trigger button */}
      <button
        ref={triggerRef}
        type="button"
        title={triggerTitle}
        onClick={(e) => {
          e.stopPropagation();
          setPanelOpen((o) => !o);
        }}
        onDragEnter={handleTriggerDragEnter}
        onDragLeave={handleTriggerDragLeave}
        onDragOver={handleTriggerDragOver}
        onDrop={handleTriggerDrop}
        className={`${promptMediaButtonClassName({
          active: hasSelection,
        })}${isDragging ? " ring-2 ring-primary border-primary bg-primary/10" : ""}`}
      >
        {triggerContent}
      </button>

      {/* Panel */}
      {panelOpen && (
        <PromptPopover
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          className="w-96 max-w-[calc(100vw-2rem)]"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-1 pb-3 mb-2 border-b border-line-subtle">
            <div className="flex flex-col gap-0.5">
              <span className="text-xs font-bold text-secondary">
                {t.headerTitle}
              </span>
              {isMulti && (
                <span className="text-micro text-muted">
                  {t.selectUpTo.replace("{max}", maxImages)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isMulti && hasSelection && (
                <button
                  type="button"
                  onClick={handleDone}
                  className="flex items-center gap-1 px-3 py-1.5 bg-primary text-ink-inverse rounded-xl text-xs font-black transition-all hover:scale-105"
                >
                  {t.doneButton.replace("{count}", count)}
                </button>
              )}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setPanelOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary rounded-full text-xs font-bold transition-all border border-primary/20"
              >
                <svg
                  width="11"
                  height="11"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                {isMulti ? t.uploadFilesButton : t.uploadNewButton}
              </button>
            </div>
          </div>

          {/* Grid or empty state */}
          {uploadHistory.length === 0 ? (
            <div className="py-6 flex flex-col items-center gap-2 opacity-40">
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-secondary"
              >
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-xs text-secondary">{t.emptyState}</span>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2 max-h-56 overflow-y-auto custom-scrollbar pr-0.5">
              {uploadHistory.map((entry) => {
                const selIdx = selectedEntries.findIndex(
                  (e) => e.url === entry.url,
                );
                const isSelected = selIdx !== -1;
                const atMax =
                  isMulti && !isSelected && selectedEntries.length >= maxImages;

                return (
                  <div
                    key={entry.id}
                    title={entry.name}
                    onClick={() => entry.url && handleCellClick(entry)}
                    className={`relative rounded-xl overflow-hidden border-2 cursor-pointer group/cell aspect-square transition-all ${
                      isSelected
                        ? "border-primary shadow-glow"
                        : "border-white/10 hover:border-white/30"
                    } ${atMax ? "opacity-40 cursor-not-allowed" : ""} ${!entry.url ? "cursor-wait" : ""}`}
                  >
                    {entry.url ? (
                      <img
                        src={entry.url}
                        alt={entry.name}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="w-full h-full bg-wash flex flex-col items-center justify-center">
                        <div className="w-8 h-8 rounded-full border-2 border-primary/30 border-t-primary animate-spin mb-1" />
                        <span className="text-micro font-black text-primary">
                          {entry.progress}%
                        </span>
                      </div>
                    )}

                    {/* Hover overlay with delete */}
                    {entry.url && (
                      <div className="absolute inset-0 bg-scrim opacity-0 group-hover/cell:opacity-100 transition-opacity flex items-end justify-end p-1">
                        <button
                          type="button"
                          title={t.removeFromHistory}
                          onClick={(e) => handleRemoveFromHistory(e, entry)}
                          className="w-5 h-5 bg-danger hover:bg-danger rounded-md flex items-center justify-center transition-colors"
                        >
                          <svg
                            width="8"
                            height="8"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="white"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                        </button>
                      </div>
                    )}

                    {/* Selection badge */}
                    {isSelected && (
                      <div className="absolute top-1 left-1 min-w-[20px] h-5 bg-primary rounded-full flex items-center justify-center px-1">
                        {isMulti ? (
                          <span className="text-micro font-black text-ink-inverse">
                            {selIdx + 1}
                          </span>
                        ) : (
                          <svg
                            width="9"
                            height="9"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="black"
                            strokeWidth="4"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Bottom bar for multi-select */}
          {isMulti && hasSelection && (
            <div className="mt-3 pt-3 border-t border-line-subtle flex items-center justify-between">
              <span className="text-xs text-secondary">
                {t.selectedCount.replace("{count}", count).replace("{max}", maxImages)}
              </span>
              <button
                type="button"
                onClick={handleDone}
                className="px-4 py-1.5 bg-primary text-ink-inverse rounded-xl text-xs font-black transition-all hover:scale-105"
              >
                {t.useSelected}
              </button>
            </div>
          )}
        </PromptPopover>
      )}
    </div>
  );
}

// ─── ModelDropdown ────────────────────────────────────────────────────────────

function ModelDropdown({ selectedModel, onSelect, onClose, copy }) {
  const t = copy.modelDropdown;
  const [search, setSearch] = useState("");
  const selectedEntry = imageModelPickerEntryByVariantId.get(selectedModel);
  const modelCategories = [
    {
      id: "all",
      label: t.categoryAll,
      entries: imageModelPickerEntries,
    },
    {
      id: "t2i",
      label: t.categoryT2I,
      entries: imageModelPickerEntries.filter((entry) => entry.variantsByMode.t2i),
    },
    {
      id: "i2i",
      label: t.categoryI2I,
      entries: imageModelPickerEntries.filter((entry) => entry.variantsByMode.i2i),
    },
  ];
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [selectedProvider, setSelectedProvider] = useState("all");
  const activeCategory = modelCategories.find((category) => category.id === selectedCategory) || modelCategories[0];
  const modelEntries = activeCategory.entries;

  const activeItemRef = useRef(null);

  useEffect(() => {
    // Automatically scroll the active model into view when opening
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ block: "nearest" });
    }
  }, []);


  // Dynamically compute list of providers from the input models list
  const availableProviders = [];
  const seenProviders = new Set();
  
  modelEntries.forEach(({ family }) => {
    const pId = family.provider || 'muapi';
    const pName = family.provider_name || 'Muapi';
    if (!seenProviders.has(pId)) {
      seenProviders.add(pId);
      availableProviders.push({ id: pId, name: pName });
    }
  });

  const filtered = modelEntries.filter((entry) => {
    const { family } = entry;
    // 1. Filter by provider tab
    if (selectedProvider !== "all") {
      const pId = family.provider || 'muapi';
      if (pId !== selectedProvider) return false;
    }
    // 2. Filter by search query
    const query = search.toLowerCase();
    return entry.searchText.includes(query);
  });

  return (
    <div className="flex gap-4 h-full max-h-[60vh] min-h-[350px] overflow-x-hidden">
      {/* Left Sidebar: Provider tabs */}
      <div className="flex flex-col gap-2.5 items-center pr-2 border-r border-line-subtle shrink-0 select-none overflow-y-auto custom-scrollbar w-14 pt-0.5">
        <button
          type="button"
          onClick={() => setSelectedProvider("all")}
          className={`w-8 h-8 rounded-full flex items-center justify-center border transition-all flex-shrink-0 cursor-pointer ${
            selectedProvider === "all"
              ? "bg-wash-press text-yellow-400 border-yellow-500/30 shadow-elevation-2 scale-105"
              : "bg-wash text-ink-subtle border-line-subtle hover:bg-wash hover:text-ink"
          }`}
          title={t.allProviders}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill={selectedProvider === "all" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
          </svg>
        </button>
        
        {availableProviders.map(p => {
          const style = getProviderStyle(p.id);
          const isSelected = selectedProvider === p.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedProvider(p.id)}
              aria-pressed={isSelected}
              className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center overflow-hidden font-black text-micro border transition-all cursor-pointer ${
                isSelected
                  ? `${style.bg} scale-105 shadow-elevation-2 shadow-black/10`
                  : "bg-wash text-ink-subtle border-line-subtle hover:bg-wash hover:text-ink"
              }`}
              title={p.name}
            >
              {(() => {
                const logo = getProviderLogo(p.id);
                return logo ? (
                  <img
                    src={logo}
                    alt={p.name}
                    className={`w-full h-full rounded-full object-contain ${invertLogos.includes(p.id) ? "invert" : ""}`}
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                ) : (
                  style.text
                );
              })()}
            </button>
          );
        })}
      </div>

      {/* Right Pane: Search input + Models list */}
      <div className="flex-1 flex flex-col gap-2 min-w-0">
        <div className="border-b border-line-subtle shrink-0 pb-2 space-y-2">
          <div className="flex gap-1.5 overflow-x-auto custom-scrollbar pb-0.5">
            {modelCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => {
                  setSelectedCategory(category.id);
                  setSelectedProvider("all");
                }}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-micro font-bold transition-colors border ${
                  selectedCategory === category.id
                    ? "bg-primary/15 text-primary border-primary/30"
                    : "bg-wash text-ink-subtle border-line-subtle hover:bg-wash hover:text-ink"
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3 bg-wash rounded-xl px-4 py-2 border border-line-subtle focus-within:border-primary/50 transition-colors">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="text-muted"
            >
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder={t.searchPlaceholder}
              value={search}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => {
                const value = e.target.value;
                setSearch(value);
                if (value.trim()) setSelectedProvider("all");
              }}
              className="bg-transparent border-none text-xs text-ink focus:ring-0 w-full p-0 focus:outline-none"
            />
          </div>
        </div>
        
        <div className="text-xs font-semibold text-secondary py-1 shrink-0 flex items-center justify-between">
          <span>{activeCategory.label} {t.modelsSuffix}</span>
          {selectedProvider !== "all" && (
            <span className="text-micro bg-wash px-2 py-0.5 rounded text-ink-muted">
              {availableProviders.find(p => p.id === selectedProvider)?.name || selectedProvider}
            </span>
          )}
        </div>
        
        <div className="flex flex-col gap-1.5 overflow-y-auto custom-scrollbar pr-1 pb-2 flex-1">
          {filtered.length === 0 ? (
            <div className="text-xs text-ink-subtle text-center py-6">
              {t.noModelsFound}
            </div>
          ) : (
            filtered.map((entry) => {
              const { family } = entry;
              const isSelected = selectedEntry === entry;
              const desc = getModelDescription(entry.id || family.id);
              const badge = getModelBadge(entry.id || family.id);
              return (
              <div
                key={entry.id}
                ref={isSelected ? activeItemRef : null}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect(entry, activeCategory.id);
                  onClose();
                }}
                className={`flex items-center justify-between p-2.5 sm:p-3 hover:bg-wash-strong rounded-xl cursor-pointer transition-all border ${
                  isSelected ? "bg-wash-strong border-brand-line shadow-elevation-2 shadow-black/20" : "border-transparent hover:border-line"
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {(() => {
                    const logo = getProviderLogo(family.provider);
                    return logo ? (
                      <div className="w-9 h-9 rounded-xl border border-line overflow-hidden shrink-0 flex items-center justify-center bg-wash p-1.5 shadow-inner">
                        <img
                          src={logo}
                          alt={family.provider_name}
                          className={`w-full h-full object-contain ${invertLogos.includes(family.provider) ? "invert" : ""}`}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      </div>
                    ) : (
                      <div
                        className={`w-9 h-9 rounded-xl ${
                          family.id.includes("kontext")
                            ? "bg-info-soft text-info border-info-soft"
                            : family.id.includes("effects")
                              ? "bg-purple-500/10 text-purple-400 border-purple-500/10"
                              : "bg-brand-soft text-brand border-brand-soft"
                        } border flex items-center justify-center font-bold text-xs shadow-inner uppercase shrink-0`}
                      >
                        {entry.name.charAt(0)}
                      </div>
                    );
                  })()}
                  <div className="flex flex-col min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs sm:text-sm font-bold text-ink tracking-tight truncate">
                        {entry.name}
                      </span>
                      {badge && (
                        <span className="text-micro px-1.5 py-0.2 rounded-full bg-brand-soft text-brand border border-brand-line font-medium">
                          {badge}
                        </span>
                      )}
                    </div>
                    <span className="text-[11px] text-ink-subtle truncate mt-0.5 max-w-[260px] sm:max-w-[320px]">
                      {desc}
                    </span>
                  </div>
                </div>
                {isSelected && (
                  <div className="w-5 h-5 rounded-full bg-brand-pressed border border-brand-ring flex items-center justify-center shrink-0 ml-2">
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22d3ee"
                      strokeWidth="3.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                )}
              </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── SimpleDropdown ───────────────────────────────────────────────────────────

function SimpleDropdown({ title, options, selected, onSelect, onClose }) {
  return (
    <>
      <PromptPopoverHeader>{title}</PromptPopoverHeader>
      <PromptMenuList>
        {options.map((opt) => (
          <PromptMenuItem
            key={opt}
            selected={selected === opt}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(opt);
              onClose();
            }}
          >
            {opt}
          </PromptMenuItem>
        ))}
      </PromptMenuList>
    </>
  );
}

// ─── ParamsPopoverPanel (Figure 2) ──────────────────────────────────────────

// ─── ParamsPopoverPanel (清晰的比例、分辨率与自定义 PX 面板) ─────────────────

function ParamsPopoverPanel({
  selectedAr,
  onSelectAr,
  aspectRatios = [],
  selectedQuality,
  onSelectQuality,
  onSelectPresetDimension,
  resolutions = [],
  batchSize,
  onChangeBatchSize,
  customWidth,
  customHeight,
  onChangeDimensions,
  onSwapDimensions,
  dimensionMode,
  onChangeDimensionMode,
  supplementalInputs,
  modelParameterValues,
  onChangeModelParameter,
  copy,
  onClose,
}) {
  const t = copy.paramsPanel || {};
  const [activeTab, setActiveTab] = useState(
    dimensionMode === "custom" || selectedAr === "custom" ? "custom" : "preset"
  );
  const [inputW, setInputW] = useState(String(customWidth || 1024));
  const [inputH, setInputH] = useState(String(customHeight || 1024));
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    setActiveTab(
      dimensionMode === "custom" || selectedAr === "custom" ? "custom" : "preset"
    );
  }, [dimensionMode, selectedAr]);

  useEffect(() => {
    setInputW(String(customWidth || 1024));
  }, [customWidth]);

  useEffect(() => {
    setInputH(String(customHeight || 1024));
  }, [customHeight]);

  const commitDimensions = (wStr, hStr) => {
    const rawW = parseInt(wStr, 10);
    const rawH = parseInt(hStr, 10);
    const validW = Math.round(Math.max(256, Math.min(4096, isNaN(rawW) ? 1024 : rawW)) / 64) * 64;
    const validH = Math.round(Math.max(256, Math.min(4096, isNaN(rawH) ? 1024 : rawH)) / 64) * 64;
    setInputW(String(validW));
    setInputH(String(validH));
    onChangeDimensions(validW, validH);
  };

  const standardRatios = [
    { id: "1:1", label: "1:1", name: "方形", desc: "头像 / 社交图" },
    { id: "16:9", label: "16:9", name: "横屏", desc: "电脑壁纸 / 宽屏" },
    { id: "9:16", label: "9:16", name: "竖屏", desc: "手机壁纸 / 故事" },
    { id: "4:3", label: "4:3", name: "标清横", desc: "标准横屏" },
    { id: "3:4", label: "3:4", name: "社交竖", desc: "标准竖屏" },
    { id: "3:2", label: "3:2", name: "经典横", desc: "相机画幅" },
    { id: "2:3", label: "2:3", name: "经典竖", desc: "人像画幅" },
    { id: "21:9", label: "21:9", name: "电影宽屏", desc: "超宽银幕" },
    { id: "adaptive", label: "自适应", name: "智能比例", desc: "自适应参考图" },
  ];

  const clarityOptions = [
    { id: "1K", label: "标清 1K", desc: "约1024px · 基础质量" },
    { id: "2K", label: "高清 2K ✦", desc: "约2048px · 推荐平衡" },
    { id: "4K", label: "超清 4K ✦", desc: "约4096px · 极致细节" },
  ];

  const currentTier = (() => {
    const s = String(selectedQuality || "2K").toLowerCase();
    if (s.includes("1k") || s.includes("1.5k") || s.includes("720") || s === "basic" || s === "low" || s.includes("标清") || s.includes("standard")) return "1K";
    if (s.includes("4k") || s.includes("8k") || s.includes("ultra") || s.includes("超清")) return "4K";
    return "2K";
  })();

  const quickPresets = [
    {
      group: "横屏",
      items: [
        { label: "1920×1080", name: "全高清 1080P", w: 1920, h: 1080, ar: "16:9" },
        { label: "2560×1440", name: "2K QHD", w: 2560, h: 1440, ar: "16:9" },
        { label: "3840×2160", name: "4K UHD", w: 3840, h: 2160, ar: "16:9" },
        { label: "1280×720", name: "720P 标清", w: 1280, h: 720, ar: "16:9" },
      ],
    },
    {
      group: "竖屏",
      items: [
        { label: "1080×1920", name: "手机全高清", w: 1080, h: 1920, ar: "9:16" },
        { label: "1440×2560", name: "2K 竖屏", w: 1440, h: 2560, ar: "9:16" },
        { label: "720×1280", name: "720P 标清", w: 720, h: 1280, ar: "9:16" },
      ],
    },
    {
      group: "方形",
      items: [
        { label: "1024×1024", name: "1K 方形", w: 1024, h: 1024, ar: "1:1" },
        { label: "2048×2048", name: "2K 方形", w: 2048, h: 2048, ar: "1:1" },
        { label: "4096×4096", name: "4K 方形", w: 4096, h: 4096, ar: "1:1" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-3.5 p-3.5 w-[360px] sm:w-[440px] max-w-[calc(100vw-2rem)] text-ink select-none">
      {/* 顶部标题与当前生效尺寸展示 */}
      <div className="flex items-center justify-between pb-2 border-b border-line">
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold tracking-wide text-ink">
            {t.titleDimensions || "尺寸与分辨率"}
          </span>
          <span className="px-1.5 py-0.5 rounded text-micro font-semibold bg-brand-soft text-brand border border-brand-line">
            {activeTab === "custom" ? "自定义PX模式" : "预设规格模式"}
          </span>
        </div>
        <span className="text-xs font-mono text-brand font-bold">
          {customWidth} × {customHeight} PX · {currentTier}
        </span>
      </div>

      {/* 模式切换选项卡 */}
      <div className="grid grid-cols-2 gap-1 bg-wash p-1 rounded-xl border border-line">
        <button
          type="button"
          onClick={() => {
            setActiveTab("preset");
            onChangeDimensionMode?.("preset");
          }}
          className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
            activeTab === "preset"
              ? "bg-brand-active text-ink-on-accent font-bold shadow-elevation-1"
              : "text-ink-muted hover:text-ink hover:bg-wash"
          }`}
        >
          常用比例与清晰度
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab("custom");
            onChangeDimensionMode?.("custom");
          }}
          className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer text-center ${
            activeTab === "custom"
              ? "bg-brand-active text-ink-on-accent font-bold shadow-elevation-1"
              : "text-ink-muted hover:text-ink hover:bg-wash"
          }`}
        >
          自定义像素 (PX)
        </button>
      </div>

      {/* 模式一：常用比例与清晰度 */}
      {activeTab === "preset" && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-ink-subtle leading-relaxed -mt-1">
            选择画面比例与清晰度档位，系统将自动换算标准画布像素。
          </p>

          {/* 1. 画面比例 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                1. {t.titleRatio || "选择画面比例"}
              </span>
              <span className="text-[11px] text-brand font-mono">
                {selectedAr || "1:1"}
              </span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              {standardRatios.map((item) => {
                const isSelected = selectedAr === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectAr(item.id)}
                    className={`flex flex-col items-center justify-center gap-1 py-2 px-1 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-brand-pressed border-brand text-ink shadow-elevation-2 shadow-brand-soft scale-[1.02]"
                        : "bg-wash border-line-subtle hover:bg-wash-strong hover:border-line-strong text-ink-muted hover:text-ink"
                    }`}
                  >
                    <div className="h-5 flex items-center justify-center">
                      <AspectLineIcon ratio={item.id} active={isSelected} />
                    </div>
                    <span className={`text-[11px] tracking-tight ${isSelected ? "font-bold text-brand" : "font-medium"}`}>
                      {item.label}
                    </span>
                    <span className="text-micro text-ink-subtle truncate max-w-full">
                      {item.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 清晰度规格 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                2. {t.titleResolution || "清晰度规格"}
              </span>
              <span className="text-[11px] text-ink-subtle">
                自动换算像素尺寸
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {clarityOptions.map((item) => {
                const isSelected = currentTier === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectQuality(item.id, false)}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-brand-pressed text-brand border-brand shadow-elevation-1 font-bold scale-[1.02]"
                        : "bg-wash border-line-subtle text-ink-muted hover:text-ink hover:bg-wash-strong"
                    }`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-micro text-ink-subtle mt-0.5">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 模式二：自定义像素 (PX) */}
      {activeTab === "custom" && (
        <div className="flex flex-col gap-3">
          <p className="text-[11px] text-ink-subtle leading-relaxed -mt-1">
            精准指定画布像素宽高（或套用预设），下方清晰度规格作为模型渲染质量参数协同生效。
          </p>

          {/* 精准输入区 */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                1. 输入像素尺寸 (PX)
              </span>
              <span className="text-micro text-ink-subtle font-mono">
                范围 256 ~ 4096 (64倍数对齐)
              </span>
            </div>
            <div className="flex items-center gap-2 text-xs">
              {/* 宽输入框 */}
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-wash border border-line text-ink focus-within:border-brand-ring transition-colors">
                <span className="text-ink-subtle text-[11px] font-bold font-mono mr-2">W</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputW}
                  onChange={(e) => setInputW(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => commitDimensions(inputW, inputH)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitDimensions(inputW, inputH);
                  }}
                  className="w-full bg-transparent text-right font-mono font-bold text-sm text-brand-hover"
                  placeholder="宽"
                />
                <span className="text-ink-subtle text-micro font-mono ml-1">PX</span>
              </div>

              {/* ⇄ 宽高互换按钮 */}
              <button
                type="button"
                onClick={() => {
                  commitDimensions(inputH, inputW);
                  onSwapDimensions();
                }}
                className="w-8 h-8 rounded-xl bg-wash border border-line hover:bg-wash-press hover:border-brand-ring text-ink-muted hover:text-brand flex items-center justify-center transition-all cursor-pointer shrink-0"
                title="交换宽与高 (横竖切换)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 16V4m0 0L3 8m4-4l4 4m10 4v12m0 0l4-4m-4 4l-4-4" />
                </svg>
              </button>

              {/* 高输入框 */}
              <div className="flex-1 flex items-center justify-between px-3 py-2 rounded-xl bg-wash border border-line text-ink focus-within:border-brand-ring transition-colors">
                <span className="text-ink-subtle text-[11px] font-bold font-mono mr-2">H</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={inputH}
                  onChange={(e) => setInputH(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => commitDimensions(inputW, inputH)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitDimensions(inputW, inputH);
                  }}
                  className="w-full bg-transparent text-right font-mono font-bold text-sm text-brand-hover"
                  placeholder="高"
                />
                <span className="text-ink-subtle text-micro font-mono ml-1">PX</span>
              </div>
            </div>
          </div>

          {/* 常用像素预设 */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                2. 常用像素预设 (PX)
              </span>
              <span className="text-micro text-ink-subtle">
                点击一键套用标准画幅尺寸
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {quickPresets.map((group) => (
                <div key={group.group} className="flex flex-col gap-1">
                  <span className="text-micro text-ink-subtle pl-0.5">{group.group}规格</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {group.items.map((item) => {
                      const isSelected = customWidth === item.w && customHeight === item.h;
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            setInputW(String(item.w));
                            setInputH(String(item.h));
                            const tier = item.w >= 3840 || item.h >= 3840 ? "4K" : (item.w <= 1280 && item.h <= 720 ? "1K" : "2K");
                            if (onSelectPresetDimension) {
                              onSelectPresetDimension(item.w, item.h, item.ar, tier);
                            } else {
                              onChangeDimensions(item.w, item.h, item.ar);
                              onSelectQuality(tier, true);
                            }
                          }}
                          className={`px-2 py-1.5 rounded-lg text-left transition-all cursor-pointer border flex flex-col ${
                            isSelected
                              ? "bg-brand-pressed text-brand-hover border-brand-ring font-bold shadow-elevation-1"
                              : "bg-wash text-ink-muted border-line-subtle hover:bg-wash-strong hover:text-ink"
                          }`}
                        >
                          <span className="text-[11px] font-mono font-bold">{item.label}</span>
                          <span className="text-micro text-ink-subtle truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 清晰度规格协同选择 */}
          <div className="flex flex-col gap-1.5 pt-1 border-t border-line-subtle">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-ink">
                3. 模型渲染清晰度规格
              </span>
              <span className="text-micro text-brand">
                当前档位：{currentTier}
              </span>
            </div>
            <p className="text-micro text-ink-subtle -mt-0.5">
              控制模型输出质量与算力档位，不覆盖上方自定义像素尺寸。
            </p>
            <div className="grid grid-cols-3 gap-2">
              {clarityOptions.map((item) => {
                const isSelected = currentTier === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectQuality(item.id, true)}
                    className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-brand-pressed text-brand border-brand shadow-elevation-1 font-bold scale-[1.02]"
                        : "bg-wash border-line-subtle text-ink-muted hover:text-ink hover:bg-wash-strong"
                    }`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-micro text-ink-subtle mt-0.5">{item.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. 生成张数 */}
      <div className="flex flex-col gap-1.5 pt-1 border-t border-line-subtle">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-ink">
            {t.titleQuantity || "生成数量"}
          </span>
          <span className="text-[11px] text-brand font-mono">
            {batchSize} 张
          </span>
        </div>
        <div className="grid grid-cols-4 gap-2 bg-wash p-1 rounded-xl border border-line-subtle">
          {[1, 2, 3, 4].map((num) => {
            const isSelected = batchSize === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onChangeBatchSize(num)}
                className={`py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer text-center ${
                  isSelected
                    ? "bg-brand-active text-ink-on-accent font-bold shadow-elevation-1"
                    : "text-ink-subtle hover:text-ink hover:bg-wash"
                }`}
              >
                {num} 张
              </button>
            );
          })}
        </div>
      </div>

      {/* 4. 高级参数折叠 */}
      {supplementalInputs && Object.keys(supplementalInputs).length > 0 && (
        <div className="pt-1.5 border-t border-line-subtle flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex items-center justify-between text-xs text-ink-subtle hover:text-ink transition-colors py-1"
          >
            <span>高级参数调节</span>
            <PromptChevronIcon className={showAdvanced ? "rotate-180" : ""} />
          </button>
          {showAdvanced && (
            <div className="max-h-44 overflow-y-auto custom-scrollbar flex flex-col gap-2.5 pr-1">
              {Object.entries(supplementalInputs).map(([key, input]) => (
                <div key={key} className="flex flex-col gap-1 text-xs">
                  <span className="text-[11px] text-ink-muted">{input.title || key}</span>
                  {input.type === "string" && !input.enum ? (
                    <input
                      type="text"
                      value={modelParameterValues[key] ?? input.default ?? ""}
                      onChange={(e) => onChangeModelParameter(key, e.target.value)}
                      className="bg-wash border border-line rounded-lg px-2.5 py-1 text-xs text-ink focus:border-brand-ring"
                    />
                  ) : input.enum ? (
                    <select
                      value={modelParameterValues[key] ?? input.default ?? input.enum[0]}
                      onChange={(e) => onChangeModelParameter(key, e.target.value)}
                      className="bg-raised border border-line rounded-lg px-2 py-1 text-xs text-ink focus:border-brand-ring"
                    >
                      {input.enum.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ImageStudio({
  apiKey,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  historyItems,
  onDeleteHistoryItem,
  droppedFiles,
  onFilesHandled,
  locale = "en",
}) {
  const copy = resolveCopy(en, { 'zh-CN': zh, 'ja-JP': ja, 'ko-KR': ko, 'zh-TW': zhTw, es }, locale);
  const LEGACY_PERSIST_KEY = "hg_image_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Model state ─────────────────────────────────────────────────────────
  const initialFamily = imageModelCatalog.familyByVariantId.get(t2iModels[0].id);
  const [imageMode, setImageMode] = useState(false); // false=t2i, true=i2i
  const [dimensionMode, setDimensionMode] = useState("preset"); // "preset" | "custom"
  const [selectedModelId, setSelectedModelId] = useState(t2iModels[0].id);
  const [selectedFamilyId, setSelectedFamilyId] = useState(initialFamily.id);
  const [selectedAr, setSelectedAr] = useState(
    t2iModels[0].inputs?.aspect_ratio?.default || "1:1",
  );
  const [selectedQuality, setSelectedQuality] = useState(() => {
    const resolutions = getResolutionsForModel(t2iModels[0].id);
    return resolutions[0] || null;
  });
  const [customWidth, setCustomWidth] = useState(() => {
    const initAr = t2iModels[0].inputs?.aspect_ratio?.default || "1:1";
    const initQual = getResolutionsForModel(t2iModels[0].id)[0] || "2K";
    return calculatePixelDimensions(initAr, initQual).width;
  });
  const [customHeight, setCustomHeight] = useState(() => {
    const initAr = t2iModels[0].inputs?.aspect_ratio?.default || "1:1";
    const initQual = getResolutionsForModel(t2iModels[0].id)[0] || "2K";
    return calculatePixelDimensions(initAr, initQual).height;
  });
  const [selectedEffect, setSelectedEffect] = useState("");
  const [modelParameterValues, setModelParameterValues] = useState(() =>
    createModelParameterValues(t2iModels[0]),
  );

  // ── Dimensions and aspect ratio callbacks ──────────────────────────────
  const handleSelectAr = useCallback((ratio) => {
    setDimensionMode("preset");
    setSelectedAr(ratio);
    const dims = calculatePixelDimensions(ratio, selectedQuality || "2K");
    setCustomWidth(dims.width);
    setCustomHeight(dims.height);
  }, [selectedQuality]);

  const handleSelectQuality = useCallback((quality, keepCustomMode = false) => {
    setSelectedQuality(quality);
    if (!keepCustomMode && dimensionMode !== "custom") {
      setDimensionMode("preset");
      const dims = calculatePixelDimensions(selectedAr, quality);
      setCustomWidth(dims.width);
      setCustomHeight(dims.height);
    }
  }, [selectedAr, dimensionMode]);

  const handleSelectPresetDimension = useCallback((w, h, ar, tier) => {
    setDimensionMode("custom");
    const validW = Math.round(Math.max(256, Math.min(4096, parseInt(w, 10) || 1024)) / 64) * 64;
    const validH = Math.round(Math.max(256, Math.min(4096, parseInt(h, 10) || 1024)) / 64) * 64;
    setCustomWidth(validW);
    setCustomHeight(validH);
    if (ar) {
      setSelectedAr(ar);
    } else {
      const closest = findClosestAspectRatio(validW, validH);
      setSelectedAr(closest);
    }
    if (tier) {
      setSelectedQuality(tier);
    }
  }, []);

  const handleChangeDimensions = useCallback((w, h, ar) => {
    setDimensionMode("custom");
    const validW = Math.round(Math.max(256, Math.min(4096, parseInt(w, 10) || 1024)) / 64) * 64;
    const validH = Math.round(Math.max(256, Math.min(4096, parseInt(h, 10) || 1024)) / 64) * 64;
    setCustomWidth(validW);
    setCustomHeight(validH);
    if (ar) {
      setSelectedAr(ar);
    } else {
      const closest = findClosestAspectRatio(validW, validH);
      setSelectedAr(closest);
    }
  }, []);

  const handleSwapDimensions = useCallback(() => {
    handleChangeDimensions(customHeight, customWidth);
  }, [customHeight, customWidth, handleChangeDimensions]);

  // ── Prompt / upload state ───────────────────────────────────────────────
  const [prompt, setPrompt] = useState("");
  const [uploadedImageUrls, setUploadedImageUrls] = useState([]);
  const [swapImageUrl, setSwapImageUrl] = useState(null);
  const [uploadHistory, setUploadHistory] = useState([]); // persisted reference images history

  // ── UI state ────────────────────────────────────────────────────────────
  const [dropdownOpen, setDropdownOpen] = useState(null); // 'model' | 'ar' | 'quality' | null
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [fullscreenUrl, setFullscreenUrl] = useState(null);
  const [isDrawModalOpen, setIsDrawModalOpen] = useState(false);
  const globalFileInputRef = useRef(null);
  const paramsPanelRef = useRef(null);
  const modeSelectRef = useRef(null);
  const [isParamsPanelOpen, setIsParamsPanelOpen] = useState(false);
  const [isModeSelectOpen, setIsModeSelectOpen] = useState(false);

  // ── Canvas / history state ──────────────────────────────────────────────
  const [currentImageUrl, setCurrentImageUrl] = useState(null);
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);
  const [batchSize, setBatchSize] = useState(1);
  const [localHistory, setLocalHistory] = useState([]); // [{id,url,prompt,model,aspect_ratio,timestamp}]

  // Use prop history if provided, otherwise local
  const history = historyItems ?? localHistory;

  // When historyItems is server-backed (White Label / backfilled sessions),
  // localHistory isn't what's rendered — removal has to go through the
  // parent so it deletes server-side (UsageLog + S3) and updates the same
  // state `history` reads from. Falls back to the old local-only removal
  // when there's no server-backed list (e.g. standalone/embedded studio).
  const handleDeleteEntry = useCallback(async (entry, idx) => {
    if (historyItems && onDeleteHistoryItem) {
      await onDeleteHistoryItem(entry);
    } else {
      setLocalHistory((prev) => prev.filter((_, i) => i !== idx));
    }
  }, [historyItems, onDeleteHistoryItem]);

  // ── Refs ────────────────────────────────────────────────────────────────
  const textareaRef = useRef(null);
  const dropdownRef = useRef(null);
  const uploadPickerResetRef = useRef(null); // not used directly — managed via key
  const selectionRef = useRef(null);
  selectionRef.current = { imageMode, selectedFamilyId, selectedModelId };

  // ── Close dropdown on outside click ─────────────────────────────────────
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(null);
      }
      if (paramsPanelRef.current && !paramsPanelRef.current.contains(e.target)) {
        setIsParamsPanelOpen(false);
      }
      if (modeSelectRef.current && !modeSelectRef.current.contains(e.target)) {
        setIsModeSelectOpen(false);
      }
    };
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);


  // ── Persistence: restore on mount ───────────────────────────────────────
  const hasRestoredRef = useRef(false);
  useEffect(() => {
    if (hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const state = JSON.parse(raw);
      if (state.imageMode !== undefined) setImageMode(state.imageMode);
      if (state.dimensionMode) setDimensionMode(state.dimensionMode);
      if (state.selectedModelId) setSelectedModelId(state.selectedModelId);
      if (state.selectedFamilyId) setSelectedFamilyId(state.selectedFamilyId);
      if (state.selectedAr) setSelectedAr(state.selectedAr);
      if (state.selectedQuality) setSelectedQuality(state.selectedQuality);
      if (state.customWidth) setCustomWidth(state.customWidth);
      if (state.customHeight) setCustomHeight(state.customHeight);
      if (state.selectedEffect) setSelectedEffect(state.selectedEffect);
      if (state.modelParameterValues) setModelParameterValues(state.modelParameterValues);
      if (state.prompt !== undefined) setPrompt(state.prompt);
      if (Array.isArray(state.uploadedImageUrls)) setUploadedImageUrls(state.uploadedImageUrls);
      if (Array.isArray(state.uploadHistory)) setUploadHistory(state.uploadHistory);
      if (typeof state.batchSize === "number" && state.batchSize >= 1 && state.batchSize <= 4) {
        setBatchSize(state.batchSize);
      }
      if (Array.isArray(state.localHistory)) setLocalHistory(state.localHistory);
    } catch (err) {
      console.warn("Failed to restore ImageStudio persistence:", err);
    }
  }, [PERSIST_KEY]);

  // ── Persistence: save on change ─────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          imageMode,
          dimensionMode,
          selectedModelId,
          selectedFamilyId,
          selectedAr,
          selectedQuality,
          customWidth,
          customHeight,
          selectedEffect,
          modelParameterValues,
          prompt,
          uploadedImageUrls,
          uploadHistory,
          batchSize,
          localHistory,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save ImageStudio persistence:", err);
      }
    }, 500); // 500ms debounce
    return () => clearTimeout(timer);
  }, [
    imageMode,
    dimensionMode,
    selectedModelId,
    selectedFamilyId,
    selectedAr,
    selectedQuality,
    customWidth,
    customHeight,
    selectedEffect,
    modelParameterValues,
    prompt,
    uploadedImageUrls,
    uploadHistory,
    batchSize,
    localHistory,
  ]);

  // ── Derived: current model lists & helpers ───────────────────────────────
  const currentAspectRatios = imageMode
    ? getAspectRatiosForI2IModel(selectedModelId)
    : getAspectRatiosForModel(selectedModelId);
  const currentResolutions = imageMode
    ? getResolutionsForI2IModel(selectedModelId)
    : getResolutionsForModel(selectedModelId);
  const currentQualityField = imageMode
    ? getQualityFieldForI2IModel(selectedModelId)
    : getQualityFieldForModel(selectedModelId);
  const showQualityBtn = currentResolutions.length > 0;
  const currentEffects = imageMode ? getEffectsForI2IModel(selectedModelId) : [];
  const showEffectBtn = currentEffects.length > 0;
  const selectedFamily = imageModelCatalog.familyById.get(selectedFamilyId) || initialFamily;
  const selectedPickerEntry = imageModelPickerEntryByVariantId.get(selectedModelId);
  const selectedModelDisplayName = selectedPickerEntry?.name || selectedFamily.name;
  const currentMode = imageMode ? "i2i" : "t2i";
  const selectedVariant = imageModelCatalog.variantById.get(selectedModelId);
  const supplementalInputs = getSupplementalModelInputs(selectedVariant?.model);
  const referenceVariant = getImageReferenceVariant(
    imageModelCatalog,
    selectedFamily,
    selectedModelId,
  );
  const referenceImageLimit = referenceVariant
    ? getModelMediaCapabilities(referenceVariant.model).image.maxItems
    : 4;

  const applySelectedVariant = useCallback((variant, mode, family) => {
    const model = variant.model;
    const nextImageMode = mode === "i2i";
    const ars = nextImageMode
      ? getAspectRatiosForI2IModel(model.id)
      : getAspectRatiosForModel(model.id);
    const resolutions = nextImageMode
      ? getResolutionsForI2IModel(model.id)
      : getResolutionsForModel(model.id);

    selectionRef.current = {
      imageMode: nextImageMode,
      selectedFamilyId: family.id,
      selectedModelId: model.id,
    };
    setImageMode(nextImageMode);
    setSelectedFamilyId(family.id);
    setSelectedModelId(model.id);
    setModelParameterValues((values) =>
      createModelParameterValues(model, values),
    );
    const nextAr = ars[0] || "1:1";
    const nextQual = selectedQuality || resolutions[0] || "2K";
    setSelectedAr(nextAr);
    setSelectedQuality(nextQual);
    const dims = calculatePixelDimensions(nextAr, nextQual);
    setCustomWidth(dims.width);
    setCustomHeight(dims.height);

    if (nextImageMode) {
      const effects = getEffectsForI2IModel(model.id);
      setSelectedEffect(
        effects.length > 0
          ? (getDefaultEffectForI2IModel(model.id) || effects[0])
          : "",
      );
    } else {
      setSelectedEffect("");
    }
  }, []);

  const handleFilesUpload = useCallback(async (files) => {
    if (!files || !files.length) return;
    const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
    const fileList = Array.from(files);
    const tooLarge = fileList.filter((f) => f.size > MAX_IMAGE_SIZE);
    if (tooLarge.length > 0) {
      toast.error(
        copy.uploadButton.tooLargeAlert.replace("{names}", tooLarge.map((f) => f.name).join(", "))
      );
      return;
    }

    const selection = selectionRef.current;
    let family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
    let target = getImageReferenceVariant(
      imageModelCatalog,
      family,
      selection.selectedModelId,
    );

    // If current model does not have direct reference variant, look for i2i variant in family
    if (!target) {
      target = getFamilyVariant(imageModelCatalog, family, "i2i", selection.selectedModelId);
    }

    // If still none, automatically fallback to flagship multi-reference model (Seedream 5.0 Edit)
    if (!target) {
      target = imageModelCatalog.variantById.get("bytedance-seedream-5.0-pro-edit")
        || imageModelCatalog.variantById.get("bytedance-seedream-v5.0-edit")
        || imageModelCatalog.variantById.get("seedream-5.0")
        || Array.from(imageModelCatalog.variantById.values()).find(v => v.mode === "i2i");
      if (target) {
        family = imageModelCatalog.familyByVariantId.get(target.id);
      }
    }

    if (!target) {
      toast.error(copy.errors.noImageReferenceSupport.replace("{name}", family?.name || "当前模型"));
      return;
    }

    // Check if auto-switching to i2i variant is needed
    const currentMode = selection.imageMode ? "i2i" : "t2i";
    if (target.model.id !== selection.selectedModelId || target.mode !== currentMode) {
      applySelectedVariant(target, target.mode, family);
      const targetName = imageModelPickerEntryByVariantId.get(target.id)?.name || target.model.name || family.name;
      toast.success(
        (copy.paramsPanel?.autoSwitchedToI2I || "已自动切换至支持参考图的模型：{model}").replace("{model}", targetName),
        { icon: "✨", duration: 3000 }
      );
    }

    const limit = getModelMediaCapabilities(target.model).image.maxItems || 4;
    try {
      const remaining = Math.max(1, limit - uploadedImageUrls.length);
      const toUpload = fileList.slice(0, remaining);
      const urls = await Promise.all(
        toUpload.map(async (file) => {
          return await uploadFile(apiKey, file);
        })
      );
      setUploadedImageUrls((prev) => [...prev, ...urls].slice(0, limit));
    } catch (err) {
      toast.error(copy.uploadButton.uploadFailedAlert.replace("{message}", err.message));
    }
  }, [apiKey, applySelectedVariant, copy, uploadedImageUrls.length]);

  const processDroppedImages = async (files) => {
    await handleFilesUpload(files);
  };

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const imageFiles = droppedFiles.filter(f => f.type.startsWith('image/'));
      if (imageFiles.length > 0) {
        processDroppedImages(imageFiles);
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, processDroppedImages]);

  const applyUserSelectedVariant = useCallback((variant, mode, family) => {
    if (mode === "t2i") {
      setUploadedImageUrls([]);
    } else {
      const maxImages = getMaxImagesForI2IModel(variant.model.id);
      setUploadedImageUrls((urls) => urls.slice(0, maxImages));
    }
    setSwapImageUrl(null);
    applySelectedVariant(variant, mode, family);
  }, [applySelectedVariant]);

  // ── Textarea auto-resize ─────────────────────────────────────────────────
  // ── Upload picker callbacks ──────────────────────────────────────────────
  const handleUploadSelect = useCallback(
    ({ url, urls }) => {
      const newUrls = urls || [url];
      const selection = selectionRef.current;
      const family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
      const target = getImageReferenceVariant(
        imageModelCatalog,
        family,
        selection.selectedModelId,
      ) || getFamilyVariant(imageModelCatalog, family, "i2i", selection.selectedModelId);
      if (!target) {
        toast.error(copy.errors.noImageReferenceSupport.replace("{name}", family.name));
        return;
      }

      const limit = getModelMediaCapabilities(target.model).image.maxItems;
      setUploadedImageUrls(newUrls.slice(0, limit));
      const currentMode = selection.imageMode ? "i2i" : "t2i";
      if (target.model.id !== selection.selectedModelId || target.mode !== currentMode) {
        applySelectedVariant(target, target.mode, family);
      }
    },
    [applySelectedVariant, copy],
  );

  const handleUploadClear = useCallback(() => {
    setUploadedImageUrls([]);
    const selection = selectionRef.current;
    const family = imageModelCatalog.familyById.get(selection.selectedFamilyId);
    const target = getFamilyVariant(
      imageModelCatalog,
      family,
      "t2i",
      selection.selectedModelId,
    );
    if (target) {
      applySelectedVariant(target, "t2i", family);
      toast(copy.paramsPanel?.autoSwitchedToT2I || "已自动切回纯文生图模型", { icon: "🔄" });
    }
  }, [applySelectedVariant, copy]);

  // ── Model selection ──────────────────────────────────────────────────────
  const handleModelSelect = (pickerEntry, category = "all") => {
    const { family, variantsByMode, defaultVariant } = pickerEntry;
    const target = category !== "all"
      ? variantsByMode[category]
      : uploadedImageUrls.length > 0 && variantsByMode.i2i
        ? variantsByMode.i2i
        : variantsByMode[currentMode] || defaultVariant;
    if (!target) return;

    applyUserSelectedVariant(target, target.mode, family);
  };

  // ── History helpers ──────────────────────────────────────────────────────
  const addToHistory = useCallback(
    (entry) => {
      if (!historyItems) {
        setLocalHistory((prev) => [entry, ...prev.slice(0, 49)]);
      }
      setActiveHistoryIdx(0);
      setCurrentImageUrl(entry.url);
    },
    [historyItems],
  );

  // ── View state ─────────────────────────────────────

  const resetToPrompt = () => {
    setCurrentImageUrl(null);
    setPrompt("");
    setUploadedImageUrls([]);
    setImageMode(false);
    const firstT2I = t2iModels[0];
    const ars = getAspectRatiosForModel(firstT2I.id);
    const resolutions = getResolutionsForModel(firstT2I.id);
    const family = imageModelCatalog.familyByVariantId.get(firstT2I.id);
    setSelectedModelId(firstT2I.id);
    setSelectedFamilyId(family.id);
    const nextAr = ars[0] || "1:1";
    const nextQual = resolutions[0] || "2K";
    setSelectedAr(nextAr);
    setSelectedQuality(resolutions[0] || null);
    const dims = calculatePixelDimensions(nextAr, nextQual);
    setCustomWidth(dims.width);
    setCustomHeight(dims.height);
    setSelectedEffect("");
    setModelParameterValues(createModelParameterValues(firstT2I));
  };

  // ── Generation ───────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    if (generating) return;

    const trimmedPrompt = (prompt || "").trim();
    const hasImages = uploadedImageUrls && uploadedImageUrls.length > 0;

    let effectiveImageMode = imageMode;
    let targetVariant = selectedVariant;
    let targetModelId = selectedModelId;

    // Gracefully handle i2i when user has no reference images: auto switch to t2i so send is not blocked
    if (effectiveImageMode && !hasImages) {
      const family = imageModelCatalog.familyById.get(selectedFamilyId);
      const t2iVar = family ? getFamilyVariant(imageModelCatalog, family, "t2i", selectedModelId) : null;
      if (t2iVar) {
        targetVariant = t2iVar;
        targetModelId = t2iVar.model.id;
      }
      effectiveImageMode = false;
      setImageMode(false);
      toast(copy.paramsPanel?.autoSwitchedToT2I || "未上传参考图，已自动切回文生图", { icon: "🔄" });
    }

    if (effectiveImageMode) {
      if (!hasImages) {
        toast.error(copy.errors?.uploadReferenceFirst || "请先添加参考图片");
        return;
      }
      const modelInfo = getI2IModelById(targetModelId);
      if (modelInfo?.swapField && !swapImageUrl) {
        toast.error(copy.errors?.uploadSwapFaceFirst || "请先上传换脸目标图片");
        return;
      }
    } else {
      const imageCapability = getModelMediaCapabilities(targetVariant?.model)?.image;
      if (hasImages && imageCapability?.maxItems === 0) {
        toast.error(
          (copy.errors?.noImageReferenceSupport || "{name} 不支持参考图").replace("{name}", selectedModelDisplayName)
        );
        return;
      }
      if (!trimmedPrompt && !hasImages) {
        toast.error(copy.errors?.enterPromptFirst || "请输入提示词以生成图像");
        textareaRef.current?.focus();
        return;
      }
    }

    onGenerationStart?.();
    setGenerating(true);
    setGenerateError(null);

    const count = Math.max(1, Math.min(4, parseInt(batchSize, 10) || 1));
    const validW = Math.round(Math.max(256, Math.min(4096, parseInt(customWidth, 10) || 1024)) / 64) * 64;
    const validH = Math.round(Math.max(256, Math.min(4096, parseInt(customHeight, 10) || 1024)) / 64) * 64;

    const modelArs = effectiveImageMode
      ? getAspectRatiosForI2IModel(targetModelId)
      : getAspectRatiosForModel(targetModelId);
    const effectiveAr = findClosestSupportedAspectRatio(validW, validH, modelArs);

    try {
      const settledResults = await Promise.allSettled(
        Array.from({ length: count }).map(async () => {
          const targetModel = targetVariant?.model || (effectiveImageMode ? getI2IModelById(targetModelId) : getModelById(targetModelId));
          const supportsDimensions = Boolean(targetModel?.inputs?.width || targetModel?.inputs?.height);
          const resolvedQuality = resolveModelQualityOrResolution(targetModel, selectedQuality);

          if (effectiveImageMode) {
            const genParams = {
              model: targetModelId,
              ...buildSupplementalInputPayload(
                targetVariant?.model,
                modelParameterValues,
              ),
              images_list: uploadedImageUrls,
              image_url: uploadedImageUrls[0],
              aspect_ratio: effectiveAr,
            };
            if (supportsDimensions) {
              genParams.width = validW;
              genParams.height = validH;
            }
            if (swapImageUrl) genParams.swap_url = swapImageUrl;
            if (trimmedPrompt) genParams.prompt = trimmedPrompt;
            if (resolvedQuality?.field && resolvedQuality?.value) {
              genParams[resolvedQuality.field] = resolvedQuality.value;
            }
            if (showEffectBtn && selectedEffect) genParams.name = selectedEffect;
            return await generateI2I(apiKey, genParams);
          } else {
            const referenceParams = buildReferenceParams(targetVariant?.model, {
              imageUrls: uploadedImageUrls,
            });
            const genParams = {
              model: targetModelId,
              ...buildSupplementalInputPayload(
                targetVariant?.model,
                modelParameterValues,
              ),
              ...referenceParams,
              prompt: trimmedPrompt,
              aspect_ratio: effectiveAr,
            };
            if (supportsDimensions) {
              genParams.width = validW;
              genParams.height = validH;
            }
            if (resolvedQuality?.field && resolvedQuality?.value) {
              genParams[resolvedQuality.field] = resolvedQuality.value;
            }
            return await generateImage(apiKey, genParams);
          }
        })
      );

      let successCount = 0;
      let failureCount = 0;
      let firstError = null;

      settledResults.forEach((result) => {
        if (result.status === "fulfilled") {
          const res = result.value;
          const outputUrl = extractOutputUrl(res);
          if (outputUrl) {
            successCount++;
            const entry = {
              id: res?.id || Math.random().toString(36).substring(7),
              url: outputUrl,
              prompt: trimmedPrompt,
              model: targetModelId,
              aspect_ratio: dimensionMode === "custom" ? `${validW}:${validH}` : effectiveAr,
              timestamp: new Date().toISOString(),
            };
            addToHistory(entry);
            onGenerationComplete?.({
              url: outputUrl,
              model: targetModelId,
              prompt: trimmedPrompt,
              type: "image",
            });
          } else {
            failureCount++;
            if (!firstError) firstError = new Error("生成结果未包含有效图片地址");
          }
        } else {
          failureCount++;
          if (!firstError) firstError = result.reason;
        }
      });

      if (successCount > 0) {
        toast.success("图片生成完成！", { icon: "🎨" });
      } else if (failureCount > 0) {
        const errMsg = formatErrorMessage(firstError, copy?.errors?.generationFailed || "生成失败，请重试");
        toast.error(errMsg);
        if (onGenerationError) onGenerationError(errMsg);
      }
    } catch (e) {
      console.error("[ImageStudio] Generation failed:", e);
      const errMsg = formatErrorMessage(e, copy?.errors?.generationFailed || "生成失败，请重试");
      toast.error(errMsg);
      if (onGenerationError) onGenerationError(errMsg);
    } finally {
      setGenerating(false);
      onGenerationEnd?.();
    }
  };

  const placeholderText =
    uploadedImageUrls.length > 1
      ? copy.promptBar.placeholderMultiImage.replace("{count}", uploadedImageUrls.length)
      : imageMode
        ? copy.promptBar.placeholderI2I
        : copy.promptBar.placeholderT2I;

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="w-full h-full flex flex-col items-center justify-center bg-app-bg relative p-4 md:p-6 overflow-hidden">
      
      {/* ── CENTRAL GALLERY AREA ── */}
      <div className="flex-1 w-full max-w-7xl mx-auto overflow-y-auto custom-scrollbar pb-40 lg:pb-32 px-2">
        {history.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6 w-full pt-4 animate-fade-in-up">
            {history.map((entry, idx) => (
              <div
                key={entry.id || idx}
                className="relative group rounded-lg overflow-hidden border border-line bg-canvas shadow-elevation-3 hover:border-primary/50 transition-all duration-page flex flex-col cursor-pointer"
                onClick={() => setFullscreenUrl(entry.url)}
              >
                <img
                  src={entry.url}
                  alt={entry.prompt?.substring(0, 30) || copy.gallery.generatedImageAlt}
                  className="w-full aspect-square object-cover bg-scrim hover:opacity-80 transition-opacity"
                />

                {/* Overlay actions */}
                <div className="absolute top-2 right-2 hidden md:flex flex-col gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GenerationCopyButtons
                    prompt={entry.prompt}
                    imageUrl={entry.url}
                    onCopyError={onGenerationError}
                  />
                  <button
                    type="button"
                    title={copy.gallery.download}
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`);
                    }}
                    className="p-2 bg-scrim backdrop-blur-md rounded-full text-ink hover:bg-primary hover:text-ink-inverse transition-all border border-line"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    title={copy.gallery.delete}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (confirm(copy.gallery.deleteConfirm)) {
                        handleDeleteEntry(entry, idx).catch((err) => {
                          onGenerationError?.(err.message || copy.gallery.deleteFailed);
                        });
                      }
                    }}
                    className="p-2 bg-scrim backdrop-blur-md rounded-full text-danger hover:bg-danger hover:text-ink transition-all border border-line"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                      <line x1="10" y1="11" x2="10" y2="17" />
                      <line x1="14" y1="11" x2="14" y2="17" />
                    </svg>
                  </button>
                </div>
                <MobileGenerationActions
                  prompt={entry.prompt}
                  imageUrl={entry.url}
                  onCopyError={onGenerationError}
                  actions={[
                    {
                      kind: "download",
                      label: copy.gallery.download,
                      onSelect: () =>
                        downloadImage(entry.url, `muapi-${entry.id || idx}.jpg`),
                    },
                    {
                      kind: "delete",
                      label: copy.gallery.delete,
                      danger: true,
                      onSelect: () => {
                        if (confirm(copy.gallery.deleteConfirm)) {
                          handleDeleteEntry(entry, idx).catch((err) => {
                            onGenerationError?.(err.message || copy.gallery.deleteFailed);
                          });
                        }
                      },
                    },
                  ]}
                />

                {/* Prompt & Details */}
                <div className="p-3 bg-scrim backdrop-blur-sm border-t border-line-subtle flex-1 flex flex-col justify-between gap-2">
                  <p className="text-ink-muted text-xs line-clamp-3 leading-relaxed" title={entry.prompt}>
                    {entry.prompt || copy.gallery.noPrompt}
                  </p>
                  <div className="flex items-center justify-between mt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-micro font-bold text-primary px-2 py-0.5 bg-primary/10 rounded border border-primary/20 capitalize">
                        {entry.model?.replace("-", " ") || copy.gallery.modelFallback}
                      </span>
                      <span className="text-micro text-ink-subtle">{entry.aspect_ratio}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full animate-fade-in-up transition-all duration-page min-h-[50vh]">
            {/* Overlapping floating cards */}
            <div className="flex items-center justify-center gap-1.5 md:gap-3 mb-10 select-none scale-90 sm:scale-100">
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-line shadow-elevation-4 -rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-page overflow-hidden bg-wash flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/sdxl-image.avif"
                  alt="Creative asset 1"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-line shadow-elevation-4 -rotate-[4deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-page overflow-hidden bg-wash -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/chroma-image.avif"
                  alt="Creative asset 2"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-18 h-18 sm:w-24 sm:h-24 rounded-full border border-line shadow-elevation-4 rotate-[6deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-page overflow-hidden bg-wash -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/neta-lumina.avif"
                  alt="Creative asset 3"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="w-18 h-22 sm:w-24 sm:h-28 rounded-2xl border border-line shadow-elevation-4 rotate-[12deg] transform hover:rotate-0 hover:scale-110 hover:z-20 transition-all duration-page overflow-hidden bg-wash -ml-3 sm:-ml-4 flex-shrink-0">
                <img
                  src="https://d3adwkbyhxyrtq.cloudfront.net/webassets/videomodels/perfect-pony-xl.avif"
                  alt="Creative asset 4"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <h1 className="text-2xl sm:text-4xl md:text-5xl font-extrabold tracking-tight mb-4 text-center px-4 flex flex-col items-center">
              <span className="text-ink font-black uppercase text-xl sm:text-3xl tracking-wide mb-1 opacity-90">{copy.emptyState.heading}</span>
              <span className="text-brand font-black uppercase text-2xl sm:text-4xl sm:mt-1 tracking-tight">
                {selectedModelDisplayName}
              </span>
            </h1>
            <p className="text-ink-subtle text-xs sm:text-sm font-medium tracking-wide text-center max-w-lg leading-relaxed px-4">
              {copy.emptyState.subtitle}
            </p>
          </div>
        )}
      </div>

      {/* ── BOTTOM PROMPT BAR ── */}
      <PromptComposer>
        {/* Hidden global file input for media picker */}
        <input
          ref={globalFileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => {
            handleFilesUpload(e.target.files);
            e.target.value = "";
          }}
        />

        {/* Top row: upload picker + textarea */}
        <div className="flex flex-col gap-2">
          {/* Top action row: Left '+' button (Figure 4) + Reference images cards (Figure 3) */}
          <div className="flex items-start gap-2.5">
            {/* Left '+' Image Reference Button (纯粹添加参考图片) */}
            <div className="relative pt-0.5 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  globalFileInputRef.current?.click();
                }}
                className="w-8 h-8 rounded-xl border transition-all flex items-center justify-center cursor-pointer bg-wash border-line hover:bg-wash-strong hover:border-brand-ring hover:text-brand text-ink-muted active:scale-95 shadow-elevation-1"
                title={copy.paramsPanel?.addReference || "添加参考图片"}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>

            {/* Reference images row if any (Figure 3) */}
            {uploadedImageUrls && uploadedImageUrls.length > 0 && (
              <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                <div className="flex items-center gap-2 text-[11px] font-medium text-brand pl-0.5 select-none">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand animate-pulse" />
                  <span>{copy.paramsPanel?.smartReference || "智能参考"}</span>
                  <span className="text-ink-subtle text-micro">({uploadedImageUrls.length}/{referenceImageLimit})</span>
                </div>
                <div className="flex items-center gap-2.5 overflow-x-auto custom-scrollbar pb-1">
                  {uploadedImageUrls.map((url, idx) => (
                    <div
                      key={url + idx}
                      className="relative w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl border border-line-strong bg-wash overflow-hidden shadow-elevation-2 group transition-transform hover:scale-105"
                    >
                      <img
                        src={url}
                        alt={`Reference ${idx + 1}`}
                        className="w-full h-full object-cover cursor-pointer"
                        onClick={() => setFullscreenUrl(url)}
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const next = uploadedImageUrls.filter((_, i) => i !== idx);
                          setUploadedImageUrls(next);
                          if (next.length === 0) handleUploadClear();
                        }}
                        className="absolute top-1 right-1 w-5 h-5 bg-scrim hover:bg-danger text-ink rounded-full flex items-center justify-center text-xs shadow-elevation-2 border border-line transition-colors cursor-pointer"
                        title="移除"
                      >
                        ×
                      </button>
                    </div>
                  ))}

                  {/* + Append Reference Card */}
                  {uploadedImageUrls.length < referenceImageLimit && (
                    <button
                      type="button"
                      onClick={() => globalFileInputRef.current?.click()}
                      className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-xl border border-dashed border-line-strong hover:border-brand bg-wash hover:bg-brand-soft flex flex-col items-center justify-center gap-1 cursor-pointer transition-all group"
                      title={copy.paramsPanel?.addReference || "添加参考图"}
                    >
                      <span className="text-xl font-light text-ink-subtle group-hover:text-brand transition-colors">+</span>
                      <span className="text-micro text-ink-subtle group-hover:text-brand transition-colors">
                        {copy.paramsPanel?.addReference || "添加"}
                      </span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Input prompt text area */}
          <PromptTextarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !generating && !e.nativeEvent.isComposing && e.keyCode !== 229) {
                e.preventDefault();
                handleGenerate();
              }
            }}
            placeholder={placeholderText}
          />
        </div>

        {/* Bottom row: Pill Controls (Figure 1) + generate */}
        <PromptFooter>
          {/* Left controls: Pills */}
          <PromptControls ref={dropdownRef}>
            {/* 1. Mode Pill: [图片生成 v] */}
            <div className="relative" ref={modeSelectRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsModeSelectOpen((v) => !v);
                  setDropdownOpen(null);
                  setIsParamsPanelOpen(false);
                }}
                className={promptControlClassName({
                  active: isModeSelectOpen,
                })}
              >
                <ImageIcon size={14} strokeWidth={1.8} aria-hidden className="shrink-0 opacity-70" />
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {uploadedImageUrls.length > 0
                    ? (copy.paramsPanel?.modeImageToImage || "图生图")
                    : (copy.paramsPanel?.modeImageGen || "图片生成")}
                </span>
                <PromptChevronIcon className={isModeSelectOpen ? "rotate-180" : ""} />
              </button>

              {isModeSelectOpen && (
                <PromptPopover
                  onClick={(e) => e.stopPropagation()}
                  className="min-w-[150px] p-1.5"
                >
                  <PromptMenuList>
                    <PromptMenuItem
                      selected={uploadedImageUrls.length === 0}
                      onClick={() => {
                        handleUploadClear();
                        setIsModeSelectOpen(false);
                      }}
                    >
                      {copy.paramsPanel?.modeImageGen || "图片生成 (文生图)"}
                    </PromptMenuItem>
                    <PromptMenuItem
                      selected={uploadedImageUrls.length > 0}
                      onClick={() => {
                        globalFileInputRef.current?.click();
                        setIsModeSelectOpen(false);
                      }}
                    >
                      {copy.paramsPanel?.modeImageToImage || "图生图 (参考图像)"}
                    </PromptMenuItem>
                  </PromptMenuList>
                </PromptPopover>
              )}
            </div>

            {/* 2. Model Pill: [Seedream 5.0 Pro ✦] (Figure 1) */}
            <div className="relative">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setDropdownOpen((o) => (o === "model" ? null : "model"));
                  setIsParamsPanelOpen(false);
                  setIsModeSelectOpen(false);
                }}
                className={promptControlClassName({
                  active: dropdownOpen === "model",
                })}
              >
                <div className="size-4 shrink-0 overflow-hidden rounded-xs border border-line bg-well flex items-center justify-center">
                  {(() => {
                    const selectedModelProvider = selectedFamily.provider || 'muapi';
                    const logo = getProviderLogo(selectedModelProvider);
                    const style = getProviderStyle(selectedModelProvider);
                    return logo ? (
                      <img 
                        src={logo} 
                        alt="" 
                        className={`w-full h-full object-contain ${invertLogos.includes(selectedModelProvider) ? "invert" : ""}`} 
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <span className="text-caption font-bold uppercase text-ink-muted">
                        {style.text || "M"}
                      </span>
                    );
                  })()}
                </div>
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {selectedModelDisplayName}
                </span>
                <span className="text-brand text-caption font-bold" aria-hidden>✦</span>
                <PromptChevronIcon className={dropdownOpen === "model" ? "rotate-180" : ""} />
              </button>

              {dropdownOpen === "model" && (
                <PromptPopover
                  onClick={(e) => e.stopPropagation()}
                  className="w-[calc(100vw-2rem)] md:w-[480px] max-w-md md:max-w-none max-h-[70vh]"
                >
                  <PromptPopoverHeader>
                    {copy.modelDropdown?.selectModelHeader || copy.popovers.model}
                  </PromptPopoverHeader>
                  <ModelDropdown
                    selectedModel={selectedModelId}
                    onSelect={handleModelSelect}
                    onClose={() => setDropdownOpen(null)}
                    copy={copy}
                  />
                </PromptPopover>
              )}
            </div>

            {/* 3. Integrated Parameters Pill: [比例/尺寸 · 分辨率 · 数量] */}
            <div className="relative" ref={paramsPanelRef}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsParamsPanelOpen((v) => !v);
                  setDropdownOpen(null);
                  setIsModeSelectOpen(false);
                }}
                className={promptControlClassName({
                  active: isParamsPanelOpen,
                })}
              >
                <AspectLineIcon ratio={selectedAr} active={isParamsPanelOpen} />
                <span className={PROMPT_CONTROL_LABEL_CLASS}>
                  {(() => {
                    const qualText = (() => {
                      const q = String(selectedQuality || "2K").toUpperCase();
                      if (q.includes("1K") || q === "BASIC" || q === "LOW") return "1K";
                      if (q.includes("4K") || q === "ULTRA") return "4K ✦";
                      return "2K ✦";
                    })();
                    const batchText = (
                      copy.paramsPanel?.batchCountUnit || "{count} img"
                    ).replace("{count}", batchSize);
                    if (dimensionMode === "custom") {
                      return `${customWidth}×${customHeight} PX · ${qualText} · ${batchText}`;
                    }
                    const arText = (!selectedAr || selectedAr === "adaptive" || selectedAr === "auto" || selectedAr === "智能")
                      ? (copy.paramsPanel?.smartRatio || "智能比例")
                      : selectedAr;
                    return `${arText} · ${qualText} · ${batchText}`;
                  })()}
                </span>
                <PromptChevronIcon className={isParamsPanelOpen ? "rotate-180" : ""} />
              </button>

              {isParamsPanelOpen && (
                <PromptPopover
                  onClick={(e) => e.stopPropagation()}
                  className="p-1"
                >
                  <ParamsPopoverPanel
                    selectedAr={selectedAr}
                    onSelectAr={handleSelectAr}
                    aspectRatios={currentAspectRatios}
                    selectedQuality={selectedQuality}
                    onSelectQuality={handleSelectQuality}
                    onSelectPresetDimension={handleSelectPresetDimension}
                    resolutions={currentResolutions}
                    batchSize={batchSize}
                    onChangeBatchSize={(num) => setBatchSize(num)}
                    customWidth={customWidth}
                    customHeight={customHeight}
                    onChangeDimensions={handleChangeDimensions}
                    onSwapDimensions={handleSwapDimensions}
                    dimensionMode={dimensionMode}
                    onChangeDimensionMode={setDimensionMode}
                    supplementalInputs={supplementalInputs}
                    modelParameterValues={modelParameterValues}
                    onChangeModelParameter={(key, value) =>
                      setModelParameterValues((values) => ({ ...values, [key]: value }))
                    }
                    copy={copy}
                    onClose={() => setIsParamsPanelOpen(false)}
                  />
                </PromptPopover>
              )}
            </div>

            {/* 4. Draw button: [ ✏️ 绘制 ] (保留原有真实功能) */}
            <button
              type="button"
              className={promptControlClassName()}
              onClick={() => setIsDrawModalOpen(true)}
            >
              <Pencil size={14} strokeWidth={1.8} aria-hidden className="shrink-0 opacity-70" />
              <span className={PROMPT_CONTROL_LABEL_CLASS}>
                {copy.promptBar.drawButton}
              </span>
            </button>
          </PromptControls>

          {/* Right controls: Credit info + Generate Button */}
          <div className="flex shrink-0 items-center gap-3">
            {/* Credits indicator */}
            <div className="hidden select-none items-center gap-1.5 text-label text-ink-muted sm:flex">
              <span className="font-bold text-brand" aria-hidden>✦</span>
              <span>
                {(copy.paramsPanel?.creditPerImage || "").replace(
                  "{cost}",
                  selectedQuality && String(selectedQuality).includes("4K") ? "12" : "8"
                )}
              </span>
              <span className="text-caption text-ink-subtle line-through">
                {copy.paramsPanel?.creditPerImageOriginal}
              </span>
            </div>

            {/* Generate: `PromptAction` is the composer's designated primary
                action and eight sibling studios already use it; the bespoke
                40px white circle left here orphaned on its own row at 390px
                and carried no accessible name. */}
            <PromptAction onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <>
                  <Spinner size="sm" />
                  <span>{copy.promptBar?.generating}</span>
                </>
              ) : (
                <>
                  <span>{copy.promptBar?.generateButton}</span>
                  <ArrowUp size={16} strokeWidth={2.4} aria-hidden />
                </>
              )}
            </PromptAction>
          </div>
        </PromptFooter>
      </PromptComposer>

      {/* ── FULLSCREEN IMAGE MODAL ── */}
      {fullscreenUrl && (
        <div 
          className="fixed inset-0 z-[100] flex items-center justify-center bg-scrim backdrop-blur-sm animate-fade-in"
          onClick={() => setFullscreenUrl(null)}
        >
          <button
            type="button"
            className="absolute top-6 right-6 p-3 bg-wash-press hover:bg-wash-press rounded-full text-ink transition-colors border border-line"
            onClick={(e) => {
              e.stopPropagation();
              setFullscreenUrl(null);
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
          <img
            src={fullscreenUrl}
            alt={copy.fullscreen.previewAlt}
            className="max-w-[95vw] max-h-[95vh] rounded-2xl shadow-elevation-4 object-contain animate-scale-up" 
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}

      {/* ── DRAW CANVAS MODAL ── */}
      <DrawModal
        isOpen={isDrawModalOpen}
        onClose={() => setIsDrawModalOpen(false)}
        apiKey={apiKey}
        batchSize={1}
        onAddHistoryItem={addToHistory}
      />
      <Toaster position="top-right" containerStyle={{ zIndex: 'var(--z-toast)' }} toastOptions={{ duration: 5000, style: { background: 'var(--bg-overlay)', color: 'var(--text-primary)', border: '1px solid var(--border-strong)', fontSize: 'var(--text-body-sm)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-3)', maxWidth: '440px', wordBreak: 'break-word', whiteSpace: 'pre-wrap', padding: '12px 16px' } }} />
    </div>
  );
}
