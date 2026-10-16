'use client';
import React, { useEffect, useRef, useState } from 'react';
import { sheetThumbnails } from './thumbnail-client';
import type { ThumbnailLease } from './thumbnail-cache';

export function SheetThumbnail({ id, alt }: { id: string; alt: string }) {
  const host = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false), [url, setUrl] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    if (!host.current) return;
    const observer = new IntersectionObserver(entries => setVisible(entries.some(entry => entry.isIntersecting)), { rootMargin: '160px' });
    observer.observe(host.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    setUrl(''); setError(''); if (!visible) return;
    let alive = true, sequence = 0;
    let lease: ThumbnailLease;
    try { lease = sheetThumbnails.acquire(id); } catch (cause) { setError(cause instanceof Error ? cause.message : '缩略图读取失败'); return; }
    const read = () => { const request = ++sequence; setError(''); void lease.get().then(value => { if (alive && request === sequence) setUrl(value); }, cause => { if (alive && request === sequence) setError(cause instanceof Error ? cause.message : '缩略图读取失败'); }); };
    const unsubscribe = sheetThumbnails.subscribe(ids => { if (ids.has(id)) read(); }); read();
    return () => { alive = false; unsubscribe(); lease.release(); };
  }, [id, visible]);
  return <span ref={host} style={{ display: 'block', minHeight: 80 }}>{url ? <img src={url} alt={alt} /> : <span role={error ? 'status' : undefined}>{error || '照片预览'}</span>}</span>;
}
