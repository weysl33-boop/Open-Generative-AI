'use client';

import { useState } from 'react';
import { AudioLines, Clapperboard, Image as ImageIcon, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

const PRESET_TAGS = ['赛博朋克', '动漫二次元', '超写实', '电影光影', '概念设计', '国风古韵', '未来科技', '复古胶片', '治愈系', '史诗大片', '迷幻电子', '超高清壁纸'];

export default function ShareToCommunityModal({ creation, onClose, onSuccess }) {
  const source = creation || {};
  const id = String(source.studio_id || source.studioId || '').toLowerCase();
  const type = id.includes('video') || id.includes('motion') || id.includes('cinema') || id.includes('lip') ? 'video' : id.includes('audio') || id.includes('music') || id.includes('sound') ? 'audio' : 'image';
  const TypeIcon = type === 'video' ? Clapperboard : type === 'audio' ? AudioLines : ImageIcon;
  const metadata = typeof source.metadata_json === 'object' ? (source.metadata_json || {}) : {};
  const prompt = source.label || metadata.prompt || '';
  const [title, setTitle] = useState(source.label ? source.label.slice(0, 40) : '我的 AI 创意作品');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState(['超写实']);
  const [customTag, setCustomTag] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  if (!creation) return null;
  const toggleTag = (tag) => setTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : current.length < 6 ? [...current, tag] : current);
  const addCustomTag = (event) => { if (event.key !== 'Enter') return; event.preventDefault(); const value = customTag.trim(); if (value && !tags.includes(value) && tags.length < 6) { setTags((current) => [...current, value]); setCustomTag(''); } };
  const submit = async (event) => { event.preventDefault(); setError(''); setSubmitting(true); try { const response = await fetch('/api/community/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ creationId: creation.id, title: title.trim(), description: description.trim(), mediaType: type, mediaUrl: creation.result_url || creation.resultUrl, coverUrl: creation.result_url || creation.resultUrl, prompt, modelName: source.model || metadata.model || '', parameters: metadata, tags }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error || '发布失败，请稍后重试'); onSuccess?.(data.post); onClose?.(); } catch (submitError) { setError(submitError.message); } finally { setSubmitting(false); } };
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur-xl" onClick={onClose}><Card className="relative max-h-[90vh] w-full max-w-xl overflow-y-auto border-border bg-card shadow-elevation-4" onClick={(event) => event.stopPropagation()}><Button type="button" variant="ghost" size="icon" className="absolute right-4 top-4" onClick={onClose} aria-label="关闭"><X /></Button><CardHeader className="p-6"><Badge variant="outline" className="w-fit border-primary/30 bg-primary/10 text-primary">社区展示</Badge><CardTitle className="mt-3 text-xl">分享作品到社区</CardTitle></CardHeader><CardContent className="p-6 pt-0"><div className="flex items-center gap-3 rounded-xl border border-border/70 bg-muted/50 p-3"><div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background text-primary">{type === 'video' ? <video src={source.result_url || source.resultUrl} muted className="size-full object-cover" /> : type === 'audio' ? <AudioLines /> : <img src={source.result_url || source.resultUrl} alt="作品预览" className="size-full object-cover" />}</div><div className="min-w-0"><p className="flex items-center gap-2 text-xs font-medium text-primary"><TypeIcon />{type === 'video' ? 'AI 视频作品' : type === 'audio' ? 'AI 音乐作品' : 'AI 图像作品'}</p><p className="mt-1 truncate text-xs text-muted-foreground">{prompt || '未指定提示词'}</p></div></div>{error && <div role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</div>}<form onSubmit={submit} className="mt-5 flex flex-col gap-4"><label className="flex flex-col gap-2 text-sm font-medium">作品标题<Input required maxLength={60} value={title} onChange={(event) => setTitle(event.target.value)} placeholder="给作品起一个标题" /></label><label className="flex flex-col gap-2 text-sm font-medium">创作描述（选填）<Textarea rows={3} maxLength={300} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="分享灵感来源、构图技巧或参数心得" /></label><div><div className="mb-2 flex items-center justify-between text-sm font-medium"><span>精选标签</span><span className="text-xs text-muted-foreground">{tags.length}/6</span></div><div className="flex flex-wrap gap-2">{PRESET_TAGS.map((tag) => <Button key={tag} type="button" size="xs" variant={tags.includes(tag) ? 'default' : 'secondary'} onClick={() => toggleTag(tag)}>#{tag}</Button>)}</div><Input className="mt-3" value={customTag} onChange={(event) => setCustomTag(event.target.value)} onKeyDown={addCustomTag} placeholder="输入后按 Enter 添加自定义标签" /></div><div className="flex justify-end gap-2 border-t border-border/70 pt-4"><Button type="button" variant="outline" onClick={onClose} disabled={submitting}>取消</Button><Button type="submit" disabled={submitting}>{submitting ? '正在发布…' : '立即公开发布'}<Send data-icon="inline-end" /></Button></div></form></CardContent></Card></div>;
}
