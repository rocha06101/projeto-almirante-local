import { marked } from 'marked';

export function renderizarMarkdown(markdown: string): string {
  return marked.parse(markdown, { async: false, gfm: true });
}