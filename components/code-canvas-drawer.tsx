'use client';

import React, { useState, useMemo } from 'react';
import {
  X,
  Play,
  Code2,
  Eye,
  RotateCw,
  Download,
  Maximize2,
  Minimize2,
  Smartphone,
  Tablet,
  Monitor,
  Copy,
  Check,
  ArrowUp,
  Loader2,
  Sparkles,
  Pencil,
  GitCompare,
} from 'lucide-react';
import { HighlightedCode } from '@/lib/syntax-highlighter';
import {
  PatchHunk,
  formatHunksAsUnifiedDiff,
} from '@/lib/code-patcher';

export interface CanvasArtifact {
  id: string;
  messageId: string;
  title: string;
  language: string;
  code: string;
  combinedHtml?: string;
  combinedCss?: string;
  combinedJs?: string;
  lastPatchHunks?: PatchHunk[];
}

interface CodeCanvasDrawerProps {
  artifact: CanvasArtifact | null;
  onClose: () => void;
  onRequestAiEdit?: (currentCode: string, language: string, instruction: string) => void;
  isStreaming?: boolean;
}

export function isPreviewableLanguage(lang: string, code: string): boolean {
  const normalized = (lang || '').toLowerCase().trim();
  if (
    [
      'html',
      'htm',
      'svg',
      'xml',
      'jsx',
      'tsx',
      'react',
      'mermaid',
      'css',
      'js',
      'javascript',
    ].includes(normalized)
  ) {
    return true;
  }
  // Also detect raw HTML or SVG even if language tag is omitted
  const trimmed = code.trim();
  if (
    trimmed.startsWith('<!DOCTYPE html') ||
    trimmed.startsWith('<html') ||
    trimmed.startsWith('<svg') ||
    (trimmed.startsWith('<div') && trimmed.includes('</'))
  ) {
    return true;
  }
  return false;
}

