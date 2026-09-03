export type TelegramWebApp = {
  expand: () => void;
  initData: string;
  offEvent?: (event: string, callback: () => void) => void;
  onEvent?: (event: string, callback: () => void) => void;
  ready: () => void;
};

export function telegramWebApp(): TelegramWebApp | undefined {
  const telegram = (window as Window & { Telegram?: { WebApp?: TelegramWebApp } }).Telegram;
  return telegram?.WebApp;
}

export function bootTelegramWebApp(onReady: (initData: string) => void): () => void {
  const existing = telegramWebApp();
  if (existing) {
    existing.ready();
    existing.expand();
    onReady(existing.initData);
    return () => {};
  }
  const script = document.createElement("script");
  script.src = "https://telegram.org/js/telegram-web-app.js";
  script.async = true;
  script.onload = () => {
    const bridge = telegramWebApp();
    bridge?.ready();
    bridge?.expand();
    onReady(bridge?.initData ?? "");
  };
  script.onerror = () => {
    onReady("");
  };
  document.head.appendChild(script);
  return () => {
    script.remove();
  };
}
