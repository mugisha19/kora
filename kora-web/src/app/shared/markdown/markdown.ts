import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/*
 * A small Markdown subset for task descriptions and comments (contract 0.3.0: "render it as
 * Markdown only; raw HTML is not allowed"). Text is parsed into blocks and inline pieces that the
 * template renders with interpolation — never `innerHTML` — so no markup in the text can run or
 * even render as HTML. Supported: paragraphs, line breaks, `-`/`*` and `1.` lists, `**bold**`,
 * `*italic*`, `` `code` ``, fenced code blocks and `[links](https://…)` (http, https and mailto
 * only).
 */

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'em'; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'link'; text: string; href: string }
  | { kind: 'break' };

export type Block =
  | { kind: 'paragraph'; inlines: Inline[] }
  | { kind: 'list'; ordered: boolean; items: Inline[][] }
  | { kind: 'code'; text: string };

const SAFE_LINK = /^(https?:\/\/|mailto:)/i;
const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\)|\*[^*\s][^*]*\*)/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  text.split('\n').forEach((line, index) => {
    if (index > 0) out.push({ kind: 'break' });
    for (const part of line.split(INLINE)) {
      if (!part) continue;
      if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
        out.push({ kind: 'strong', text: part.slice(2, -2) });
      } else if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
        out.push({ kind: 'code', text: part.slice(1, -1) });
      } else if (part.startsWith('[')) {
        const match = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part);
        if (match && SAFE_LINK.test(match[2])) {
          out.push({ kind: 'link', text: match[1], href: match[2] });
        } else {
          out.push({ kind: 'text', text: match ? match[1] : part });
        }
      } else if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
        out.push({ kind: 'em', text: part.slice(1, -1) });
      } else {
        out.push({ kind: 'text', text: part });
      }
    }
  });
  return out;
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length)
      blocks.push({ kind: 'paragraph', inlines: parseInline(paragraph.join('\n')) });
    paragraph = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      flush();
      const code: string[] = [];
      for (i++; i < lines.length && !lines[i].trim().startsWith('```'); i++) code.push(lines[i]);
      blocks.push({ kind: 'code', text: code.join('\n') });
      continue;
    }
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flush();
      const ordered = Boolean(numbered);
      const last = blocks.at(-1);
      const item = parseInline((bullet ?? numbered)?.[1] ?? '');
      if (last?.kind === 'list' && last.ordered === ordered) last.items.push(item);
      else blocks.push({ kind: 'list', ordered, items: [item] });
      continue;
    }
    if (!line.trim()) flush();
    else paragraph.push(line);
  }
  flush();
  return blocks;
}

/** `<kora-markdown [text]="task.description" />` */
@Component({
  selector: 'kora-markdown',
  imports: [NgTemplateOutlet],
  template: `
    <ng-template #inline let-inlines>
      @for (piece of $any(inlines); track $index) {
        @switch (piece.kind) {
          @case ('strong') {
            <strong>{{ piece.text }}</strong>
          }
          @case ('em') {
            <em>{{ piece.text }}</em>
          }
          @case ('code') {
            <code>{{ piece.text }}</code>
          }
          @case ('link') {
            <a [href]="piece.href" target="_blank" rel="noopener noreferrer">{{ piece.text }}</a>
          }
          @case ('break') {
            <br />
          }
          @default {
            {{ piece.text }}
          }
        }
      }
    </ng-template>
    @for (block of blocks(); track $index) {
      @switch (block.kind) {
        @case ('paragraph') {
          <p><ng-container *ngTemplateOutlet="inline; context: { $implicit: block.inlines }" /></p>
        }
        @case ('list') {
          @if (block.ordered) {
            <ol>
              @for (item of block.items; track $index) {
                <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
              }
            </ol>
          } @else {
            <ul>
              @for (item of block.items; track $index) {
                <li><ng-container *ngTemplateOutlet="inline; context: { $implicit: item }" /></li>
              }
            </ul>
          }
        }
        @case ('code') {
          <pre><code>{{ block.text }}</code></pre>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
      overflow-wrap: anywhere;
    }
    p,
    ul,
    ol,
    pre {
      margin: 0 0 var(--kora-space-2);
    }
    ul,
    ol {
      padding-inline-start: var(--kora-space-6);
    }
    code {
      padding: 0 var(--kora-space-1);
      border-radius: 4px;
      background: var(--mat-sys-surface-container-high);
      font-family: ui-monospace, 'Cascadia Code', Consolas, monospace;
    }
    pre {
      overflow-x: auto;
      padding: var(--kora-space-2);
      border-radius: var(--kora-radius);
      background: var(--mat-sys-surface-container-high);
    }
    pre code {
      padding: 0;
      background: none;
    }
  `,
})
export class Markdown {
  readonly text = input<string | null | undefined>('');
  protected readonly blocks = computed(() => parseMarkdown(this.text() ?? ''));
}