function buildSandboxSrcDoc(
  language: string,
  code: string,
  extraCss?: string,
  extraJs?: string
): string {
  const lang = (language || '').toLowerCase().trim();
  const trimmed = code.trim();

  const commonHead = `
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Vazirmatn:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  body {
    font-family: 'Vazirmatn', 'Inter', system-ui, -apple-system, sans-serif;
    margin: 0;
    padding: 0;
  }
  ${extraCss || ''}
</style>
`;

  // 1. Mermaid diagram
  if (lang === 'mermaid') {
    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  ${commonHead}
  <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
</head>
<body class="min-h-screen bg-zinc-50 text-zinc-900 flex items-center justify-center p-6">
  <div class="mermaid w-full flex justify-center">${trimmed}</div>
  <script>
    mermaid.initialize({ startOnLoad: true, theme: 'default', securityLevel: 'loose' });
  </script>
</body>
</html>`;
  }

  // 2. SVG
  if (lang === 'svg' || trimmed.startsWith('<svg')) {
    return `<!DOCTYPE html>
<html lang="fa">
<head>${commonHead}</head>
<body class="min-h-screen bg-zinc-50 flex items-center justify-center p-6">
  <div class="max-w-full max-h-full flex items-center justify-center">
    ${trimmed}
  </div>
</body>
</html>`;
  }

  // 3. React / JSX / TSX
  if (
    lang === 'jsx' ||
    lang === 'tsx' ||
    lang === 'react' ||
    ((lang === 'js' || lang === 'javascript') &&
      (trimmed.includes('import React') ||
        trimmed.includes('useState') ||
        trimmed.includes('export default function')))
  ) {
    // Strip ES module imports and prepare default export for Babel in-browser execution
    let cleanedCode = trimmed
      .replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?/g, '')
      .replace(/export\s+default\s+function\s+([A-Za-z0-9_]+)/g, 'function $1')
      .replace(/export\s+default\s+/g, 'const __DefaultExport__ = ');

    const fnMatch =
      trimmed.match(/export\s+default\s+function\s+([A-Za-z0-9_]+)/) ||
      trimmed.match(/function\s+([A-Z][A-Za-z0-9_]*)\s*\(/) ||
      trimmed.match(/const\s+([A-Z][A-Za-z0-9_]*)\s*=/);
    const rootComponentName = trimmed.includes('__DefaultExport__')
      ? '__DefaultExport__'
      : fnMatch
      ? fnMatch[1]
      : 'App';

    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  ${commonHead}
  <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
</head>
<body class="min-h-screen bg-white text-zinc-900">
  <div id="root"></div>
  <script type="text/babel" data-presets="react,typescript">
    const { useState, useEffect, useRef, useMemo, useCallback, useReducer, createContext, useContext } = React;
    try {
      ${cleanedCode}
      const RootComp = typeof ${rootComponentName} !== 'undefined' ? ${rootComponentName} : () => <div className="p-6 text-sm text-zinc-500">کامپوننت آماده نمایش است.</div>;
      const root = ReactDOM.createRoot(document.getElementById('root'));
      root.render(<RootComp />);
    } catch (err) {
      document.getElementById('root').innerHTML = '<pre style="direction:ltr;color:#ef4444;padding:16px;font-size:13px;">' + (err && err.message ? err.message : String(err)) + '</pre>';
    }
  </script>
</body>
</html>`;
  }

  // 4. Pure JavaScript (Console & DOM Sandbox)
  if (lang === 'js' || lang === 'javascript') {
    return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>${commonHead}</head>
<body class="min-h-screen bg-zinc-950 text-zinc-100 p-5 font-mono">
  <div id="app" class="mb-4 font-sans"></div>
  <div class="rounded-2xl border border-zinc-800 bg-zinc-900/90 overflow-hidden" dir="ltr">
    <div class="px-4 py-2 border-b border-zinc-800 text-xs text-zinc-400 flex items-center justify-between">
      <span>JavaScript Output / Console</span>
    </div>
    <pre id="console-out" class="p-4 text-xs leading-relaxed text-emerald-400 whitespace-pre-wrap"></pre>
  </div>
  <script>
    const outEl = document.getElementById('console-out');
    const writeLine = (prefix, args) => {
      const text = args.map(a => typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a)).join(' ');
      outEl.textContent += (prefix ? prefix + ' ' : '') + text + '\\n';
    };
    console.log = (...args) => writeLine('›', args);
    console.info = (...args) => writeLine('ℹ', args);
    console.warn = (...args) => writeLine('⚠', args);
    console.error = (...args) => writeLine('✖', args);
    try {
      const result = eval(${JSON.stringify(trimmed)});
      if (result !== undefined && outEl.textContent === '') {
        writeLine('←', [result]);
      }
    } catch (e) {
      writeLine('✖ Error:', [e.message || String(e)]);
    }
  </script>
</body>
</html>`;
  }

  // 5. HTML (Full document or snippet, optionally combined with CSS/JS blocks)
  if (trimmed.toLowerCase().includes('<html') || trimmed.toLowerCase().includes('<!doctype')) {
    let doc = trimmed;
    if (!doc.includes('cdn.tailwindcss.com')) {
      doc = doc.replace(/<head[^>]*>/i, (m) => `${m}\n${commonHead}`);
    } else if (extraCss) {
      doc = doc.replace(/<\/head>/i, `<style>${extraCss}</style>\n</head>`);
    }
    if (extraJs) {
      doc = doc.replace(/<\/body>/i, `<script>\n${extraJs}\n</script>\n</body>`);
    }
    return doc;
  }

  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>${commonHead}</head>
<body class="min-h-screen bg-white text-zinc-900">
  ${trimmed}
  ${extraJs ? `<script>\n${extraJs}\n</script>` : ''}
</body>
</html>`;
}

