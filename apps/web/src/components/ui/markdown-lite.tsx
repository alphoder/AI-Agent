'use client';

import React from 'react';

/**
 * Zero-dependency markdown renderer for short admin notes.
 * Supports:
 *   - **bold** / __bold__
 *   - *italic* / _italic_
 *   - `inline code`
 *   - [text](url)   → new-tab link
 *   - # / ## / ### headings
 *   - - bullet list items
 *   - 1. ordered list items
 *   - Paragraph breaks on blank lines
 *
 * NOT supported: tables, images, html. Keeps the surface small and safe;
 * unrecognised syntax falls through as plain text.
 */
export function MarkdownLite({ source, className = '' }: { source: string; className?: string }) {
  const blocks = splitBlocks(source);
  return (
    <div className={`space-y-2 ${className}`}>
      {blocks.map((block, i) => renderBlock(block, i))}
    </div>
  );
}

type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | { kind: 'p'; text: string };

function splitBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let listKind: 'ul' | 'ol' | null = null;

  const flushPara = () => {
    if (buffer.length) {
      blocks.push({ kind: 'p', text: buffer.join(' ').trim() });
      buffer = [];
    }
  };
  const flushList = () => {
    if (listKind && buffer.length) {
      blocks.push({ kind: listKind, items: buffer.slice() });
      buffer = [];
      listKind = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushPara();
      flushList();
      continue;
    }

    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      flushPara();
      flushList();
      blocks.push({ kind: 'heading', level: h[1].length as 1 | 2 | 3, text: h[2] });
      continue;
    }

    const ul = line.match(/^\s*[-*]\s+(.*)$/);
    if (ul) {
      if (listKind !== 'ul') {
        flushPara();
        flushList();
        listKind = 'ul';
      }
      buffer.push(ul[1]);
      continue;
    }

    const ol = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ol) {
      if (listKind !== 'ol') {
        flushPara();
        flushList();
        listKind = 'ol';
      }
      buffer.push(ol[1]);
      continue;
    }

    // Normal paragraph line
    if (listKind) flushList();
    buffer.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}

function renderBlock(block: Block, key: number): React.ReactNode {
  if (block.kind === 'heading') {
    const Tag = (`h${block.level + 3}`) as keyof JSX.IntrinsicElements; // h4/h5/h6 inside a small card
    const cls =
      block.level === 1 ? 'text-sm font-semibold' :
      block.level === 2 ? 'text-[13px] font-semibold' :
      'text-xs font-semibold uppercase tracking-wider text-muted-foreground';
    return <Tag key={key} className={cls}>{renderInline(block.text)}</Tag>;
  }
  if (block.kind === 'ul') {
    return (
      <ul key={key} className="list-disc pl-5 space-y-0.5 marker:text-muted-foreground">
        {block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
      </ul>
    );
  }
  if (block.kind === 'ol') {
    return (
      <ol key={key} className="list-decimal pl-5 space-y-0.5 marker:text-muted-foreground">
        {block.items.map((it, i) => <li key={i}>{renderInline(it)}</li>)}
      </ol>
    );
  }
  return <p key={key}>{renderInline(block.text)}</p>;
}

/**
 * Inline formatting: bold, italic, inline code, links.
 * Rolled by hand so we don't pull in a markdown dep for 30 lines of output.
 */
function renderInline(text: string): React.ReactNode {
  // Tokenise: code > link > bold > italic > plain.
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  const patterns: Array<{ re: RegExp; render: (m: RegExpExecArray) => React.ReactNode }> = [
    { re: /`([^`]+)`/g, render: (m) => <code className="rounded bg-foreground/10 px-1 font-mono text-[11px]">{m[1]}</code> },
    { re: /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, render: (m) => <a href={m[2]} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-primary">{m[1]}</a> },
    { re: /\*\*([^*]+)\*\*/g, render: (m) => <strong className="font-semibold">{m[1]}</strong> },
    { re: /__([^_]+)__/g, render: (m) => <strong className="font-semibold">{m[1]}</strong> },
    { re: /(^|[^*])\*([^*\n]+)\*/g, render: (m) => <><>{m[1]}</><em className="italic">{m[2]}</em></> },
    { re: /(^|[^_])_([^_\n]+)_/g, render: (m) => <><>{m[1]}</><em className="italic">{m[2]}</em></> },
  ];

  // Find the earliest next match across all patterns, emit it, advance.
  while (cursor < text.length) {
    let best: { idx: number; length: number; node: React.ReactNode; consumed: number } | null = null;
    for (const { re, render } of patterns) {
      re.lastIndex = cursor;
      const m = re.exec(text);
      if (!m) continue;
      if (!best || m.index < best.idx) {
        best = { idx: m.index, length: m[0].length, node: render(m), consumed: m.index + m[0].length - cursor };
      }
    }
    if (!best) {
      nodes.push(text.slice(cursor));
      break;
    }
    if (best.idx > cursor) {
      nodes.push(text.slice(cursor, best.idx));
    }
    nodes.push(<React.Fragment key={`${cursor}-${best.idx}`}>{best.node}</React.Fragment>);
    cursor = best.idx + best.length;
  }

  return <>{nodes}</>;
}
