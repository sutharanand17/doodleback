export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function markdownToHtml(md: string): string {
  if (!md) return '';

  let html = escapeHtml(md);

  // Parse multi-line code blocks: ```code```
  html = html.replace(/```([\s\S]*?)```/g, (_match, p1) => {
    return `<pre><code>${p1}</code></pre>`;
  });

  // Parse inline code: `code`
  html = html.replace(/`([^`]+)`/g, (_match, p1) => {
    return `<code>${p1}</code>`;
  });

  // Parse bold: **text**
  html = html.replace(/\*\*([^*]+)\*\*/g, (_match, p1) => {
    return `<strong>${p1}</strong>`;
  });

  // Parse italic: *text* or _text_
  html = html.replace(/(?:\*|_)([^*_]+)(?:\*|_)/g, (_match, p1) => {
    return `<em>${p1}</em>`;
  });

  // Replace newlines with <br> for non-preformatted text
  const parts = html.split(/(<pre><code>[\s\S]*?<\/code><\/pre>)/g);
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('<pre>')) {
      parts[i] = parts[i].replace(/\n/g, '<br>');
    }
  }
  
  return parts.join('');
}
