"use client";

import { useState, useEffect, useRef, useCallback, useId } from "react";
import { toast } from "react-hot-toast";
import {
  AlertCircle,
  ArrowLeft,
  Download,
  Music,
  Pause,
  Play,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
} from "lucide-react";
import { cn } from "../ui/cn";
import { Button, IconButton } from "../ui/Button";
import { FieldMessage, Input, Label, Switch, Textarea } from "../ui/Field";
import { Alert, EmptyState, Progress, ToastHost } from "../ui/Feedback";
import { Badge } from "../ui/Surface";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/Overlay";
import { CARD_BASE, CARD_INTERACTIVE, CARD_SURFACE } from "../ui/tokens";
import { generateAudio, uploadFile } from "../muapi.js";
import { formatErrorMessage } from "../utils/formatError.js";
import { scopedPersistKey, migrateLegacyPersistKey } from "../persistKey.js";
import { audioModels, getAudioModelById } from "../models.js";
import en from "../messages/en/audioStudio.json";
import zh from "../messages/zh/audioStudio.json";
import ja from "../messages/ja-JP/audioStudio.json";
import ko from "../messages/ko-KR/audioStudio.json";
import zhTw from "../messages/zh-TW/audioStudio.json";
import es from "../messages/es/audioStudio.json";
import { resolveCopy } from "../i18nUtils";

// ---------------------------------------------------------------------------
// Upload button states
// ---------------------------------------------------------------------------
const UPLOAD_STATE = {
  IDLE: "idle",
  UPLOADING: "uploading",
  READY: "ready",
};

// Icons come from lucide-react (single icon system). Size and strokeWidth are
// set at each call site because the control contract fixes the glyph footprint
// relative to the hit area, not per icon.

