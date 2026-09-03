"use client";

import { signInWithTelegramAction } from "@/app/actions/auth";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useEffect, useRef } from "react";

type TelegramWidgetUser = {
  auth_date: number;
  first_name: string;
  hash: string;
  id: number;
  last_name?: string;
  photo_url?: string;
  username?: string;
};

export function TelegramLoginWidget({
  botUsername,
  callbackUrl,
  lang,
}: {
  readonly botUsername: string;
  readonly callbackUrl: string;
  readonly lang: string;
}) {
  const { t } = useLingui();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const onAuth = (user: TelegramWidgetUser) => {
      void signInWithTelegramAction({
        auth_date: String(user.auth_date),
        callbackUrl,
        first_name: user.first_name,
        hash: user.hash,
        id: String(user.id),
        last_name: user.last_name,
        photo_url: user.photo_url,
        username: user.username,
      });
    };

    Object.assign(window, { onTelegramAuth: onAuth });

    const script = document.createElement("script");
    script.async = true;
    script.src = "https://telegram.org/js/telegram-widget.js?22";
    script.setAttribute("data-lang", lang);
    script.setAttribute("data-onauth", "onTelegramAuth(user)");
    script.setAttribute("data-size", "large");
    script.setAttribute("data-telegram-login", botUsername);
    container.replaceChildren(script);

    return () => {
      Reflect.deleteProperty(window, "onTelegramAuth");
      container.replaceChildren();
    };
  }, [botUsername, callbackUrl, lang]);

  return (
    <div
      ref={containerRef}
      aria-label={t(msg`Sign in with Telegram`)}
      className="flex justify-center"
    />
  );
}