export function CodeCanvasDrawer({
  artifact,
  onClose,
  onRequestAiEdit,
  isStreaming = false,
}: CodeCanvasDrawerProps) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diff'>('preview');
  const [isEditingCode, setIsEditingCode] = useState<boolean>(false);
  const [viewport, setViewport] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [refreshKey, setRefreshKey] = useState<number>(0);
  const [copied, setCopied] = useState<boolean>(false);
  const [editInstruction, setEditInstruction] = useState<string>('');
  const [customCodeByArtifactId, setCustomCodeByArtifactId] = useState<
    Record<string, string>
  >({});

  const effectiveCode = artifact
    ? (customCodeByArtifactId[artifact.id] ?? artifact.code)
    : '';

  const srcDoc = useMemo(() => {
    if (!artifact) return '';
    return buildSandboxSrcDoc(
      artifact.language,
      effectiveCode,
      artifact.combinedCss,
      artifact.combinedJs
    );
  }, [artifact, effectiveCode]);

  if (!artifact) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(effectiveCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const ext =
      artifact.language === 'svg'
        ? 'svg'
        : artifact.language === 'jsx' || artifact.language === 'tsx'
        ? artifact.language
        : 'html';
    const content = ext === 'html' ? srcDoc : effectiveCode;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chatty-patty-canvas.${ext}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSubmitEdit = () => {
    const trimmed = editInstruction.trim();
    if (!trimmed || !onRequestAiEdit || isStreaming) return;
    setEditInstruction('');
    onRequestAiEdit(effectiveCode, artifact.language, trimmed);
  };

  const viewportWidthClass =
    viewport === 'mobile'
      ? 'w-[390px] max-w-full h-[94%] rounded-3xl shadow-xl border border-zinc-300 dark:border-zinc-700'
      : viewport === 'tablet'
      ? 'w-[768px] max-w-full h-[96%] rounded-2xl shadow-lg border border-zinc-300 dark:border-zinc-700'
      : 'w-full h-full';

  return (
    <aside
      aria-label="بوم پیش‌نمایش زنده کد"
      className={`${
        isFullscreen
          ? 'fixed inset-0 z-50 w-full h-dvh'
          : 'fixed inset-0 z-40 lg:static lg:z-20 w-full lg:w-[50%] xl:w-[54%] h-dvh border-r border-zinc-200 dark:border-zinc-800 shrink-0'
      } bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 flex flex-col transition-all`}
    >
      {/* Minimalist Top Bar */}
      <div className="h-14 px-3.5 sm:px-5 border-b border-zinc-200/80 dark:border-zinc-800/80 bg-white/90 dark:bg-zinc-900/90 backdrop-blur-md flex items-center justify-between gap-2 shrink-0">
        {/* Right side in RTL: Title & Preview/Code Toggle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="inline-flex items-center p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/70">
            <button
              type="button"
              onClick={() => setActiveTab('preview')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span>پیش‌نمایش زنده</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('code')}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-2xs'
                  : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>سورس کد</span>
            </button>
            {artifact.lastPatchHunks && artifact.lastPatchHunks.length > 0 && (
              <button
                type="button"
                onClick={() => setActiveTab('diff')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer ${
                  activeTab === 'diff'
                    ? 'bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 font-semibold shadow-2xs'
                    : 'text-emerald-600 dark:text-emerald-400 hover:text-zinc-900 dark:hover:text-zinc-100'
                }`}
              >
                <GitCompare className="w-3.5 h-3.5" />
                <span>پچ اعمال‌شده</span>
              </button>
            )}
          </div>

          <span
            dir="ltr"
            className="hidden sm:inline-block text-xs font-mono text-zinc-400 dark:text-zinc-500 truncate max-w-[140px]"
          >
            {artifact.title || artifact.language || 'canvas'}
          </span>
        </div>

        {/* Left side in RTL: Viewport & Action Controls */}
        <div className="flex items-center gap-1 shrink-0">
          {activeTab === 'preview' && (
            <div className="hidden sm:flex items-center p-0.5 rounded-xl bg-zinc-100 dark:bg-zinc-800 border border-zinc-200/70 dark:border-zinc-700/70 ml-1">
              <button
                type="button"
                onClick={() => setViewport('desktop')}
                title="نمای دسکتاپ"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewport === 'desktop'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('tablet')}
                title="نمای تبلت"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewport === 'tablet'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <Tablet className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setViewport('mobile')}
                title="نمای موبایل"
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  viewport === 'mobile'
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 shadow-2xs'
                    : 'text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <button
            type="button"
            onClick={() => setRefreshKey((k) => k + 1)}
            title="اجرای مجدد پیش‌نمایش"
            aria-label="اجرای مجدد پیش‌نمایش"
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleCopy}
            title="کپی کد"
            aria-label="کپی کد"
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-4 h-4 text-emerald-500" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={handleDownload}
            title="دانلود فایل"
            aria-label="دانلود فایل"
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setIsFullscreen((f) => !f)}
            title={isFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
            aria-label={isFullscreen ? 'خروج از تمام‌صفحه' : 'تمام‌صفحه'}
            className="p-2 rounded-xl text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            {isFullscreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )}
          </button>

          <button
            type="button"
            onClick={onClose}
            title="بستن بوم پیش‌نمایش"
            aria-label="بستن بوم پیش‌نمایش"
            className="p-2 rounded-xl text-zinc-500 hover:text-red-500 hover:bg-zinc-200/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content Area: Live Sandboxed Iframe or Live Editable Code */}
      <div className="flex-1 min-h-0 relative bg-zinc-100 dark:bg-zinc-900/60 flex items-center justify-center overflow-hidden">
        {activeTab === 'preview' ? (
          <iframe
            key={`${artifact.id}-${refreshKey}`}
            title="پیش‌نمایش زنده کد"
            srcDoc={srcDoc}
            sandbox="allow-scripts allow-modals allow-forms"
            className={`bg-white transition-all duration-200 ${viewportWidthClass}`}
          />
        ) : activeTab === 'diff' &&
          artifact.lastPatchHunks &&
          artifact.lastPatchHunks.length > 0 ? (
          <div dir="ltr" className="w-full h-full flex flex-col bg-[#0d1117] text-zinc-100">
            <div className="px-4 py-2 bg-[#161b22] border-b border-zinc-800/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <div dir="rtl" className="font-sans flex items-center gap-2">
                <span className="text-zinc-200 font-medium">
                  جزئیات پچ اعمال‌شده روی کد اصلی
                </span>
                <span
                  dir="ltr"
                  className="px-1.5 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 font-mono text-[11px]"
                >
                  +
                  {artifact.lastPatchHunks.reduce(
                    (acc, h) => acc + h.addedLines,
                    0
                  )}
                </span>
                <span
                  dir="ltr"
                  className="px-1.5 py-0.5 rounded-md bg-rose-500/15 text-rose-400 font-mono text-[11px]"
                >
                  −
                  {artifact.lastPatchHunks.reduce(
                    (acc, h) => acc + h.removedLines,
                    0
                  )}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('preview')}
                className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-medium flex items-center gap-1.5 cursor-pointer"
              >
                <Play className="w-3 h-3 fill-current" />
                <span dir="rtl" className="font-sans">
                  مشاهده خروجی پچ‌شده
                </span>
              </button>
            </div>
            <div className="flex-1 w-full p-4 overflow-auto">
              <HighlightedCode
                code={formatHunksAsUnifiedDiff(artifact.lastPatchHunks)}
                language="diff"
              />
            </div>
          </div>
        ) : (
          <div dir="ltr" className="w-full h-full flex flex-col bg-[#0d1117] text-zinc-100">
            <div className="px-4 py-2 bg-[#161b22] border-b border-zinc-800/90 flex items-center justify-between text-xs text-zinc-400 shrink-0">
              <span dir="rtl" className="font-sans">
                {isEditingCode
                  ? 'حالت ویرایش دستی فعال است'
                  : 'نمایش رنگی سورس کد کامل'}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsEditingCode((v) => !v)}
                  className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 flex items-center gap-1.5 cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  <span dir="rtl" className="font-sans">
                    {isEditingCode ? 'نمایش رنگی' : 'ویرایش کد'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('preview')}
                  className="px-2.5 py-1 rounded-lg bg-zinc-100 hover:bg-white text-zinc-900 font-medium flex items-center gap-1.5 cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span dir="rtl" className="font-sans">
                    مشاهده خروجی
                  </span>
                </button>
              </div>
            </div>
            {isEditingCode ? (
              <textarea
                value={effectiveCode}
                onChange={(e) =>
                  setCustomCodeByArtifactId((prev) => ({
                    ...prev,
                    [artifact.id]: e.target.value,
                  }))
                }
                spellCheck={false}
                className="flex-1 w-full p-4 bg-[#0d1117] text-zinc-100 font-mono text-xs sm:text-[13px] leading-6 focus:outline-none resize-none"
              />
            ) : (
              <div className="flex-1 w-full p-4 overflow-auto">
                <HighlightedCode code={effectiveCode} language={artifact.language} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom AI Canvas Edit Prompt Bar */}
      {onRequestAiEdit && (
        <div className="p-3 bg-white dark:bg-zinc-900 border-t border-zinc-200/80 dark:border-zinc-800/80 shrink-0">
          <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 dark:bg-zinc-800/90 border border-zinc-200/80 dark:border-zinc-700/80 px-3 py-1.5">
            <Sparkles className="w-4 h-4 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={editInstruction}
              onChange={(e) => setEditInstruction(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleSubmitEdit();
                }
              }}
              disabled={isStreaming}
              placeholder={
                isStreaming
                  ? 'در حال ساخت و اعمال پچ هوشمند روی کد...'
                  : 'بخش مورد نظر برای تغییر را بنویسید (پچ هوشمند بدون بازنویسی کل کد)...'
              }
              className="flex-1 bg-transparent text-xs sm:text-sm text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-none py-1.5"
            />
            <button
              type="button"
              onClick={handleSubmitEdit}
              disabled={isStreaming || !editInstruction.trim()}
              aria-label="اعمال تغییر با هوش مصنوعی"
              className="w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 disabled:opacity-40 flex items-center justify-center transition-opacity cursor-pointer shrink-0"
            >
              {isStreaming ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <ArrowUp className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}