// ---------------------------------------------------------------------------
// Single File Uploader Component
// ---------------------------------------------------------------------------
function AudioFileUploader({ label, value, onChange, apiKey, copy = en }) {
  const [uploadState, setUploadState] = useState(value ? UPLOAD_STATE.READY : UPLOAD_STATE.IDLE);
  const [progress, setProgress] = useState(0);
  const [fileName, setFileName] = useState(value ? value.split('/').pop().slice(-30) : "");
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  const dragCounterRef = useRef(0);
  const inputId = useId();

  useEffect(() => {
    if (!value) {
      setUploadState(UPLOAD_STATE.IDLE);
      setFileName("");
      setProgress(0);
    } else if (uploadState !== UPLOAD_STATE.READY) {
      setUploadState(UPLOAD_STATE.READY);
      setFileName(value.split('/').pop().slice(-30));
    }
  }, [value]);

  const handleUpload = async (files) => {
    const file = files?.[0];
    if (!file) return;

    if (file.size > 20 * 1024 * 1024) {
      toast.error(copy.uploader.sizeLimitError);
      return;
    }

    setUploadState(UPLOAD_STATE.UPLOADING);
    setProgress(0);

    try {
      const url = await uploadFile(apiKey, file, (pct) => {
        setProgress(pct);
      });
      setFileName(file.name);
      setUploadState(UPLOAD_STATE.READY);
      onChange(url);
    } catch (err) {
      setUploadState(UPLOAD_STATE.IDLE);
      toast.error(copy.uploader.uploadFailedError.replace('{message}', err.message));
    } finally {
      setProgress(0);
    }
  };

  const handleInputChange = (e) => {
    handleUpload(Array.from(e.target.files || []));
  };

  const clearFile = (e) => {
    e.stopPropagation();
    onChange(null);
  };

  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadState !== UPLOAD_STATE.IDLE) return;
    dragCounterRef.current += 1;
    if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadState !== UPLOAD_STATE.IDLE) return;
    dragCounterRef.current -= 1;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDragging(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current = 0;
    setIsDragging(false);
    if (uploadState !== UPLOAD_STATE.IDLE) return;
    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      handleUpload(Array.from(files));
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor={inputId} className="uppercase tracking-wide">
          {label}
        </Label>
        {uploadState === UPLOAD_STATE.READY && (
          <Button variant="danger" size="xs" onClick={clearFile}>
            <Trash2 size={14} strokeWidth={1.8} aria-hidden="true" />
            {copy.uploader.clear}
          </Button>
        )}
      </div>

      <div
        onClick={() => uploadState === UPLOAD_STATE.IDLE && fileInputRef.current?.click()}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        className={cn(
          "relative flex cursor-pointer items-center gap-3 rounded-md border p-4",
          "transition-[background-color,border-color] duration-base ease-standard",
          // The file input is visually hidden but focusable, so the ring that
          // belongs to it has to be drawn by the tile (PART 33: keyboard).
          "has-[:focus-visible]:border-brand has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand-ring",
          isDragging && "border-brand bg-brand-soft",
          !isDragging &&
            uploadState === UPLOAD_STATE.READY &&
            "border-brand-line bg-brand-soft",
          !isDragging &&
            uploadState === UPLOAD_STATE.IDLE &&
            "border-line bg-well hover:border-line-strong hover:bg-wash",
        )}
      >
        <input
          id={inputId}
          ref={fileInputRef}
          type="file"
          accept="audio/*"
          className="sr-only"
          onChange={handleInputChange}
        />

        {uploadState === UPLOAD_STATE.IDLE && (
          <>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-raised text-ink-muted">
              <Upload size={18} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0 text-left">
              <div className="text-label font-medium truncate text-ink">
                {copy.uploader.uploadPrompt}
              </div>
              <div className="text-caption mt-0.5 text-ink-subtle">
                {copy.uploader.uploadHint}
              </div>
            </div>
          </>
        )}

        {uploadState === UPLOAD_STATE.UPLOADING && (
          <Progress
            className="min-w-0 flex-1"
            label={copy.uploader.uploading}
            showValue
            size="sm"
            value={progress}
          />
        )}

        {uploadState === UPLOAD_STATE.READY && (
          <>
            <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-brand-line bg-brand-soft text-brand">
              <Music size={18} strokeWidth={1.8} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 text-left">
              <div className="text-label font-medium truncate text-ink">{fileName}</div>
              <div className="text-caption mt-0.5 text-brand">
                {copy.uploader.ready}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Multiple File Uploader Component (for array fields like audios_list)
// ---------------------------------------------------------------------------
function AudioListUploader({ label, value = [], onChange, apiKey, maxItems = 2, copy = en }) {
  const handleItemChange = (index, url) => {
    const newItems = [...value];
    if (url) {
      newItems[index] = url;
    } else {
      newItems.splice(index, 1);
    }
    onChange(newItems.filter(Boolean));
  };

  return (
    <div className="space-y-4">
      {/* A group heading, not a form label: each track below carries its own. */}
      <span className="text-label block uppercase tracking-wide text-ink-muted">
        {label} {copy.uploader.maxSuffix.replace('{max}', maxItems)}
      </span>
      <div className="space-y-3">
        {Array.from({ length: maxItems }).map((_, i) => (
          <AudioFileUploader
            key={i}
            label={copy.uploader.trackLabel.replace('{index}', i + 1)}
            value={value[i] || null}
            onChange={(url) => handleItemChange(i, url)}
            apiKey={apiKey}
            copy={copy}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Premium Custom Audio Player with Waveform Animation
// ---------------------------------------------------------------------------
function PremiumAudioPlayer({ url, title, copy = en }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef(null);
  const visualizerIntervalRef = useRef(null);
  const [visualizerHeights, setVisualizerHeights] = useState(Array(18).fill(15));

  // Reset player when URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [url]);

  // Audio state event listeners
  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  // Toggle playback
  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch(err => {
        console.error("Audio playback error:", err);
      });
    }
  };

  // Equalizer visualizer effect
  useEffect(() => {
    if (isPlaying) {
      visualizerIntervalRef.current = setInterval(() => {
        setVisualizerHeights(
          Array(18).fill(0).map(() => Math.floor(Math.random() * 32) + 6)
        );
      }, 100);
    } else {
      if (visualizerIntervalRef.current) {
        clearInterval(visualizerIntervalRef.current);
      }
      setVisualizerHeights(Array(18).fill(12));
    }
    return () => {
      if (visualizerIntervalRef.current) clearInterval(visualizerIntervalRef.current);
    };
  }, [isPlaying]);

  // Volume control
  const handleVolumeChange = (e) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
    }
    if (val === 0) {
      setIsMuted(true);
    } else {
      setIsMuted(false);
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    if (isMuted) {
      audioRef.current.volume = volume;
      setIsMuted(false);
    } else {
      audioRef.current.volume = 0;
      setIsMuted(true);
    }
  };

  // Scrubbing. A native range gives pointer dragging, keyboard arrows and a
  // focus ring for one element instead of a click hit-test that only the
  // mouse could reach.
  const handleSeek = (e) => {
    if (!audioRef.current || duration === 0) return;
    const seekTime = Number(e.target.value);
    audioRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Helper formatting time
  const formatTime = (time) => {
    if (isNaN(time)) return "0:00";
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? "0" : ""}${seconds}`;
  };

  const downloadAudio = async () => {
    try {
      const response = await fetch(url);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = blobUrl;
      a.download = title ? `${title.replace(/\s+/g, '_')}.mp3` : "generated_audio.mp3";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch {
      window.open(url, "_blank");
    }
  };

  return (
    <div className="w-full space-y-5 rounded-xl border border-line bg-surface p-5 shadow-elevation-2 sm:p-6">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onAudioEnded}
        preload="auto"
      />

      {/* Visualizer and track details */}
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-line bg-canvas px-4 py-6">
        <div className="flex h-12 items-center justify-center gap-1.5" aria-hidden="true">
          {visualizerHeights.map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-full bg-brand transition-[height] duration-fast ease-standard"
              style={{ height: `${h}px` }}
            />
          ))}
        </div>
        <div className="max-w-full px-4 text-center">
          <span className="text-label mb-1 block font-medium uppercase tracking-widest text-brand">
            {copy.player.nowPlaying}
          </span>
          <p className="text-body max-w-xs truncate font-medium text-ink">
            {title || copy.player.defaultTitle}
          </p>
        </div>
      </div>

      {/* Seek */}
      <div className="flex items-center gap-3">
        <span className="text-mono w-12 shrink-0 text-right text-ink-muted">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          className="range min-w-0 flex-1"
          min="0"
          max={duration || 0}
          step="0.01"
          value={Math.min(currentTime, duration || 0)}
          onChange={handleSeek}
          disabled={duration === 0}
          aria-label={copy.player.seek}
        />
        <span className="text-mono w-12 shrink-0 text-left text-ink-muted">
          {formatTime(duration)}
        </span>
      </div>

      {/* Transport */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <IconButton
            icon={isMuted ? VolumeX : Volume2}
            size="sm"
            label={copy.player.muteUnmute}
            onClick={toggleMute}
          />
          <input
            type="range"
            className="range w-16 shrink-0"
            min="0"
            max="1"
            step="0.05"
            value={isMuted ? 0 : volume}
            onChange={handleVolumeChange}
            aria-label={copy.player.volume}
          />
        </div>

        <Button
          variant="primary"
          size="icon-lg"
          className="shrink-0 rounded-full"
          onClick={togglePlay}
          aria-label={isPlaying ? copy.player.pause : copy.player.play}
        >
          {isPlaying ? (
            <Pause size={18} strokeWidth={2} aria-hidden="true" />
          ) : (
            <Play size={18} strokeWidth={2} fill="currentColor" aria-hidden="true" />
          )}
        </Button>

        <Button
          variant="secondary"
          size="sm"
          onClick={downloadAudio}
          aria-label={copy.player.download}
        >
          <Download size={14} strokeWidth={1.8} aria-hidden="true" />
          {copy.player.save}
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Audio Studio Component
// ---------------------------------------------------------------------------
export default function AudioStudio({
  apiKey,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
  historyItems,
  droppedFiles,
  onFilesHandled,
  locale = "en",
}) {
  const copy = resolveCopy(en, { 'zh-CN': zh, 'ja-JP': ja, 'ko-KR': ko, 'zh-TW': zhTw, es }, locale);
  const LEGACY_PERSIST_KEY = "hg_audio_studio_persistent";
  const PERSIST_KEY = scopedPersistKey(LEGACY_PERSIST_KEY, apiKey);
  useEffect(() => {
    migrateLegacyPersistKey(LEGACY_PERSIST_KEY, PERSIST_KEY);
  }, [PERSIST_KEY]);

  // ── Mode & model state ──────────────────────────────────────────────────
  const [selectedModelId, setSelectedModelId] = useState(audioModels[0]?.id ?? "");
  const [params, setParams] = useState({});
  const modelSelectId = useId();

  // ── Generation state ──────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState(null);
  const [activeResultUrl, setActiveResultUrl] = useState(null);
  const [activeResultTitle, setActiveResultTitle] = useState("");
  const [view, setView] = useState("input"); // 'input' | 'result'

  // ── History state ────────────────────────────────────────────────────
  const [internalHistory, setInternalHistory] = useState([]);
  const history = historyItems ?? internalHistory;
  const [activeHistoryIdx, setActiveHistoryIdx] = useState(0);

  const selectedModel = getAudioModelById(selectedModelId);

  // ── Initialize params when model changes ──────────────────────────────
  useEffect(() => {
    if (!selectedModel) return;
    const initial = {};
    Object.entries(selectedModel.inputs || {}).forEach(([key, schema]) => {
      // Don't overwrite parameters like vocal upload, list etc. if they are already in state
      if (params[key] !== undefined) {
        initial[key] = params[key];
      } else {
        initial[key] = schema.default !== undefined ? schema.default : "";
      }
    });
    setParams(initial);
  }, [selectedModelId]); // Only reset when model ID changes

  // ── Persistence: Load ────────────────────────────────────────────────────
  useEffect(() => {
    try {
      const stored = localStorage.getItem(PERSIST_KEY);
      if (stored) {
        const data = JSON.parse(stored);
        if (data.selectedModelId) setSelectedModelId(data.selectedModelId);
        if (data.params) setParams(data.params);
        if (data.internalHistory) setInternalHistory(data.internalHistory);
        if (data.activeResultUrl) setActiveResultUrl(data.activeResultUrl);
        if (data.activeResultTitle) setActiveResultTitle(data.activeResultTitle);
        if (data.view) setView(data.view);
      }
    } catch (err) {
      console.warn("Failed to load AudioStudio persistence:", err);
    }
  }, []);

  // ── Persistence: Save ────────────────────────────────────────────────────
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const state = {
          selectedModelId,
          params,
          internalHistory,
          activeResultUrl,
          activeResultTitle,
          view,
        };
        localStorage.setItem(PERSIST_KEY, JSON.stringify(state));
      } catch (err) {
        console.warn("Failed to save AudioStudio persistence:", err);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [selectedModelId, params, internalHistory, activeResultUrl, activeResultTitle, view]);

  // ── Handle Dropped Files ────────────────────────────────────────────────
  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const audioFiles = droppedFiles.filter(f => f.type.startsWith('audio/'));
      if (audioFiles.length > 0 && selectedModel) {
        // Find the first audio input field in the current model
        const firstAudioField = Object.entries(selectedModel.inputs || {}).find(
          ([_, schema]) => schema.field === 'audio'
        );
        const firstAudioListField = Object.entries(selectedModel.inputs || {}).find(
          ([_, schema]) => schema.field === 'audios_list'
        );

        if (firstAudioField) {
          const [key] = firstAudioField;
          // Trigger file upload helper
          uploadFile(apiKey, audioFiles[0], () => {})
            .then(url => {
              setParams(prev => ({ ...prev, [key]: url }));
            })
            .catch(err => toast.error(copy.generate.droppedFileUploadError.replace('{message}', err.message)));
        } else if (firstAudioListField) {
          const [key] = firstAudioListField;
          uploadFile(apiKey, audioFiles[0], () => {})
            .then(url => {
              setParams(prev => {
                const currentList = Array.isArray(prev[key]) ? [...prev[key]] : [];
                if (currentList.length < 2) currentList.push(url);
                return { ...prev, [key]: currentList };
              });
            })
            .catch(err => toast.error(copy.generate.droppedFileUploadError.replace('{message}', err.message)));
        }
      }
      onFilesHandled?.();
    }
  }, [droppedFiles, onFilesHandled, selectedModel, apiKey]);

  // ── History helpers ─────────────────────────────────────────────────────
  const addToInternalHistory = useCallback((entry) => {
    setInternalHistory((prev) => [entry, ...prev].slice(0, 30));
  }, []);

  const handleSelectHistory = (entry, index) => {
    setActiveResultUrl(entry.url);
    setActiveResultTitle(entry.title || entry.prompt || copy.player.defaultTitle);
    setActiveHistoryIdx(index);
    setView("result");
  };

  const handleGenerate = async () => {
    if (!selectedModel) return;

    // Check required fields
    if (selectedModel.required) {
      for (const field of selectedModel.required) {
        if (!params[field] || (Array.isArray(params[field]) && params[field].length === 0)) {
          toast.error(copy.sidebar.requiredFieldError.replace('{field}', selectedModel.inputs?.[field]?.title || field));
          return;
        }
      }
    }

    onGenerationStart?.();
    setIsGenerating(true);
    setGenerateError(null);

    try {
      const audioParams = {
        ...params,
        _modelId: selectedModelId,
      };

      // Call generateAudio
      const res = await generateAudio(apiKey, audioParams);

      if (!res?.url) {
        throw new Error(copy.generate.noUrlError);
      }

      const title = params.title || params.prompt || `Generated ${selectedModel.name}`;
      const entry = {
        id: res.id || Date.now().toString(),
        url: res.url,
        title,
        prompt: params.prompt || "",
        model: selectedModelId,
        timestamp: new Date().toISOString(),
      };

      if (!historyItems) addToInternalHistory(entry);

      setActiveResultUrl(res.url);
      setActiveResultTitle(title);
      setView("result");
      setActiveHistoryIdx(0);

      if (onGenerationComplete) {
        onGenerationComplete({
          url: res.url,
          model: selectedModelId,
          prompt: params.prompt,
          type: "audio",
        });
      }
    } catch (e) {
      console.error("[AudioStudio]", e);
      const errMsg = formatErrorMessage(e, copy.generate.genericError);
      if (onGenerationError) onGenerationError(errMsg);
      else toast.error(errMsg);
    } finally {
      setIsGenerating(false);
      onGenerationEnd?.();
    }
  };

  const handleNew = () => {
    setView("input");
    setActiveResultUrl(null);
    setActiveResultTitle("");
    // Keep parameters to avoid having to reupload files if they wish to adjust details
  };

  return (
    <div className="relative flex h-full w-full flex-col overflow-y-auto bg-canvas text-ink lg:flex-row lg:overflow-hidden">

      {/* ─── LEFT CONFIGURATION SIDEBAR ─── */}
      {/* Stacked under `lg`: a row flex with a `w-full` sidebar leaves the
          result pane zero-width on a phone, so the shell only becomes two
          independently scrolling columns at the desktop breakpoint. */}
      <div className="relative flex w-full shrink-0 flex-col border-b border-line bg-surface lg:w-panel lg:border-b-0 lg:border-r">
        <div className="space-y-6 p-6 pb-24 lg:flex-1 lg:overflow-y-auto">

          {/* Model Selector */}
          <div className="space-y-2">
            <Label htmlFor={modelSelectId} className="uppercase tracking-wide">
              {copy.sidebar.modelLabel}
            </Label>
            <Select value={selectedModelId} onValueChange={setSelectedModelId}>
              <SelectTrigger id={modelSelectId}>
                <SelectValue placeholder={copy.sidebar.selectModel} />
              </SelectTrigger>
              <SelectContent>
                {audioModels.map((model) => (
                  <SelectItem key={model.id} value={model.id} description={model.description}>
                    {model.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model Description */}
          {selectedModel?.description && (
            <div>
              <span className="text-label mb-1.5 block font-medium uppercase tracking-wide text-ink-subtle">
                {copy.sidebar.descriptionLabel}
              </span>
              <p className="text-body-sm font-medium leading-relaxed text-ink-muted">
                {selectedModel.description}
              </p>
            </div>
          )}

          {/* Dynamic Configuration Form */}
          <div className="space-y-5">
            {selectedModel && Object.entries(selectedModel.inputs || {}).map(([key, schema]) => {
              // Skip model switcher itself (if it's in schemas)
              if (key === 'model') return null;
              // Audio URL file upload (single)
              if (schema.type === "string" && schema.field === "audio") {
                return (
                  <AudioFileUploader
                    key={key}
                    label={schema.title || key}
                    value={params[key] || ""}
                    onChange={(url) => setParams(prev => ({ ...prev, [key]: url }))}
                    apiKey={apiKey}
                    copy={copy}
                  />
                );
              }
              // Audio URLs list file upload (multiple)
              if (schema.type === "array" && schema.field === "audios_list") {
                return (
                  <AudioListUploader
                    key={key}
                    label={schema.title || key}
                    value={params[key] || []}
                    onChange={(urls) => setParams(prev => ({ ...prev, [key]: urls }))}
                    apiKey={apiKey}
                    maxItems={schema.maxItems || 2}
                    copy={copy}
                  />
                );
              }
              // Boolean Toggles
              if (schema.type === "boolean") {
                const switchId = `audio-bool-${key}`;
                return (
                  <div key={key} className="flex items-center justify-between gap-4 rounded-md border border-line bg-well p-4">
                    <div className="min-w-0 flex-1">
                      <Label htmlFor={switchId} className="truncate">
                        {schema.title || key}
                      </Label>
                      {schema.description && (
                        <span className="text-caption mt-1 block leading-normal text-ink-subtle">
                          {schema.description}
                        </span>
                      )}
                    </div>
                    <Switch
                      id={switchId}
                      checked={!!params[key]}
                      onCheckedChange={(next) => setParams(prev => ({ ...prev, [key]: next }))}
                    />
                  </div>
                );
              }
              // Enum Dropdowns
              if (schema.enum) {
                // Radix Select matches on strings, so a numeric enum is mapped
                // back to its original type on selection.
                const options = schema.enum.map((opt) =>
                  typeof opt === "object" ? opt : { value: opt, label: opt },
                );
                const selectId = `audio-enum-${key}`;
                const current = params[key];
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={selectId} className="uppercase tracking-wide">
                      {schema.title || key}
                    </Label>
                    <Select
                      value={current === undefined || current === null ? "" : String(current)}
                      onValueChange={(next) => {
                        const picked = options.find((o) => String(o.value) === next);
                        setParams(prev => ({ ...prev, [key]: picked ? picked.value : next }));
                      }}
                    >
                      <SelectTrigger id={selectId}>
                        <SelectValue placeholder={copy.sidebar.selectOption} />
                      </SelectTrigger>
                      <SelectContent>
                        {options.map((o) => (
                          <SelectItem key={String(o.value)} value={String(o.value)}>
                            {String(o.label)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {schema.description && (
                      <FieldMessage>{schema.description}</FieldMessage>
                    )}
                  </div>
                );
              }

              // Number Sliders & Ranges
              const isNumber = schema.type === "int" || schema.type === "integer" || schema.type === "float" || schema.type === "number";
              const hasMinMax = schema.minValue !== undefined && schema.maxValue !== undefined;
              if (isNumber && hasMinMax) {
                const step = schema.step || (schema.type === "float" ? 0.05 : 1);
                const sliderId = `audio-range-${key}`;
                return (
                  <div key={key} className="space-y-3 rounded-md border border-line bg-well p-4">
                    <div className="flex items-center justify-between gap-3">
                      <Label htmlFor={sliderId} className="truncate">
                        {schema.title || key}
                      </Label>
                      <span className="text-mono shrink-0 rounded-sm border border-brand-line bg-brand-soft px-2 py-0.5 text-brand">
                        {params[key] !== undefined ? params[key] : schema.default}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-mono w-6 shrink-0 text-right text-ink-subtle">
                        {schema.minValue}
                      </span>
                      <input
                        id={sliderId}
                        type="range"
                        min={schema.minValue}
                        max={schema.maxValue}
                        step={step}
                        value={params[key] !== undefined ? params[key] : (schema.default || 0)}
                        onChange={(e) => setParams(prev => ({ ...prev, [key]: parseFloat(e.target.value) }))}
                        className="range min-w-0 flex-1"
                      />
                      <span className="text-mono w-6 shrink-0 text-left text-ink-subtle">
                        {schema.maxValue}
                      </span>
                    </div>
                    {schema.description && (
                      <FieldMessage>{schema.description}</FieldMessage>
                    )}
                  </div>
                );
              }

              // Prompt / Textarea Input
              if (key === "prompt") {
                const promptId = "audio-prompt";
                return (
                  <div key={key} className="space-y-2">
                    <Label htmlFor={promptId} className="uppercase tracking-wide">
                      {schema.title || copy.sidebar.lyricsPromptLabel}
                    </Label>
                    <Textarea
                      id={promptId}
                      rows={5}
                      value={params[key] || ""}
                      onChange={(e) => setParams(prev => ({ ...prev, [key]: e.target.value }))}
                      placeholder={schema.description || copy.sidebar.promptPlaceholder}
                    />
                    {schema.examples && Array.isArray(schema.examples) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {schema.examples.map((ex, idx) => (
                          <Button
                            key={idx}
                            variant="outline"
                            size="xs"
                            className="rounded-full"
                            onClick={() => setParams(prev => ({ ...prev, [key]: ex }))}
                          >
                            "{ex.slice(0, 35)}..."
                          </Button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              }

              // Standard Text / Input fields
              const fieldId = `audio-field-${key}`;
              return (
                <div key={key} className="space-y-2">
                  <Label htmlFor={fieldId} className="uppercase tracking-wide">
                    {schema.title || key}
                  </Label>
                  <Input
                    id={fieldId}
                    type={isNumber ? "number" : "text"}
                    value={params[key] !== undefined ? params[key] : ""}
                    placeholder={schema.placeholder || schema.description || copy.sidebar.fieldPlaceholder.replace('{field}', key)}
                    onChange={(e) => {
                      const val = isNumber ? (e.target.value === "" ? "" : parseFloat(e.target.value)) : e.target.value;
                      setParams(prev => ({ ...prev, [key]: val }));
                    }}
                  />
                  {schema.description && (
                    <FieldMessage>{schema.description}</FieldMessage>
                  )}
                </div>
              );
            })}
          </div>

        </div>

        {/* Generate bar. Solid rather than translucent: it floats over a
           scrolling column of controls and must stay legible. */}
        <div className="absolute bottom-0 left-0 z-sticky w-full border-t border-line bg-base p-4 lg:w-panel">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={handleGenerate}
            disabled={!selectedModel}
            loading={isGenerating}
          >
            {isGenerating ? (
              <span>{copy.generate.generating}</span>
            ) : (
              <>
                <Play size={16} strokeWidth={2} fill="currentColor" aria-hidden="true" />
                <span>{copy.generate.cta}</span>
              </>
            )}
          </Button>
        </div>
      </div>
      {/* ─── RIGHT CONTENT AREA ─── */}
      <div className="relative flex min-w-0 flex-1 flex-col lg:h-full">
        
        {/* Main Display panel */}
        <div className="flex flex-1 flex-col justify-between p-6 lg:overflow-y-auto lg:p-10">
          
          <div className="mb-8 flex min-h-96 flex-1 items-center justify-center">
            
            {/* 1. Error Display */}
            {generateError && (
              <Alert
                className="w-full max-w-md"
                tone="danger"
                icon={<AlertCircle size={18} strokeWidth={1.8} aria-hidden="true" />}
                title={copy.result.errorHeading}
              >
                {generateError}
              </Alert>
            )}

            {/* 2. Generating / Loading View */}
            {isGenerating && !generateError && (
              <div
                className="animate-fade-in flex flex-col items-center gap-5 text-center"
                role="status"
                aria-live="polite"
              >
                <div className="relative size-16">
                  <div
                    aria-hidden="true"
                    className="size-16 animate-spin rounded-full border-2 border-line border-t-brand"
                  />
                  <Music
                    className="absolute inset-0 m-auto size-6 text-brand"
                    strokeWidth={1.8}
                    aria-hidden="true"
                  />
                </div>
                <div className="space-y-1">
                  <div className="text-label font-medium uppercase tracking-widest text-brand">
                    {copy.result.loadingHeading}
                  </div>
                  <div className="text-body-sm text-ink-muted">
                    {copy.result.loadingSubtext}
                  </div>
                </div>
              </div>
            )}

            {/* 3. Empty State (no audio, not loading, no error) */}
            {view === "input" && !isGenerating && !generateError && (
              <EmptyState
                className="animate-fade-in max-w-md rounded-xl border border-line bg-surface shadow-elevation-1"
                description={copy.result.emptyBody}
                icon={<Music size={22} strokeWidth={1.8} aria-hidden="true" />}
                size="lg"
                title={copy.result.emptyHeading}
              />
            )}

            {/* 4. Active Result Player Display */}
            {view === "result" && activeResultUrl && !isGenerating && !generateError && (
              <div className="animate-fade-in w-full max-w-2xl space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 px-1">
                  <Button className="rounded-full" onClick={handleNew} size="sm" variant="secondary">
                    <ArrowLeft className="size-3.5" strokeWidth={2} aria-hidden="true" />
                    {copy.result.newGeneration}
                  </Button>
                  <Badge size="md" tone="success">
                    <span className="size-1.5 rounded-full bg-success" aria-hidden="true" />
                    {copy.result.success}
                  </Badge>
                </div>
                <PremiumAudioPlayer url={activeResultUrl} title={activeResultTitle} copy={copy} />
              </div>
            )}

          </div>

          {/* ─── BOTTOM HISTORY FOOTER ─── */}
          {history.length > 0 && (
            <div className="animate-fade-in w-full border-t border-line pt-6">
              <h4 className="text-label mb-4 uppercase tracking-wide text-ink-muted">
                {copy.history.heading.replace('{count}', history.length)}
              </h4>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {history.map((entry, idx) => {
                  const isSelected = view === "result" && activeResultUrl === entry.url;
                  // A real button, not a clickable div: history entries have to
                  // be reachable with Tab and activatable with Enter.
                  return (
                    <button
                      key={entry.id || idx}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => handleSelectHistory(entry, idx)}
                      type="button"
                      className={cn(
                        CARD_BASE,
                        isSelected
                          ? CARD_SURFACE.selected
                          : cn(CARD_SURFACE.default, CARD_INTERACTIVE),
                        "flex h-28 flex-col items-stretch justify-between gap-2 p-3.5 text-left",
                      )}
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "flex size-8 shrink-0 items-center justify-center rounded-sm",
                            isSelected ? "bg-brand-line text-brand" : "bg-wash text-ink-muted",
                          )}
                        >
                          <Volume2 className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                        </span>
                        <span
                          className={cn(
                            "text-label min-w-0 truncate font-medium uppercase tracking-wide",
                            isSelected ? "text-brand" : "text-ink-muted",
                          )}
                        >
                          {entry.model ? entry.model.split('-').slice(0, 2).join(' ') : copy.history.fallbackModel}
                        </span>
                      </div>
                      <p className="text-caption line-clamp-2 font-medium text-ink">
                        {entry.title || entry.prompt || copy.history.untitled}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

        </div>

      </div>
      <ToastHost />
    </div>
  );
}
