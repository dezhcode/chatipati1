import React from 'react';
import {
  extractSearchReplaceHunks,
  formatHunksAsUnifiedDiff,
} from '@/lib/code-patcher';

interface Token {
  type:
    | 'comment'
    | 'string'
    | 'keyword'
    | 'builtin'
    | 'tag'
    | 'attr'
    | 'function'
    | 'number'
    | 'operator'
    | 'property'
    | 'plain';
  value: string;
}

const KEYWORDS = new Set([
  // JS / TS
  'import',
  'export',
  'from',
  'default',
  'const',
  'let',
  'var',
  'function',
  'return',
  'if',
  'else',
  'for',
  'while',
  'do',
  'switch',
  'case',
  'break',
  'continue',
  'try',
  'catch',
  'finally',
  'throw',
  'new',
  'typeof',
  'instanceof',
  'in',
  'of',
  'class',
  'extends',
  'implements',
  'interface',
  'type',
  'enum',
  'async',
  'await',
  'yield',
  'static',
  'public',
  'private',
  'protected',
  'readonly',
  'as',
  // Python
  'def',
  'elif',
  'except',
  'raise',
  'with',
  'pass',
  'lambda',
  'nonlocal',
  'global',
  'assert',
  'del',
  'and',
  'or',
  'not',
  'is',
  // SQL / Rust / Go / C / Java
  'select',
  'where',
  'insert',
  'update',
  'delete',
  'join',
  'left',
  'right',
  'inner',
  'group',
  'order',
  'by',
  'limit',
  'fn',
  'pub',
  'mut',
  'impl',
  'struct',
  'match',
  'use',
  'mod',
  'crate',
  'package',
  'func',
  'defer',
  'go',
  'chan',
]);

const BUILTINS = new Set([
  'true',
  'false',
  'null',
  'undefined',
  'NaN',
  'Infinity',
  'True',
  'False',
  'None',
  'self',
  'this',
  'super',
  'console',
  'window',
  'document',
  'navigator',
  'fetch',
  'Promise',
  'Array',
  'Object',
  'String',
  'Number',
  'Boolean',
  'Map',
  'Set',
  'Date',
  'Math',
  'JSON',
  'Error',
  'React',
  'useState',
  'useEffect',
  'useRef',
  'useMemo',
  'useCallback',
  'useContext',
  'useReducer',
  'string',
  'number',
  'boolean',
  'any',
  'void',
  'never',
  'unknown',
  'Record',
  'Partial',
  'print',
  'len',
  'range',
  'dict',
  'list',
  'set',
  'tuple',
  'int',
  'float',
  'str',
  'bool',
  'asyncio',
]);

