const PLACEHOLDER = (index: number) => `\u0000TG${index}\u0000`;

export function markdownToTelegramHtml(markdown: string): string {
  const slots: string[] = [];
  const stash = (html: string) => {
    const index = slots.length;
    slots.push(html);
    return PLACEHOLDER(index);
  };

  let text = markdown.replaceAll("\r\n", "\n");
  text = text.replace(/```(?:([\w+-]+)\n)?([\s\S]*?)```/gu, (_match, language: string | undefined, code: string) => {
    const escaped = escapeTelegramHtml(trimCodeFence(code));
    if (language) {
      return stash(`<pre><code class="language-${escapeTelegramHtml(language)}">${escaped}</code></pre>`);
    }
    return stash(`<pre>${escaped}</pre>`);
  });
  text = text.replace(/`([^`\n]+)`/gu, (_match, code: string) => stash(`<code>${escapeTelegramHtml(code)}</code>`));
  text = escapeTelegramHtml(text);
  text = text.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/gu, (_match, label: string, href: string) => {
    return `<a href="${escapeTelegramAttribute(href)}">${label}</a>`;
  });
  text = text.replace(/^#{1,6}[ \t]+(.+)$/gmu, "<b>$1</b>");
  text = text.replace(/\*\*(.+?)\*\*/gu, "<b>$1</b>");
  text = text.replace(/__(.+?)__/gu, "<b>$1</b>");
  text = text.replace(/~~(.+?)~~/gu, "<s>$1</s>");
  return text.replace(/\u0000TG(\d+)\u0000/gu, (_match, index: string) => slots[Number(index)] ?? "");
}

export function telegramHtmlMessage(text: string) {
  return Object.assign({ text }, { parse_mode: "HTML" as const });
}

function trimCodeFence(code: string) {
  return code.replace(/^\n/u, "").replace(/\n$/u, "");
}

function escapeTelegramHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeTelegramAttribute(value: string) {
  return escapeTelegramHtml(value).replaceAll('"', "&quot;");
}
