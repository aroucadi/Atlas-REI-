'use client';

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
} from 'react';

// --- Shared context -----------------------------------------------------------

interface LineageContextValue {
  activeSpanId: string | null;
  setActiveSpan: (spanId: string | null) => void;
  registerPageRef: (page: number, el: HTMLElement | null) => void;
  scrollToPage: (page: number) => void;
}

const LineageContext = createContext<LineageContextValue | null>(null);

export function LineageProvider({ children }: { children: ReactNode }) {
  const [activeSpanId, setActiveSpanId] = useState<string | null>(null);
  const pageRefs = useRef<Map<number, HTMLElement>>(new Map());

  const registerPageRef = useCallback((page: number, el: HTMLElement | null) => {
    if (el) pageRefs.current.set(page, el);
    else pageRefs.current.delete(page);
  }, []);

  const scrollToPage = useCallback((page: number) => {
    pageRefs.current.get(page)?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
  }, []);

  const setActiveSpan = useCallback((spanId: string | null) => {
    setActiveSpanId(spanId);
  }, []);

  return (
    <LineageContext.Provider
      value={{ activeSpanId, setActiveSpan, registerPageRef, scrollToPage }}
    >
      {children}
    </LineageContext.Provider>
  );
}

export function useLineage() {
  const ctx = useContext(LineageContext);
  if (!ctx) throw new Error('useLineage must be used within LineageProvider');
  return ctx;
}

// --- Field panel side ------------------------------------------------------------

export interface SourceSpan {
  id: string;
  page: number;
  bbox: { x: number; y: number; width: number; height: number };
  byteStart: number;
  byteEnd: number;
  snippet: string;
}

interface CitableFieldProps {
  label: string;
  value: string | number | null;
  span: SourceSpan | null;
  children?: ReactNode;
}

export function CitableField({ label, value, span }: CitableFieldProps) {
  const { activeSpanId, setActiveSpan, scrollToPage } = useLineage();
  const isActive = span && activeSpanId === span.id;

  const handleClick = () => {
    if (!span) return;
    setActiveSpan(span.id);
    scrollToPage(span.page);
  };

  return (
    <div
      onClick={handleClick}
      className={`flex items-center justify-between rounded px-2 py-1 text-sm transition-colors
        ${span ? 'cursor-pointer hover:bg-blue-50' : 'cursor-default text-slate-400'}
        ${isActive ? 'bg-blue-100 ring-1 ring-blue-400' : ''}`}
      title={span ? `Source: page ${span.page} — "${span.snippet}"` : 'No source located'}
    >
      <span className="text-slate-500">{label}</span>
      <span className="font-medium text-slate-900">{value ?? '—'}</span>
    </div>
  );
}

// --- Preview panel side ------------------------------------------------------

interface PdfPageWithOverlaysProps {
  page: number;
  pageWidthPx: number;
  pageHeightPx: number;
  spans: SourceSpan[];
  children: ReactNode;
}

export function PdfPageWithOverlays({
  page,
  pageWidthPx,
  pageHeightPx,
  spans,
  children,
}: PdfPageWithOverlaysProps) {
  const { activeSpanId, setActiveSpan, registerPageRef } = useLineage();

  return (
    <div
      ref={(el) => registerPageRef(page, el)}
      className="relative"
      style={{ width: pageWidthPx || '100%', height: pageHeightPx || 'auto' }}
    >
      {children}

      {spans.map((span) => {
        const isActive = activeSpanId === span.id;
        // Bounding box calculations relative to pageWidthPx/pageHeightPx
        const x = (span.bbox?.x || 0) * pageWidthPx;
        const y = (span.bbox?.y || 0) * pageHeightPx;
        const width = (span.bbox?.width || 0) * pageWidthPx;
        const height = (span.bbox?.height || 0) * pageHeightPx;

        return (
          <div
            key={span.id}
            onClick={() => setActiveSpan(span.id)}
            className={`absolute cursor-pointer rounded-sm transition-all
              ${isActive
                ? 'border-2 border-blue-500 bg-blue-400/25'
                : 'border border-transparent bg-transparent hover:bg-blue-400/10'}`}
            style={{
              left: x,
              top: y,
              width: width,
              height: height,
            }}
            title={span.snippet}
          />
        );
      })}
    </div>
  );
}