const TOKEN_REGEX =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/|<!--[\s\S]*?-->)|(`(?:\\[\s\S]|[^\\`])*`|"(?:\\.|[^"\\\n])*"|'(?:\\.|[^'\\\n])*')|(<\/?[A-Za-z][A-Za-z0-9._:-]*|\/>|>)|(\b[A-Za-z_][A-Za-z0-9_-]*(?=\s*=))|(\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:px|rem|em|vh|vw|%|s|ms|deg)?\b)|(\.[A-Za-z_][A-Za-z0-9_]*\b)|(\b[A-Za-z_][A-Za-z0-9_]*\b(?=\s*\())|(\b[A-Za-z_][A-Za-z0-9_]*\b)|([=!<>+\-*/%&|^~?:]+|[{}()[\];,.])/g;

function tokenizeLine(line: string): Token[] {
  if (!line) return [{ type: 'plain', value: '' }];
  const tokens: Token[] = [];
  let lastIndex = 0;

  TOKEN_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = TOKEN_REGEX.exec(line)) !== null) {
    if (match.index > lastIndex) {
      tokens.push({
        type: 'plain',
        value: line.slice(lastIndex, match.index),
      });
    }

    const [
      full,
      comment,
      str,
      tag,
      attr,
      num,
      prop,
      fnCall,
      ident,
      op,
    ] = match;

    if (comment !== undefined) {
      tokens.push({ type: 'comment', value: full });
    } else if (str !== undefined) {
      tokens.push({ type: 'string', value: full });
    } else if (tag !== undefined) {
      tokens.push({ type: 'tag', value: full });
    } else if (attr !== undefined) {
      tokens.push({ type: 'attr', value: full });
    } else if (num !== undefined) {
      tokens.push({ type: 'number', value: full });
    } else if (prop !== undefined) {
      tokens.push({ type: 'property', value: full });
    } else if (fnCall !== undefined) {
      if (KEYWORDS.has(full)) {
        tokens.push({ type: 'keyword', value: full });
      } else if (BUILTINS.has(full)) {
        tokens.push({ type: 'builtin', value: full });
      } else {
        tokens.push({ type: 'function', value: full });
      }
    } else if (ident !== undefined) {
      if (KEYWORDS.has(full)) {
        tokens.push({ type: 'keyword', value: full });
      } else if (BUILTINS.has(full) || /^[A-Z]/.test(full)) {
        tokens.push({ type: 'builtin', value: full });
      } else {
        tokens.push({ type: 'plain', value: full });
      }
    } else if (op !== undefined) {
      tokens.push({ type: 'operator', value: full });
    } else {
      tokens.push({ type: 'plain', value: full });
    }

    lastIndex = TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < line.length) {
    tokens.push({
      type: 'plain',
      value: line.slice(lastIndex),
    });
  }

  return tokens;
}

const TOKEN_CLASS_MAP: Record<Token['type'], string> = {
  comment: 'text-zinc-500 italic',
  string: 'text-emerald-400',
  keyword: 'text-purple-400 font-medium',
  builtin: 'text-amber-300',
  tag: 'text-rose-400 font-medium',
  attr: 'text-amber-300/90',
  function: 'text-sky-400',
  number: 'text-orange-400',
  property: 'text-cyan-300',
  operator: 'text-sky-300/80',
  plain: 'text-zinc-100',
};

export function HighlightedCode({
  code,
  language = '',
  showLineNumbers = true,
}: {
  code: string;
  language?: string;
  showLineNumbers?: boolean;
}) {
  const normalizedLang = (language || '').toLowerCase().trim();
  const rawHunks = extractSearchReplaceHunks(code);
  const isDiffBlock =
    normalizedLang === 'diff' ||
    normalizedLang === 'patch' ||
    rawHunks.length > 0;

  const displayCode =
    rawHunks.length > 0 ? formatHunksAsUnifiedDiff(rawHunks) : code;
  const lines = displayCode.split('\n');

  return (
    <div className="font-mono text-xs sm:text-[13px] leading-6 select-text w-full">
      {lines.map((line, lineIdx) => {
        if (isDiffBlock) {
          const isHunkHeader = line.startsWith('@@');
          const isAdded = line.startsWith('+') && !line.startsWith('+++');
          const isRemoved = line.startsWith('-') && !line.startsWith('---');

          if (isHunkHeader) {
            return (
              <div
                key={lineIdx}
                className="table-row bg-sky-500/10 text-sky-300 font-semibold"
              >
                {showLineNumbers && (
                  <span
                    aria-hidden="true"
                    className="table-cell px-2.5 select-none text-right text-[11px] text-sky-400/70 tabular-nums w-8"
                  >
                    @@
                  </span>
                )}
                <span
                  dir="rtl"
                  className="table-cell px-2 py-0.5 font-sans text-xs text-sky-300"
                >
                  {line.replace(/@@/g, '').trim()}
                </span>
              </div>
            );
          }

          const innerLine =
            isAdded || isRemoved ? line.slice(1).replace(/^ /, '') : line;
          const tokens = tokenizeLine(innerLine);

          return (
            <div
              key={lineIdx}
              className={`table-row transition-colors ${
                isAdded
                  ? 'bg-emerald-500/15 hover:bg-emerald-500/20'
                  : isRemoved
                  ? 'bg-rose-500/15 hover:bg-rose-500/20'
                  : 'hover:bg-zinc-900/70'
              }`}
            >
              {showLineNumbers && (
                <span
                  aria-hidden="true"
                  className={`table-cell pr-3 pl-1.5 select-none text-right text-[11px] tabular-nums w-8 font-bold ${
                    isAdded
                      ? 'text-emerald-400 bg-emerald-500/20 border-r border-emerald-500/40'
                      : isRemoved
                      ? 'text-rose-400 bg-rose-500/20 border-r border-rose-500/40'
                      : 'text-zinc-600'
                  }`}
                >
                  {isAdded ? '+' : isRemoved ? '−' : lineIdx + 1}
                </span>
              )}
              <span className="table-cell pl-3 whitespace-pre">
                {tokens.map((token, tokIdx) => (
                  <span
                    key={tokIdx}
                    className={
                      isAdded && token.type === 'plain'
                        ? 'text-emerald-200'
                        : isRemoved && token.type === 'plain'
                        ? 'text-rose-200/90 line-through decoration-rose-400/40'
                        : TOKEN_CLASS_MAP[token.type]
                    }
                  >
                    {token.value}
                  </span>
                ))}
                {innerLine.length === 0 && '\n'}
              </span>
            </div>
          );
        }

        const tokens = tokenizeLine(line);
        return (
          <div
            key={lineIdx}
            className="table-row hover:bg-zinc-900/70 transition-colors"
          >
            {showLineNumbers && (
              <span
                aria-hidden="true"
                className="table-cell pr-4 select-none text-right text-[11px] text-zinc-600 tabular-nums w-8"
              >
                {lineIdx + 1}
              </span>
            )}
            <span className="table-cell whitespace-pre">
              {tokens.map((token, tokIdx) => (
                <span key={tokIdx} className={TOKEN_CLASS_MAP[token.type]}>
                  {token.value}
                </span>
              ))}
              {line.length === 0 && '\n'}
            </span>
          </div>
        );
      })}
    </div>
  );
}
