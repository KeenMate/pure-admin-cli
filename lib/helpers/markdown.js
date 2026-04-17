// ---------------------------------------------------------------------------
// Markdown → terminal renderer. Thin wrapper around marked + marked-terminal
// so call sites only see: `const { renderMarkdown } = require('./helpers/markdown')`.
// ---------------------------------------------------------------------------

let rendererReady = false;

function initRenderer() {
  const { marked } = require('marked');
  const { markedTerminal } = require('marked-terminal');
  marked.use(markedTerminal({
    // Align with our existing palette: headings blue-ish, code dim, width 80.
    width: 80,
    reflowText: true,
    tab: 2,
  }));
  rendererReady = true;
  return marked;
}

function renderMarkdown(text) {
  if (!text) return '';
  if (!rendererReady) initRenderer();
  const { marked } = require('marked');
  // marked adds a trailing newline; trim so callers can control spacing.
  return marked.parse(String(text)).trimEnd();
}

module.exports = { renderMarkdown };
