"use client";

import type { ReactNode } from "react";

/**
 * Minimal markdown renderer for coach replies — bold, italic, inline code,
 * bullet/numbered lists, and headings. No external deps, no raw HTML.
 */

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\n]+\*)/g;
  let last = 0;
  let i = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text))) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const token = match[0];
    const key = `${keyPrefix}-${i++}`;
    if (token.startsWith("**")) {
      parts.push(
        <strong key={key} className="font-semibold">
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`")) {
      parts.push(
        <code key={key} className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
          {token.slice(1, -1)}
        </code>
      );
    } else {
      parts.push(<em key={key}>{token.slice(1, -1)}</em>);
    }
    last = match.index + token.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const BULLET = /^\s*[-*]\s+/;
const NUMBERED = /^\s*\d+[.)]\s+/;
const HEADING = /^(#{1,4})\s+(.*)/;

export function Markdown({ content }: { content: string }) {
  const lines = content.split(/\r?\n/);
  const blocks: ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (!line.trim()) {
      i++;
      continue;
    }

    const heading = line.match(HEADING);
    if (heading) {
      blocks.push(
        <p key={key++} className="font-semibold text-foreground">
          {renderInline(heading[2], `h${key}`)}
        </p>
      );
      i++;
      continue;
    }

    if (BULLET.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET.test(lines[i])) {
        items.push(lines[i].replace(BULLET, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="ml-4 list-disc space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `u${key}-${j}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (NUMBERED.test(line)) {
      const items: string[] = [];
      while (i < lines.length && NUMBERED.test(lines[i])) {
        items.push(lines[i].replace(NUMBERED, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="ml-4 list-decimal space-y-1">
          {items.map((item, j) => (
            <li key={j}>{renderInline(item, `o${key}-${j}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: swallow consecutive plain lines.
    const para: string[] = [line];
    i++;
    while (
      i < lines.length &&
      lines[i].trim() &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !HEADING.test(lines[i])
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push(
      <p key={key++} className="whitespace-pre-wrap">
        {renderInline(para.join("\n"), `p${key}`)}
      </p>
    );
  }

  return <div className="space-y-2 break-words">{blocks}</div>;
}
