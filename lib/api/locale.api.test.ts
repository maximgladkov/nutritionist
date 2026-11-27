import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { translateErrorMessage } from "./error-messages.ts";
import { api, closeDatabase, installFakes, resetDatabase, signIn, type Session } from "./test/harness.ts";

let kira: Session;

before(async () => {
  installFakes();
  await resetDatabase();
  kira = await signIn("kira@example.com");
});
after(closeDatabase);

describe("error messages", () => {
  it("follow the app's language when no one is signed in", async () => {
    const spanish = await api("GET", "/me", { headers: { "accept-language": "es" } });
    assert.equal(spanish.status, 401);
    assert.equal(spanish.body.error.code, "unauthorized");
    assert.equal(spanish.body.error.message, "Inicia sesión para continuar.");
    const russian = await api("GET", "/no-such-thing", { headers: { "accept-language": "ru-RU" } });
    assert.equal(russian.body.error.message, "Такого адреса нет.");
    const german = await api("GET", "/me", { headers: { "accept-language": "de-AT,de;q=0.9" } });
    assert.equal(german.body.error.message, "Melde dich an, um weiterzumachen.");
    const french = await api("GET", "/me", { headers: { "accept-language": "fr-CA,fr;q=0.9" } });
    assert.equal(french.body.error.message, "Connecte-toi pour continuer.");
    const italian = await api("GET", "/me", { headers: { "accept-language": "it-CH,it;q=0.9" } });
    assert.equal(italian.body.error.message, "Accedi per continuare.");
    const portuguese = await api("GET", "/me", { headers: { "accept-language": "pt-BR,pt;q=0.9" } });
    assert.equal(portuguese.body.error.message, "Entre para continuar.");
    const dutch = await api("GET", "/me", { headers: { "accept-language": "nl-NL,nl;q=0.9" } });
    assert.equal(dutch.body.error.message, "Log in om verder te gaan.");
    const polish = await api("GET", "/me", { headers: { "accept-language": "pl-PL,pl;q=0.9" } });
    assert.equal(polish.body.error.message, "Zaloguj się, aby kontynuować.");
    const turkish = await api("GET", "/me", { headers: { "accept-language": "tr-TR,tr;q=0.9" } });
    assert.equal(turkish.body.error.message, "Devam etmek için giriş yap.");
    const ukrainian = await api("GET", "/me", { headers: { "accept-language": "uk-UA,uk;q=0.9" } });
    assert.equal(ukrainian.body.error.message, "Увійди, щоб продовжити.");
    const other = await api("GET", "/me", { headers: { "accept-language": "sv" } });
    assert.equal(other.body.error.message, "Sign in to continue.");
  });

  it("keep their status and code, and follow the account's language first", async () => {
    await api("PATCH", "/me", { body: { locale: "ru" }, token: kira.accessToken });
    const result = await api("GET", "/meals/missing", { headers: { "accept-language": "es" }, token: kira.accessToken });
    assert.equal(result.status, 404, JSON.stringify(result.body));
    assert.equal(result.body.error.code, "not_found");
    assert.equal(result.body.error.message, "Приём пищи не найден.");
  });

  it("fill values into messages built from them", async () => {
    await api("PATCH", "/me", { body: { locale: "es" }, token: kira.accessToken });
    const result = await api("PATCH", "/me", { body: { locale: "xx" }, token: kira.accessToken });
    assert.equal(result.status, 400);
    assert.equal(result.body.error.message, "Elige una de estas opciones: en, ru, es, de, fr, it, pt, nl, pl, tr, uk.");
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "de"),
      "Tageswert für Eiweiß: eine ganze Zahl von 10 bis 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "fr"),
      "Objectif quotidien pour les protéines\u202f: un nombre entier de 10 à 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "it"),
      "Obiettivo giornaliero di proteine: un numero intero da 10 a 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "pt"),
      "Meta diária de proteínas: um número inteiro de 10 a 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "nl"),
      "Dagdoel voor eiwit: een heel getal van 10 tot 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "pl"),
      "Białko dziennie: liczba całkowita od 10 do 400 g.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "tr"),
      "Günlük protein: 10 ile 400 g arasında bir tam sayı olmalı.",
    );
    assert.equal(
      translateErrorMessage("Daily protein must be a whole number from 10 to 400 grams.", "uk"),
      "Білки на день: ціле число від 10 до 400 г.",
    );
  });

  it("stay English for developer-facing messages", async () => {
    const form = new FormData();
    form.set("note", "no file");
    const result = await api("POST", "/uploads", { headers: { "accept-language": "de" }, raw: form, token: kira.accessToken });
    assert.equal(result.status, 400, JSON.stringify(result.body));
    assert.equal(result.body.error.message, "Attach the image as a `file` field.");
  });
});
