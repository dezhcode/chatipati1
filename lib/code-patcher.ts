export interface PatchHunk {
  search: string;
  replace: string;
  addedLines: number;
  removedLines: number;
  applied: boolean;
}

export interface PatchApplyResult {
  patchedCode: string;
  hunks: PatchHunk[];
  appliedCount: number;
  totalAddedLines: number;
  totalRemovedLines: number;
  isPatchResponse: boolean;
}

/**
 * Extracts SEARCH/REPLACE patch blocks from AI markdown output.
 * Format:
 * <<<<<<< SEARCH
 * ...original lines...
 * =======
 * ...replacement lines...
 * >>>>>>> REPLACE
 */
export function extractSearchReplaceHunks(rawText: string): Array<{
  search: string;
  replace: string;
}> {
  const results: Array<{ search: string; replace: string }> = [];
  const regex =
    /<<<<<<+\s*SEARCH[ \t]*\r?\n([\s\S]*?)\r?\n=======+[ \t]*\r?\n([\s\S]*?)\r?\n>>>>>>+\s*REPLACE/gi;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(rawText)) !== null) {
    results.push({
      search: match[1],
      replace: match[2],
    });
  }
  return results;
}

/**
 * Applies a single search->replace hunk onto source code.
 * Supports exact substring match first, then line-trimmed fuzzy match.
 */
function applySingleHunk(
  source: string,
  search: string,
  replace: string
): { nextSource: string; applied: boolean } {
  if (!search.trim()) {
    return { nextSource: source, applied: false };
  }

  // 1. Exact match
  const exactIdx = source.indexOf(search);
  if (exactIdx !== -1) {
    const nextSource =
      source.slice(0, exactIdx) + replace + source.slice(exactIdx + search.length);
    return { nextSource, applied: true };
  }

  // 2. Normalized CRLF -> LF match
  const normSource = source.replace(/\r\n/g, '\n');
  const normSearch = search.replace(/\r\n/g, '\n');
  const normReplace = replace.replace(/\r\n/g, '\n');
  const normIdx = normSource.indexOf(normSearch);
  if (normIdx !== -1) {
    const nextSource =
      normSource.slice(0, normIdx) +
      normReplace +
      normSource.slice(normIdx + normSearch.length);
    return { nextSource, applied: true };
  }

  // 3. Line-by-line trimmed fuzzy match (handles slight indentation differences)
  const sourceLines = normSource.split('\n');
  const searchLines = normSearch.split('\n');

  // Strip leading/trailing empty lines in search block if needed
  while (searchLines.length > 0 && searchLines[0].trim() === '') {
    searchLines.shift();
  }
  while (
    searchLines.length > 0 &&
    searchLines[searchLines.length - 1].trim() === ''
  ) {
    searchLines.pop();
  }

  if (searchLines.length === 0) {
    return { nextSource: source, applied: false };
  }

  for (let i = 0; i <= sourceLines.length - searchLines.length; i++) {
    let matches = true;
    for (let j = 0; j < searchLines.length; j++) {
      if (sourceLines[i + j].trim() !== searchLines[j].trim()) {
        matches = false;
        break;
      }
    }
    if (matches) {
      const before = sourceLines.slice(0, i);
      const after = sourceLines.slice(i + searchLines.length);
      const nextSource = [...before, normReplace, ...after].join('\n');
      return { nextSource, applied: true };
    }
  }

  return { nextSource: source, applied: false };
}

/**
 * Applies AI response (either SEARCH/REPLACE patch hunks or a full code block fallback)
 * onto the original code.
 */
export function applyAiPatchOrCode(
  originalCode: string,
  aiResponseText: string
): PatchApplyResult {
  const rawHunks = extractSearchReplaceHunks(aiResponseText);

  if (rawHunks.length > 0) {
    let workingCode = originalCode;
    const processedHunks: PatchHunk[] = [];
    let appliedCount = 0;
    let totalAdded = 0;
    let totalRemoved = 0;

    for (const h of rawHunks) {
      const removedLines = h.search ? h.search.split('\n').length : 0;
      const addedLines = h.replace ? h.replace.split('\n').length : 0;
      const { nextSource, applied } = applySingleHunk(
        workingCode,
        h.search,
        h.replace
      );
      if (applied) {
        workingCode = nextSource;
        appliedCount++;
        totalAdded += addedLines;
        totalRemoved += removedLines;
      }
      processedHunks.push({
        search: h.search,
        replace: h.replace,
        addedLines,
        removedLines,
        applied,
      });
    }

    return {
      patchedCode: workingCode,
      hunks: processedHunks,
      appliedCount,
      totalAddedLines: totalAdded,
      totalRemovedLines: totalRemoved,
      isPatchResponse: true,
    };
  }

  // Fallback: if the AI returned a standard code block instead of SEARCH/REPLACE hunks
  const blockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  let extractedCode = '';
  while ((match = blockRegex.exec(aiResponseText)) !== null) {
    const lang = (match[1] || '').toLowerCase();
    if (lang !== 'diff' && lang !== 'patch') {
      extractedCode = (match[2] || '').trim();
      break;
    }
  }

  if (extractedCode && extractedCode !== originalCode.trim()) {
    const oldLines = originalCode.split('\n').length;
    const newLines = extractedCode.split('\n').length;
    return {
      patchedCode: extractedCode,
      hunks: [
        {
          search: originalCode,
          replace: extractedCode,
          addedLines: newLines,
          removedLines: oldLines,
          applied: true,
        },
      ],
      appliedCount: 1,
      totalAddedLines: newLines,
      totalRemovedLines: oldLines,
      isPatchResponse: false,
    };
  }

  return {
    patchedCode: originalCode,
    hunks: [],
    appliedCount: 0,
    totalAddedLines: 0,
    totalRemovedLines: 0,
    isPatchResponse: false,
  };
}

/**
 * Formats SEARCH/REPLACE hunks into a clean unified-diff style string (`-` / `+` lines)
 * for visual display inside the CodeBlock / Diff viewer.
 */
export function formatHunksAsUnifiedDiff(
  hunks: Array<{ search: string; replace: string }>
): string {
  return hunks
    .map((h, idx) => {
      const removed = h.search
        .split('\n')
        .map((line) => `- ${line}`)
        .join('\n');
      const added = h.replace
        .split('\n')
        .map((line) => `+ ${line}`)
        .join('\n');
      return `@@ پچ شماره ${idx + 1} @@\n${removed}\n${added}`;
    })
    .join('\n\n');
}
