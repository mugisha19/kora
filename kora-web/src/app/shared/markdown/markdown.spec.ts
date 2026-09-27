import { render, screen } from '@testing-library/angular';
import { Markdown, parseInline, parseMarkdown } from './markdown';

describe('markdown', () => {
  it('parses emphasis, code and safe links', () => {
    expect(parseInline('Use **bold**, *italic*, `code` and [docs](https://kora.example)')).toEqual([
      { kind: 'text', text: 'Use ' },
      { kind: 'strong', text: 'bold' },
      { kind: 'text', text: ', ' },
      { kind: 'em', text: 'italic' },
      { kind: 'text', text: ', ' },
      { kind: 'code', text: 'code' },
      { kind: 'text', text: ' and ' },
      { kind: 'link', text: 'docs', href: 'https://kora.example' },
    ]);
  });

  it('drops links that could run script', () => {
    expect(parseInline('[click](javascript:alert(1))')).not.toContainEqual(
      expect.objectContaining({ kind: 'link' }),
    );
  });

  it('groups lines into paragraphs, lists and code blocks', () => {
    expect(
      parseMarkdown('Intro\nsecond line\n\n- one\n- two\n\n1. first\n\n```\nx < y\n```'),
    ).toEqual([
      {
        kind: 'paragraph',
        inlines: [
          { kind: 'text', text: 'Intro' },
          { kind: 'break' },
          { kind: 'text', text: 'second line' },
        ],
      },
      {
        kind: 'list',
        ordered: false,
        items: [[{ kind: 'text', text: 'one' }], [{ kind: 'text', text: 'two' }]],
      },
      { kind: 'list', ordered: true, items: [[{ kind: 'text', text: 'first' }]] },
      { kind: 'code', text: 'x < y' },
    ]);
  });

  it('shows raw HTML as text, never as markup', async () => {
    const { container } = await render(Markdown, {
      inputs: { text: '<img src=x onerror="alert(1)"> **safe**' },
    });

    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText(/<img src=x onerror="alert\(1\)">/)).toBeTruthy();
    expect(screen.getByText('safe').tagName).toBe('STRONG');
  });
});
