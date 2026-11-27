import type { Locale } from "../i18n/locales.ts";

type Translated = { de: string; es: string; fr: string; it: string; nl: string; pt: string; ru: string };

// Error messages the API writes in English, in the other languages the app speaks. Keyed by the
// English text, so throw sites stay as they are and toApiError can keep reading English to pick a
// status. Messages with a value in them are in TEMPLATES below; developer-facing ones stay English.
const MESSAGES: Record<string, Translated> = {
  // Defaults and the router's own.
  "Invalid request.": { de: "Ungültige Anfrage.", es: "La solicitud no es válida.", fr: "Requête invalide.", it: "Richiesta non valida.", nl: "Ongeldig verzoek.", pt: "Solicitação inválida.", ru: "Неверный запрос." },
  "Method not allowed.": { de: "Methode nicht erlaubt.", es: "Método no permitido.", fr: "Méthode non autorisée.", it: "Metodo non consentito.", nl: "Methode niet toegestaan.", pt: "Método não permitido.", ru: "Метод не поддерживается." },
  "No such endpoint.": { de: "Diese Adresse gibt es nicht.", es: "Esa dirección no existe.", fr: "Cette adresse n’existe pas.", it: "Questo indirizzo non esiste.", nl: "Dit adres bestaat niet.", pt: "Esse endereço não existe.", ru: "Такого адреса нет." },
  "Not found.": { de: "Nicht gefunden.", es: "No se encontró.", fr: "Introuvable.", it: "Non trovato.", nl: "Niet gevonden.", pt: "Não encontrado.", ru: "Не найдено." },
  "Sign in to continue.": { de: "Melde dich an, um weiterzumachen.", es: "Inicia sesión para continuar.", fr: "Connecte-toi pour continuer.", it: "Accedi per continuare.", nl: "Log in om verder te gaan.", pt: "Entre para continuar.", ru: "Войдите, чтобы продолжить." },
  "Something went wrong.": { de: "Etwas ist schiefgelaufen.", es: "Algo salió mal.", fr: "Un problème est survenu.", it: "Qualcosa è andato storto.", nl: "Er ging iets mis.", pt: "Algo deu errado.", ru: "Что-то пошло не так." },
  "You cannot do that.": { de: "Das kannst du nicht tun.", es: "No puedes hacer eso.", fr: "Tu ne peux pas faire ça.", it: "Non puoi farlo.", nl: "Dat kun je niet doen.", pt: "Você não pode fazer isso.", ru: "Это действие вам недоступно." },

  // Signing in.
  "Apple sign-in failed. Try again.": { de: "Anmeldung mit Apple fehlgeschlagen. Versuch es noch mal.",
    es: "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.",
    fr: "La connexion avec Apple a échoué. Réessaie.", it: "Accesso con Apple non riuscito. Riprova.", nl: "Inloggen met Apple is mislukt. Probeer het opnieuw.", pt: "Não foi possível entrar com a Apple. Tente de novo.", ru: "Не удалось войти через Apple. Попробуйте ещё раз.",
  },
  "Open this from the Telegram bot.": { de: "Öffne das aus dem Telegram-Bot.", es: "Ábrelo desde el bot de Telegram.", fr: "Ouvre ceci depuis le bot Telegram.", it: "Aprilo dal bot di Telegram.", nl: "Open dit vanuit de Telegram-bot.", pt: "Abra isto pelo bot do Telegram.", ru: "Откройте это из бота в Telegram." },
  "Sign in again.": { de: "Melde dich erneut an.", es: "Vuelve a iniciar sesión.", fr: "Reconnecte-toi.", it: "Accedi di nuovo.", nl: "Log opnieuw in.", pt: "Entre de novo.", ru: "Войдите снова." },
  "Telegram is not configured.": { de: "Telegram ist nicht eingerichtet.", es: "Telegram no está configurado.", fr: "Telegram n’est pas configuré.", it: "Telegram non è configurato.", nl: "Telegram is niet ingesteld.", pt: "O Telegram não está configurado.", ru: "Telegram не настроен." },
  "Telegram login expired. Close and open the app again.": { de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die App und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra la app y vuelve a abrirla.",
    fr: "La connexion Telegram a expiré. Ferme l’app et rouvre-la.", it: "L’accesso con Telegram è scaduto. Chiudi l’app e riaprila.", nl: "Je Telegram-sessie is verlopen. Sluit de app en open hem opnieuw.", pt: "O login com o Telegram expirou. Feche o app e abra de novo.", ru: "Вход через Telegram истёк. Закройте приложение и откройте его снова.",
  },
  "That code expired. Request a new one.": { de: "Dieser Code ist abgelaufen. Fordere einen neuen an.",
    es: "Ese código caducó. Pide uno nuevo.",
    fr: "Ce code a expiré. Demandes-en un nouveau.", it: "Questo codice è scaduto. Richiedine uno nuovo.", nl: "Deze code is verlopen. Vraag een nieuwe aan.", pt: "Esse código expirou. Peça um novo.", ru: "Срок действия кода истёк. Запросите новый.",
  },
  "That code is not correct.": { de: "Dieser Code ist nicht richtig.", es: "Ese código no es correcto.", fr: "Ce code n’est pas correct.", it: "Questo codice non è corretto.", nl: "Deze code klopt niet.", pt: "Esse código não está correto.", ru: "Неверный код." },
  "That code is not valid or expired.": { de: "Dieser Code ist ungültig oder abgelaufen.",
    es: "Ese código no es válido o ha caducado.",
    fr: "Ce code n’est pas valide ou a expiré.", it: "Questo codice non è valido o è scaduto.", nl: "Deze code is ongeldig of verlopen.", pt: "Esse código não é válido ou expirou.", ru: "Код недействителен или его срок истёк.",
  },
  "Your session expired. Refresh the token or sign in again.": { de: "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
    es: "Tu sesión caducó. Vuelve a iniciar sesión.",
    fr: "Ta session a expiré. Reconnecte-toi.", it: "La tua sessione è scaduta. Accedi di nuovo.", nl: "Je sessie is verlopen. Log opnieuw in.", pt: "Sua sessão expirou. Entre de novo.", ru: "Сессия истекла. Войдите снова.",
  },

  // Account.
  "Account not found.": { de: "Konto nicht gefunden.", es: "No se encontró la cuenta.", fr: "Compte introuvable.", it: "Account non trovato.", nl: "Account niet gevonden.", pt: "Conta não encontrada.", ru: "Аккаунт не найден." },
  "Choose a valid country.": { de: "Wähle ein gültiges Land.", es: "Elige un país válido.", fr: "Choisis un pays valide.", it: "Scegli un paese valido.", nl: "Kies een geldig land.", pt: "Escolha um país válido.", ru: "Выберите страну из списка." },
  "Choose a valid time zone.": { de: "Wähle eine gültige Zeitzone.", es: "Elige una zona horaria válida.", fr: "Choisis un fuseau horaire valide.", it: "Scegli un fuso orario valido.", nl: "Kies een geldige tijdzone.", pt: "Escolha um fuso horário válido.", ru: "Выберите часовой пояс из списка." },
  "That account is not linked.": { de: "Dieses Konto ist nicht verknüpft.", es: "Esa cuenta no está vinculada.", fr: "Ce compte n’est pas associé.", it: "Questo account non è collegato.", nl: "Dit account is niet gekoppeld.", pt: "Essa conta não está vinculada.", ru: "Этот аккаунт не привязан." },
  "There's no photo on your Telegram account.": { de: "Dein Telegram-Konto hat kein Foto.",
    es: "Tu cuenta de Telegram no tiene foto.",
    fr: "Ton compte Telegram n’a pas de photo.", it: "Il tuo account Telegram non ha una foto.", nl: "Je Telegram-account heeft geen foto.", pt: "Sua conta do Telegram não tem foto.", ru: "В вашем аккаунте Telegram нет фото.",
  },

  // Diary, foods and meals.
  "Each saved food needs a name.": { de: "Jedes gespeicherte Lebensmittel braucht einen Namen.", es: "Cada alimento guardado necesita un nombre.", fr: "Chaque aliment enregistré doit avoir un nom.", it: "Ogni alimento salvato deve avere un nome.", nl: "Elk opgeslagen voedingsmiddel heeft een naam nodig.", pt: "Cada alimento salvo precisa de um nome.", ru: "У каждого сохранённого продукта должно быть название." },
  "Meal not found.": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", fr: "Repas introuvable.", it: "Pasto non trovato.", nl: "Maaltijd niet gevonden.", pt: "Refeição não encontrada.", ru: "Приём пищи не найден." },
  "Photo not found.": { de: "Foto nicht gefunden.", es: "No se encontró la foto.", fr: "Photo introuvable.", it: "Foto non trovata.", nl: "Foto niet gevonden.", pt: "Foto não encontrada.", ru: "Фото не найдено." },
  "Recipe not found.": { de: "Rezept nicht gefunden.", es: "No se encontró la receta.", fr: "Recette introuvable.", it: "Ricetta non trovata.", nl: "Recept niet gevonden.", pt: "Receita não encontrada.", ru: "Рецепт не найден." },
  "Saved meal not found.": { de: "Gespeicherte Mahlzeit nicht gefunden.", es: "No se encontró la comida guardada.", fr: "Repas enregistré introuvable.", it: "Pasto salvato non trovato.", nl: "Opgeslagen maaltijd niet gevonden.", pt: "Refeição salva não encontrada.", ru: "Сохранённый приём пищи не найден." },
  "That food is not in the catalog.": { de: "Dieses Lebensmittel ist nicht im Katalog.", es: "Ese alimento no está en el catálogo.", fr: "Cet aliment n’est pas dans le catalogue.", it: "Questo alimento non è nel catalogo.", nl: "Dit voedingsmiddel staat niet in de catalogus.", pt: "Esse alimento não está no catálogo.", ru: "Этого продукта нет в каталоге." },
  "That food is not in this member's diary.": { de: "Dieses Lebensmittel ist nicht im Tagebuch dieses Mitglieds.",
    es: "Ese alimento no está en el diario de este miembro.",
    fr: "Cet aliment n’est pas dans le journal de ce membre.", it: "Questo alimento non è nel diario di questo membro.", nl: "Dit voedingsmiddel staat niet in het dagboek van dit lid.", pt: "Esse alimento não está no diário deste membro.", ru: "Этого продукта нет в дневнике участника.",
  },
  "That item id is already taken. Try again.": { de: "Diese ID ist schon vergeben. Versuch es noch mal.",
    es: "Ese identificador ya está en uso. Inténtalo de nuevo.",
    fr: "Cet identifiant est déjà pris. Réessaie.", it: "Questo identificativo è già in uso. Riprova.", nl: "Deze ID is al in gebruik. Probeer het opnieuw.", pt: "Esse identificador já está em uso. Tente de novo.", ru: "Этот идентификатор уже занят. Попробуйте ещё раз.",
  },
  "That meal has no foods to save.": { de: "Diese Mahlzeit enthält nichts zum Speichern.", es: "Esa comida no tiene alimentos que guardar.", fr: "Ce repas n’a aucun aliment à enregistrer.", it: "Questo pasto non ha alimenti da salvare.", nl: "Deze maaltijd heeft niets om op te slaan.", pt: "Essa refeição não tem alimentos para salvar.", ru: "В этом приёме пищи нечего сохранить." },
  "That meal has no foods to share.": { de: "Diese Mahlzeit enthält nichts zum Teilen.", es: "Esa comida no tiene alimentos que compartir.", fr: "Ce repas n’a aucun aliment à partager.", it: "Questo pasto non ha alimenti da condividere.", nl: "Deze maaltijd heeft niets om te delen.", pt: "Essa refeição não tem alimentos para compartilhar.", ru: "В этом приёме пищи нечем поделиться." },
  "That recipe is gone.": { de: "Dieses Rezept gibt es nicht mehr.", es: "Esa receta ya no existe.", fr: "Cette recette n’existe plus.", it: "Questa ricetta non esiste più.", nl: "Dit recept bestaat niet meer.", pt: "Essa receita não existe mais.", ru: "Этого рецепта больше нет." },
  "There's nothing to undo.": { de: "Es gibt nichts rückgängig zu machen.", es: "No hay nada que deshacer.", fr: "Il n’y a rien à annuler.", it: "Non c’è niente da annullare.", nl: "Er is niets om ongedaan te maken.", pt: "Não há nada para desfazer.", ru: "Отменять нечего." },
  "This shared meal isn't available.": { de: "Diese geteilte Mahlzeit ist nicht verfügbar.", es: "Esta comida compartida no está disponible.", fr: "Ce repas partagé n’est pas disponible.", it: "Questo pasto condiviso non è disponibile.", nl: "Deze gedeelde maaltijd is niet beschikbaar.", pt: "Esta refeição compartilhada não está disponível.", ru: "Этот приём пищи больше недоступен." },
  "Use a YYYY-MM-DD date.": { de: "Gib ein Datum im Format JJJJ-MM-TT an.", es: "Usa una fecha con formato AAAA-MM-DD.", fr: "Indique une date au format AAAA-MM-JJ.", it: "Inserisci una data nel formato AAAA-MM-GG.", nl: "Gebruik een datum in de vorm JJJJ-MM-DD.", pt: "Use uma data no formato AAAA-MM-DD.", ru: "Укажите дату в формате ГГГГ-ММ-ДД." },
  "Weight entry not found.": { de: "Gewichtseintrag nicht gefunden.", es: "No se encontró ese registro de peso.", fr: "Pesée introuvable.", it: "Pesata non trovata.", nl: "Weging niet gevonden.", pt: "Pesagem não encontrada.", ru: "Запись о весе не найдена." },
  "You can't log food for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Essen eintragen.",
    es: "No puedes registrar comida en un día futuro.",
    fr: "Tu ne peux pas noter de repas pour un jour à venir.", it: "Non puoi registrare pasti per un giorno futuro.", nl: "Je kunt geen eten toevoegen voor een dag in de toekomst.", pt: "Você não pode registrar refeições em um dia futuro.", ru: "Нельзя записать еду на будущий день.",
  },
  "You can't log weight for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Gewicht eintragen.",
    es: "No puedes registrar el peso en un día futuro.",
    fr: "Tu ne peux pas noter de poids pour un jour à venir.", it: "Non puoi registrare il peso per un giorno futuro.", nl: "Je kunt geen gewicht toevoegen voor een dag in de toekomst.", pt: "Você não pode registrar o peso em um dia futuro.", ru: "Нельзя записать вес на будущий день.",
  },
  "from must be on or before to.": { de: "Das Startdatum darf nicht nach dem Enddatum liegen.",
    es: "La fecha inicial debe ser anterior o igual a la final.",
    fr: "La date de début doit être antérieure ou égale à la date de fin.", it: "La data di inizio deve essere uguale o precedente alla data di fine.", nl: "De begindatum mag niet na de einddatum liggen.", pt: "A data inicial precisa ser igual ou anterior à data final.", ru: "Начальная дата должна быть не позже конечной.",
  },

  // Photos, recordings and recognition.
  "Choose a JPEG, PNG, GIF, or WebP image.": { de: "Wähle ein JPEG-, PNG-, GIF- oder WebP-Bild.", es: "Elige una imagen JPEG, PNG, GIF o WebP.", fr: "Choisis une image JPEG, PNG, GIF ou WebP.", it: "Scegli un’immagine JPEG, PNG, GIF o WebP.", nl: "Kies een JPEG-, PNG-, GIF- of WebP-afbeelding.", pt: "Escolha uma imagem JPEG, PNG, GIF ou WebP.", ru: "Выберите изображение JPEG, PNG, GIF или WebP." },
  "Choose an image under 10 MB.": { de: "Wähle ein Bild unter 10 MB.", es: "Elige una imagen de menos de 10 MB.", fr: "Choisis une image de moins de 10 Mo.", it: "Scegli un’immagine sotto i 10 MB.", nl: "Kies een afbeelding kleiner dan 10 MB.", pt: "Escolha uma imagem com menos de 10 MB.", ru: "Выберите изображение меньше 10 МБ." },
  "List each of the meal's photos once.": { de: "Gib jedes Foto der Mahlzeit nur einmal an.", es: "Incluye cada foto de la comida una sola vez.", fr: "Indique chaque photo du repas une seule fois.", it: "Indica ogni foto del pasto una sola volta.", nl: "Geef elke foto van de maaltijd maar één keer op.", pt: "Informe cada foto da refeição só uma vez.", ru: "Укажите каждое фото приёма пищи один раз." },
  "Send the recording as WAV, M4A, MP3, OGG, FLAC or WebM.": { de: "Schick die Aufnahme als WAV, M4A, MP3, OGG, FLAC oder WebM.",
    es: "Envía la grabación en WAV, M4A, MP3, OGG, FLAC o WebM.",
    fr: "Envoie l’enregistrement en WAV, M4A, MP3, OGG, FLAC ou WebM.", it: "Invia la registrazione in formato WAV, M4A, MP3, OGG, FLAC o WebM.", nl: "Stuur de opname als WAV, M4A, MP3, OGG, FLAC of WebM.", pt: "Envie a gravação em WAV, M4A, MP3, OGG, FLAC ou WebM.", ru: "Отправьте запись в формате WAV, M4A, MP3, OGG, FLAC или WebM.",
  },
  "That recording is too long. Keep it under a few minutes.": { de: "Die Aufnahme ist zu lang. Bleib unter ein paar Minuten.",
    es: "La grabación es demasiado larga. Que dure unos pocos minutos como mucho.",
    fr: "Cet enregistrement est trop long. Ne dépasse pas quelques minutes.", it: "La registrazione è troppo lunga. Resta entro pochi minuti.", nl: "Deze opname is te lang. Houd het bij een paar minuten.", pt: "Essa gravação está longa demais. Mantenha em poucos minutos.", ru: "Запись слишком длинная. Уложитесь в несколько минут.",
  },
  "The image is empty.": { de: "Das Bild ist leer.", es: "La imagen está vacía.", fr: "L’image est vide.", it: "L’immagine è vuota.", nl: "De afbeelding is leeg.", pt: "A imagem está vazia.", ru: "Изображение пустое." },
  "The recording is empty.": { de: "Die Aufnahme ist leer.", es: "La grabación está vacía.", fr: "L’enregistrement est vide.", it: "La registrazione è vuota.", nl: "De opname is leeg.", pt: "A gravação está vazia.", ru: "Запись пустая." },
  "Upload not found.": { de: "Datei nicht gefunden.", es: "No se encontró el archivo.", fr: "Fichier introuvable.", it: "File non trovato.", nl: "Bestand niet gevonden.", pt: "Arquivo não encontrado.", ru: "Файл не найден." },
  "We couldn't make out any speech in that recording.": { de: "In dieser Aufnahme konnten wir keine Sprache erkennen.",
    es: "No pudimos entender nada en esa grabación.",
    fr: "Nous n’avons entendu aucune parole dans cet enregistrement.", it: "Non abbiamo sentito nessuna voce in questa registrazione.", nl: "We konden geen spraak verstaan in deze opname.", pt: "Não conseguimos ouvir nenhuma fala nessa gravação.", ru: "Не удалось разобрать речь в этой записи.",
  },
  "We couldn't read that. Try again or add the foods by hand.": { de: "Das konnten wir nicht lesen. Versuch es noch mal oder füge die Lebensmittel von Hand hinzu.",
    es: "No pudimos leerlo. Inténtalo de nuevo o añade los alimentos a mano.",
    fr: "Nous n’avons pas pu le lire. Réessaie ou ajoute les aliments à la main.", it: "Non siamo riusciti a leggerlo. Riprova o aggiungi gli alimenti a mano.", nl: "We konden dit niet lezen. Probeer het opnieuw of voeg de voedingsmiddelen zelf toe.", pt: "Não conseguimos ler isso. Tente de novo ou adicione os alimentos manualmente.", ru: "Не удалось это распознать. Попробуйте ещё раз или добавьте продукты вручную.",
  },
  "We don't know this barcode yet. Scan the nutrition label to add it.": { de: "Diesen Barcode kennen wir noch nicht. Scanne die Nährwerttabelle, um ihn hinzuzufügen.",
    es: "Aún no conocemos este código de barras. Escanea la etiqueta nutricional para añadirlo.",
    fr: "Nous ne connaissons pas encore ce code-barres. Scanne l’étiquette nutritionnelle pour l’ajouter.", it: "Non conosciamo ancora questo codice a barre. Scansiona l’etichetta nutrizionale per aggiungerlo.", nl: "Deze barcode kennen we nog niet. Scan de voedingswaardetabel om hem toe te voegen.", pt: "Ainda não conhecemos esse código de barras. Escaneie a tabela nutricional para adicioná-lo.", ru: "Мы пока не знаем этот штрихкод. Отсканируйте этикетку с пищевой ценностью, чтобы добавить его.",
  },

  // Coach.
  "Couldn't start talking. Try again in a moment.": { de: "Das Gespräch konnte nicht starten. Versuch es gleich noch mal.",
    es: "No se pudo empezar a hablar. Inténtalo de nuevo en un momento.",
    fr: "Impossible de lancer l’appel. Réessaie dans un instant.", it: "Impossibile avviare la chiamata. Riprova tra un attimo.", nl: "Het gesprek kon niet starten. Probeer het zo opnieuw.", pt: "Não foi possível iniciar a conversa. Tente de novo daqui a pouco.", ru: "Не удалось начать разговор. Попробуйте ещё раз через минуту.",
  },
  "Your coach is asleep: you've used this week's free minutes. Come back next week for more, or upgrade.": { de: "Dein Coach schläft: Du hast die Gratisminuten dieser Woche aufgebraucht. Komm nächste Woche wieder oder hol dir mehr mit einem Upgrade.",
    es: "Tu coach está durmiendo: ya usaste los minutos gratis de esta semana. Vuelve la próxima semana o mejora tu plan para tener más.",
    fr: "Ton coach dort\u202f: tu as utilisé les minutes gratuites de la semaine. Reviens la semaine prochaine ou passe à une formule supérieure pour en avoir plus.", it: "Il tuo coach sta riposando: hai usato i minuti gratuiti di questa settimana. Torna la settimana prossima o passa a un piano superiore per averne di più.", nl: "Je coach slaapt: je hebt de gratis minuten van deze week opgebruikt. Kom volgende week terug of upgrade voor meer.", pt: "Seu coach está descansando: você usou os minutos grátis desta semana. Volte na semana que vem ou faça upgrade para ter mais.", ru: "Ваш коуч спит: бесплатные минуты на эту неделю закончились. Возвращайтесь на следующей неделе или перейдите на платный тариф.",
  },
  "Talking isn't available right now.":{ de: "Sprechen ist gerade nicht möglich.", es: "Ahora mismo no se puede hablar.", fr: "Impossible de parler pour le moment.", it: "Al momento non è possibile parlare.", nl: "Praten kan op dit moment niet.", pt: "No momento não é possível conversar.", ru: "Разговор сейчас недоступен." },
  "That call is gone.": { de: "Dieses Gespräch gibt es nicht mehr.", es: "Esa llamada ya no existe.", fr: "Cet appel n’existe plus.", it: "Questa chiamata non esiste più.", nl: "Dit gesprek bestaat niet meer.", pt: "Essa chamada não existe mais.", ru: "Этого звонка больше нет." },
  "That conversation isn't yours.": { de: "Diese Unterhaltung gehört nicht dir.", es: "Esa conversación no es tuya.", fr: "Cette conversation n’est pas la tienne.", it: "Questa conversazione non è tua.", nl: "Dit gesprek is niet van jou.", pt: "Essa conversa não é sua.", ru: "Это не ваш разговор." },
  "That idea is gone.": { de: "Diese Idee gibt es nicht mehr.", es: "Esa idea ya no existe.", fr: "Cette idée n’existe plus.", it: "Questa idea non esiste più.", nl: "Dit idee bestaat niet meer.", pt: "Essa ideia não existe mais.", ru: "Этой идеи больше нет." },
  "That message is gone.": { de: "Diese Nachricht gibt es nicht mehr.", es: "Ese mensaje ya no existe.", fr: "Ce message n’existe plus.", it: "Questo messaggio non esiste più.", nl: "Dit bericht bestaat niet meer.", pt: "Essa mensagem não existe mais.", ru: "Этого сообщения больше нет." },
  "You've talked a lot lately. Try again later, or type instead.": { de: "Du hast in letzter Zeit viel gesprochen. Versuch es später noch mal oder schreib stattdessen.",
    es: "Has hablado mucho últimamente. Inténtalo más tarde o escribe.",
    fr: "Tu as beaucoup parlé ces derniers temps. Réessaie plus tard ou écris plutôt.", it: "Hai parlato molto ultimamente. Riprova più tardi o scrivi.", nl: "Je hebt de laatste tijd veel gepraat. Probeer het later opnieuw of typ je bericht.", pt: "Você conversou bastante nos últimos tempos. Tente de novo mais tarde ou escreva.", ru: "Вы много говорили в последнее время. Попробуйте позже или напишите.",
  },
  "You've used this week's minutes for talking. Type instead, or upgrade for more.": { de: "Du hast die Sprechminuten dieser Woche aufgebraucht. Schreib stattdessen oder hol dir mehr mit einem Upgrade.",
    es: "Ya usaste los minutos de voz de esta semana. Escribe o mejora tu plan para tener más.",
    fr: "Tu as utilisé tes minutes d’appel de la semaine. Écris plutôt ou passe à une formule supérieure pour en avoir plus.", it: "Hai usato i minuti di chiamata di questa settimana. Scrivi oppure passa a un piano superiore per averne di più.", nl: "Je hebt de spreekminuten van deze week opgebruikt. Typ je bericht of upgrade voor meer.", pt: "Você usou os minutos de conversa desta semana. Escreva ou faça upgrade para ter mais.", ru: "Минуты разговора на эту неделю закончились. Напишите или перейдите на тариф с большим лимитом.",
  },

  // Groups.
  "Group not found.": { de: "Gruppe nicht gefunden.", es: "No se encontró el grupo.", fr: "Groupe introuvable.", it: "Gruppo non trovato.", nl: "Groep niet gevonden.", pt: "Grupo não encontrado.", ru: "Группа не найдена." },
  "Members can only reply to comments from the group owner.": { de: "Mitglieder können nur auf Kommentare der Gruppenleitung antworten.",
    es: "Los miembros solo pueden responder a los comentarios del dueño del grupo.",
    fr: "Les membres ne peuvent répondre qu’aux commentaires du coach du groupe.", it: "I membri possono rispondere solo ai commenti del coach del gruppo.", nl: "Leden kunnen alleen reageren op opmerkingen van de coach van de groep.", pt: "Os membros só podem responder aos comentários do coach do grupo.", ru: "Участники могут отвечать только на комментарии владельца группы.",
  },
  "Owners don't share a diary with their own group.": { de: "Die Gruppenleitung teilt ihr Tagebuch nicht mit der eigenen Gruppe.",
    es: "Quien crea el grupo no comparte su diario con él.",
    fr: "Le coach ne partage pas son journal avec son propre groupe.", it: "Il coach non condivide il proprio diario con il suo gruppo.", nl: "De coach deelt geen dagboek met de eigen groep.", pt: "O coach não compartilha o próprio diário com o grupo.", ru: "Владелец не делится дневником со своей группой.",
  },
  "Reviewing members' days is part of Pro.": { de: "Tage der Mitglieder durchsehen gehört zu Pro.",
    es: "Revisar los días de los miembros es parte de Pro.",
    fr: "Vérifier les journées des membres fait partie de Pro.", it: "Rivedere le giornate dei membri fa parte di Pro.", nl: "Dagen van leden nakijken hoort bij Pro.", pt: "Revisar os dias dos membros faz parte do Pro.", ru: "Разбор дней участников входит в Pro.",
  },
  "That comment is not in this group.": { de: "Dieser Kommentar ist nicht in dieser Gruppe.", es: "Ese comentario no está en este grupo.", fr: "Ce commentaire n’est pas dans ce groupe.", it: "Questo commento non è in questo gruppo.", nl: "Deze opmerking hoort niet bij deze groep.", pt: "Esse comentário não está neste grupo.", ru: "Этого комментария нет в группе." },
  "This group doesn't share that with its owner.": { de: "Diese Gruppe teilt das nicht mit ihrer Leitung.",
    es: "Este grupo no comparte eso con su dueño.",
    fr: "Ce groupe ne partage pas ça avec son coach.", it: "Questo gruppo non lo condivide con il coach.", nl: "Deze groep deelt dat niet met de coach.", pt: "Este grupo não compartilha isso com o coach.", ru: "Эта группа не делится этим с владельцем.",
  },
  "This member has paused sharing their diary with the group.": { de: "Dieses Mitglied teilt sein Tagebuch gerade nicht mit der Gruppe.",
    es: "Este miembro pausó compartir su diario con el grupo.",
    fr: "Ce membre a mis en pause le partage de son journal avec le groupe.", it: "Questo membro ha messo in pausa la condivisione del diario con il gruppo.", nl: "Dit lid heeft het delen van het dagboek met de groep gepauzeerd.", pt: "Este membro pausou o compartilhamento do diário com o grupo.", ru: "Участник приостановил доступ группы к своему дневнику.",
  },
  "Write a message.": { de: "Schreib eine Nachricht.", es: "Escribe un mensaje.", fr: "Écris un message.", it: "Scrivi un messaggio.", nl: "Schrijf een bericht.", pt: "Escreva uma mensagem.", ru: "Напишите сообщение." },
  // Signing in and accounts, again.
  "Too many codes requested. Try again in a few minutes.": {
    de: "Zu viele Codes angefordert. Versuch es in ein paar Minuten noch mal.",
    es: "Pediste demasiados códigos. Inténtalo de nuevo en unos minutos.",
    fr: "Trop de codes demandés. Réessaie dans quelques minutes.", it: "Troppi codici richiesti. Riprova tra qualche minuto.", nl: "Te veel codes aangevraagd. Probeer het over een paar minuten opnieuw.", pt: "Muitos códigos solicitados. Tente de novo em alguns minutos.", ru: "Слишком много запросов кода. Попробуйте через несколько минут.",
  },
  "That Apple ID already opens another Btr.me account. Use a link code to join the two.": {
    de: "Mit dieser Apple-ID wird schon ein anderes Btr.me-Konto geöffnet. Verbinde die beiden mit einem Verknüpfungscode.",
    es: "Ese Apple ID ya abre otra cuenta de Btr.me. Usa un código de vinculación para unirlas.",
    fr: "Cet identifiant Apple ouvre déjà un autre compte Btr.me. Utilise un code de liaison pour réunir les deux.", it: "Questo ID Apple apre già un altro account Btr.me. Usa un codice di collegamento per unirli.", nl: "Deze Apple ID hoort al bij een ander Btr.me-account. Gebruik een koppelcode om ze samen te voegen.", pt: "Esse ID Apple já abre outra conta do Btr.me. Use um código de vinculação para juntar as duas.", ru: "Этот Apple ID уже открывает другой аккаунт Btr.me. Объедините их с помощью кода привязки.",
  },
  "Add another way to sign in before removing this one.": {
    de: "Füge erst eine andere Anmeldemethode hinzu, bevor du diese entfernst.",
    es: "Añade otra forma de iniciar sesión antes de quitar esta.",
    fr: "Ajoute un autre moyen de connexion avant de retirer celui-ci.", it: "Aggiungi un altro metodo di accesso prima di rimuovere questo.", nl: "Voeg eerst een andere manier van inloggen toe voordat je deze verwijdert.", pt: "Adicione outra forma de entrar antes de remover esta.", ru: "Добавьте другой способ входа, прежде чем удалять этот.",
  },
  "Telegram login expired. Try signing in again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Melde dich erneut an.",
    es: "La sesión de Telegram caducó. Vuelve a iniciar sesión.",
    fr: "La connexion Telegram a expiré. Réessaie de te connecter.", it: "L’accesso con Telegram è scaduto. Prova ad accedere di nuovo.", nl: "Je Telegram-sessie is verlopen. Log opnieuw in.", pt: "O login com o Telegram expirou. Tente entrar de novo.", ru: "Вход через Telegram истёк. Войдите снова.",
  },
  "Telegram login expired. Close and open the summary again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die Übersicht und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra el resumen y vuelve a abrirlo.",
    fr: "La connexion Telegram a expiré. Ferme le résumé et rouvre-le.", it: "L’accesso con Telegram è scaduto. Chiudi il riepilogo e riaprilo.", nl: "Je Telegram-sessie is verlopen. Sluit het overzicht en open het opnieuw.", pt: "O login com o Telegram expirou. Feche o resumo e abra de novo.", ru: "Вход через Telegram истёк. Закройте сводку и откройте её снова.",
  },

  // Plans and purchases.
  "Creating groups is part of Plus and Pro.": {
    de: "Gruppen erstellen gehört zu Plus und Pro.",
    es: "Crear grupos es parte de Plus y Pro.",
    fr: "Créer des groupes fait partie de Plus et Pro.", it: "La creazione di gruppi fa parte di Plus e Pro.", nl: "Groepen maken hoort bij Plus en Pro.", pt: "Criar grupos faz parte do Plus e do Pro.", ru: "Создание групп входит в Plus и Pro.",
  },
  "That purchase is for another app.": { de: "Dieser Kauf gehört zu einer anderen App.", es: "Esa compra es de otra app.", fr: "Cet achat concerne une autre app.", it: "Questo acquisto è per un’altra app.", nl: "Deze aankoop hoort bij een andere app.", pt: "Essa compra é de outro app.", ru: "Эта покупка относится к другому приложению." },
  "That isn't a Btr.me plan.": { de: "Das ist kein Btr.me-Plan.", es: "Ese no es un plan de Btr.me.", fr: "Ce n’est pas une formule Btr.me.", it: "Questo non è un piano Btr.me.", nl: "Dit is geen Btr.me-abonnement.", pt: "Esse não é um plano do Btr.me.", ru: "Это не тариф Btr.me." },
  "This subscription belongs to another Btr.me account.": {
    de: "Dieses Abo gehört zu einem anderen Btr.me-Konto.",
    es: "Esta suscripción pertenece a otra cuenta de Btr.me.",
    fr: "Cet abonnement appartient à un autre compte Btr.me.", it: "Questo abbonamento appartiene a un altro account Btr.me.", nl: "Dit abonnement hoort bij een ander Btr.me-account.", pt: "Esta assinatura pertence a outra conta do Btr.me.", ru: "Эта подписка привязана к другому аккаунту Btr.me.",
  },
  "This coach has no spots left for new clients. Ask them to make room.": {
    de: "Bei diesem Coach ist kein Platz mehr für neue Klienten frei. Bitte um einen freien Platz.",
    es: "Este coach no tiene plazas para clientes nuevos. Pídele que haga sitio.",
    fr: "Ce coach n’a plus de place pour de nouveaux clients. Demande-lui de libérer une place.", it: "Questo coach non ha più posti per nuovi clienti. Chiedigli di liberarne uno.", nl: "Deze coach heeft geen plek meer voor nieuwe cliënten. Vraag de coach om ruimte te maken.", pt: "Este coach não tem mais vagas para novos clientes. Peça para abrir uma vaga.", ru: "У этого коуча нет мест для новых клиентов. Попросите освободить место.",
  },

  // FatSecret.
  "FatSecret isn't available right now.": { de: "FatSecret ist gerade nicht verfügbar.", es: "FatSecret no está disponible ahora mismo.", fr: "FatSecret n’est pas disponible pour le moment.", it: "FatSecret non è disponibile al momento.", nl: "FatSecret is op dit moment niet beschikbaar.", pt: "O FatSecret não está disponível no momento.", ru: "FatSecret сейчас недоступен." },
  "Connect FatSecret first.": { de: "Verbinde zuerst FatSecret.", es: "Conecta FatSecret primero.", fr: "Connecte d’abord FatSecret.", it: "Prima collega FatSecret.", nl: "Koppel eerst FatSecret.", pt: "Conecte o FatSecret primeiro.", ru: "Сначала подключите FatSecret." },

  // Meals and reminders.
  "Meal not found": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", fr: "Repas introuvable", it: "Pasto non trovato", nl: "Maaltijd niet gevonden", pt: "Refeição não encontrada", ru: "Приём пищи не найден." },
  "Meal item not found": { de: "Eintrag nicht gefunden.", es: "No se encontró ese alimento.", fr: "Aliment introuvable", it: "Alimento non trovato", nl: "Item niet gevonden", pt: "Alimento não encontrado", ru: "Продукт в приёме пищи не найден." },
  "Reminder not found": { de: "Erinnerung nicht gefunden.", es: "No se encontró el recordatorio.", fr: "Rappel introuvable", it: "Promemoria non trovato", nl: "Herinnering niet gevonden", pt: "Lembrete não encontrado", ru: "Напоминание не найдено." },
  "Save a timezone before changing reminders": {
    de: "Speichere eine Zeitzone, bevor du Erinnerungen änderst.",
    es: "Guarda una zona horaria antes de cambiar los recordatorios.",
    fr: "Enregistre un fuseau horaire avant de modifier les rappels", it: "Salva un fuso orario prima di modificare i promemoria", nl: "Sla een tijdzone op voordat je herinneringen wijzigt", pt: "Salve um fuso horário antes de alterar os lembretes", ru: "Сохраните часовой пояс, прежде чем менять напоминания.",
  },

  // Groups, again.
  "Choose a smaller image.": { de: "Wähle ein kleineres Bild.", es: "Elige una imagen más pequeña.", fr: "Choisis une image plus petite.", it: "Scegli un’immagine più piccola.", nl: "Kies een kleinere afbeelding.", pt: "Escolha uma imagem menor.", ru: "Выберите изображение поменьше." },
  "Choose a group name.": { de: "Gib der Gruppe einen Namen.", es: "Ponle un nombre al grupo.", fr: "Choisis un nom de groupe.", it: "Scegli un nome per il gruppo.", nl: "Kies een naam voor de groep.", pt: "Escolha um nome para o grupo.", ru: "Придумайте название группы." },
  "Choose a shorter group name.": { de: "Wähle einen kürzeren Gruppennamen.", es: "Elige un nombre de grupo más corto.", fr: "Choisis un nom de groupe plus court.", it: "Scegli un nome del gruppo più corto.", nl: "Maak de groepsnaam korter.", pt: "Escolha um nome de grupo mais curto.", ru: "Сократите название группы." },
  "Choose a shorter description.": { de: "Wähle eine kürzere Beschreibung.", es: "Elige una descripción más corta.", fr: "Choisis une description plus courte.", it: "Scegli una descrizione più corta.", nl: "Maak de beschrijving korter.", pt: "Escolha uma descrição mais curta.", ru: "Сократите описание." },
  "Choose a shorter message.": { de: "Schreib eine kürzere Nachricht.", es: "Escribe un mensaje más corto.", fr: "Écris un message plus court.", it: "Scrivi un messaggio più corto.", nl: "Maak het bericht korter.", pt: "Escreva uma mensagem mais curta.", ru: "Сократите сообщение." },
  "Choose a shorter note.": { de: "Schreib eine kürzere Notiz.", es: "Escribe una nota más corta.", fr: "Écris une note plus courte.", it: "Scrivi una nota più corta.", nl: "Maak de notitie korter.", pt: "Escreva uma nota mais curta.", ru: "Сократите заметку." },
  "Choose a shorter title.": { de: "Wähle einen kürzeren Titel.", es: "Elige un título más corto.", fr: "Choisis un titre plus court.", it: "Scegli un titolo più corto.", nl: "Maak de titel korter.", pt: "Escolha um título mais curto.", ru: "Сократите заголовок." },
  "Choose a shorter notice.": { de: "Schreib eine kürzere Mitteilung.", es: "Escribe un aviso más corto.", fr: "Écris une annonce plus courte.", it: "Scrivi un avviso più corto.", nl: "Maak de mededeling korter.", pt: "Escreva um aviso mais curto.", ru: "Сократите объявление." },
  "Choose a name, description, or image to update.": {
    de: "Wähle einen Namen, eine Beschreibung oder ein Bild zum Ändern.",
    es: "Elige un nombre, una descripción o una imagen para cambiar.",
    fr: "Choisis un nom, une description ou une image à modifier.", it: "Scegli un nome, una descrizione o un’immagine da modificare.", nl: "Kies een naam, beschrijving of afbeelding om te wijzigen.", pt: "Escolha um nome, uma descrição ou uma imagem para alterar.", ru: "Выберите, что изменить: название, описание или изображение.",
  },
  "Choose at least one thing members share.": {
    de: "Wähle mindestens eine Sache, die Mitglieder teilen.",
    es: "Elige al menos una cosa que compartan los miembros.",
    fr: "Choisis au moins une chose que les membres partagent.", it: "Scegli almeno una cosa che i membri condividono.", nl: "Kies minstens één ding dat leden delen.", pt: "Escolha pelo menos uma coisa que os membros compartilham.", ru: "Выберите хотя бы одно, чем делятся участники.",
  },
  "Could not create that group.": { de: "Die Gruppe konnte nicht erstellt werden.", es: "No se pudo crear el grupo.", fr: "Impossible de créer ce groupe.", it: "Impossibile creare il gruppo.", nl: "De groep kon niet worden gemaakt.", pt: "Não foi possível criar o grupo.", ru: "Не удалось создать группу." },
  "Give the notice a title.": { de: "Gib der Mitteilung einen Titel.", es: "Ponle un título al aviso.", fr: "Donne un titre à l’annonce.", it: "Dai un titolo all’avviso.", nl: "Geef de mededeling een titel.", pt: "Dê um título ao aviso.", ru: "Добавьте заголовок объявления." },
  "Write the notice.": { de: "Schreib die Mitteilung.", es: "Escribe el aviso.", fr: "Écris l’annonce.", it: "Scrivi l’avviso.", nl: "Schrijf de mededeling.", pt: "Escreva o aviso.", ru: "Напишите объявление." },
  "Notice not found.": { de: "Mitteilung nicht gefunden.", es: "No se encontró el aviso.", fr: "Annonce introuvable.", it: "Avviso non trovato.", nl: "Mededeling niet gevonden.", pt: "Aviso não encontrado.", ru: "Объявление не найдено." },
  "Only the group owner can post notices; you cannot edit them.": {
    de: "Nur die Gruppenleitung kann Mitteilungen posten; du kannst sie nicht bearbeiten.",
    es: "Solo quien creó el grupo puede publicar avisos; tú no puedes editarlos.",
    fr: "Seul le coach du groupe peut publier des annonces\u202f; tu ne peux pas les modifier.", it: "Solo il coach del gruppo può pubblicare avvisi; tu non puoi modificarli.", nl: "Alleen de coach van de groep kan mededelingen plaatsen; je kunt ze niet bewerken.", pt: "Só o coach do grupo pode publicar avisos; você não pode editá-los.", ru: "Объявления публикует только владелец группы; изменить их вы не можете.",
  },
  "Invite not found.": { de: "Einladung nicht gefunden.", es: "No se encontró la invitación.", fr: "Invitation introuvable.", it: "Invito non trovato.", nl: "Uitnodiging niet gevonden.", pt: "Convite não encontrado.", ru: "Приглашение не найдено." },
  "That invite link is not valid.": { de: "Dieser Einladungslink ist ungültig.", es: "Ese enlace de invitación no es válido.", fr: "Ce lien d’invitation n’est pas valide.", it: "Questo link d’invito non è valido.", nl: "Deze uitnodigingslink is ongeldig.", pt: "Esse link de convite não é válido.", ru: "Эта ссылка-приглашение недействительна." },
  "You are not a member of that group.": { de: "Du bist kein Mitglied dieser Gruppe.", es: "No eres miembro de ese grupo.", fr: "Tu n’es pas membre de ce groupe.", it: "Non sei un membro di questo gruppo.", nl: "Je bent geen lid van deze groep.", pt: "Você não é membro desse grupo.", ru: "Вы не участник этой группы." },
  "You are not in that group.": { de: "Du bist nicht in dieser Gruppe.", es: "No estás en ese grupo.", fr: "Tu ne fais pas partie de ce groupe.", it: "Non fai parte di questo gruppo.", nl: "Je zit niet in deze groep.", pt: "Você não está nesse grupo.", ru: "Вас нет в этой группе." },
  "That person is not in this group.": { de: "Diese Person ist nicht in der Gruppe.", es: "Esa persona no está en este grupo.", fr: "Cette personne ne fait pas partie de ce groupe.", it: "Questa persona non fa parte di questo gruppo.", nl: "Deze persoon zit niet in deze groep.", pt: "Essa pessoa não está neste grupo.", ru: "Этого человека нет в группе." },
  "Owners can delete the group instead of leaving.": {
    de: "Als Gruppenleitung kannst du die Gruppe löschen, statt sie zu verlassen.",
    es: "Quien creó el grupo puede eliminarlo en lugar de salir.",
    fr: "Le coach peut supprimer le groupe au lieu de le quitter.", it: "Il coach può eliminare il gruppo invece di uscirne.", nl: "Als coach kun je de groep verwijderen in plaats van hem te verlaten.", pt: "O coach pode apagar o grupo em vez de sair.", ru: "Владелец может удалить группу, но не выйти из неё.",
  },
  "Owners cannot be removed.": { de: "Die Gruppenleitung kann nicht entfernt werden.", es: "No se puede quitar a quien creó el grupo.", fr: "Le coach ne peut pas être retiré.", it: "Il coach non può essere rimosso.", nl: "De coach kan niet worden verwijderd.", pt: "O coach não pode ser removido.", ru: "Владельца нельзя удалить из группы." },
  "You cannot edit that group.": { de: "Du kannst diese Gruppe nicht bearbeiten.", es: "No puedes editar ese grupo.", fr: "Tu ne peux pas modifier ce groupe.", it: "Non puoi modificare questo gruppo.", nl: "Je kunt deze groep niet bewerken.", pt: "Você não pode editar esse grupo.", ru: "Вы не можете изменить эту группу." },
  "You cannot review that group.": { de: "Du kannst die Tage dieser Gruppe nicht durchsehen.", es: "No puedes revisar ese grupo.", fr: "Tu ne peux pas vérifier ce groupe.", it: "Non puoi rivedere le giornate di questo gruppo.", nl: "Je kunt de dagen van deze groep niet nakijken.", pt: "Você não pode revisar os dias desse grupo.", ru: "Вы не можете проверять дни этой группы." },
  "That day hasn't happened yet": { de: "Dieser Tag kommt erst noch.", es: "Ese día todavía no ha llegado.", fr: "Ce jour n’est pas encore arrivé", it: "Questo giorno non è ancora arrivato", nl: "Deze dag is nog niet geweest", pt: "Esse dia ainda não chegou", ru: "Этот день ещё не наступил." },
  "React with one emoji.": { de: "Reagiere mit einem Emoji.", es: "Reacciona con un emoji.", fr: "Réagis avec un seul emoji.", it: "Reagisci con una sola emoji.", nl: "Reageer met één emoji.", pt: "Reaja com um só emoji.", ru: "Отреагируйте одним эмодзи." },
};

// Messages with a value in them, matched on the English and rewritten with that value.
const TEMPLATES: { english: RegExp; de: string; es: string; fr: string; it: string; nl: string; pt: string; ru: string }[] = [
  {
    english: /^Choose one of: (.+)\.$/,
    de: "Wähle eins davon: $1.",
    es: "Elige una de estas opciones: $1.",
    fr: "Choisis parmi\u202f: $1.",
    it: "Scegli tra: $1.",
    nl: "Kies een van deze opties: $1.",
    pt: "Escolha uma destas opções: $1.",
    ru: "Выберите одно из: $1.",
  },
  {
    english: /^Your plan includes up to (\d+) groups\.$/,
    de: "Dein Plan umfasst bis zu $1 Gruppen.",
    es: "Tu plan incluye hasta $1 grupos.",
    fr: "Ta formule comprend jusqu’à $1 groupes.",
    it: "Il tuo piano include fino a $1 gruppi.",
    nl: "Je abonnement omvat maximaal $1 groepen.",
    pt: "Seu plano inclui até $1 grupos.",
    ru: "Ваш тариф включает до $1 групп.",
  },
  {
    english: /^Attach up to (\d+) photos\.$/,
    de: "Hänge bis zu $1 Fotos an.",
    es: "Adjunta hasta $1 fotos.",
    fr: "Joins jusqu’à $1 photos.",
    it: "Allega fino a $1 foto.",
    nl: "Voeg maximaal $1 foto’s toe.",
    pt: "Anexe até $1 fotos.",
    ru: "Прикрепите не больше $1 фото.",
  },
  {
    english: /^A meal can have at most (\d+) items$/,
    de: "Eine Mahlzeit kann höchstens $1 Einträge haben.",
    es: "Una comida puede tener como máximo $1 alimentos.",
    fr: "Un repas peut contenir au maximum $1 aliments.",
    it: "Un pasto può contenere al massimo $1 alimenti.",
    nl: "Een maaltijd kan maximaal $1 items hebben.",
    pt: "Uma refeição pode ter no máximo $1 alimentos.",
    ru: "В приёме пищи может быть не больше $1 продуктов.",
  },
  {
    english: /^Product not found for barcode (\S+)\.$/,
    de: "Kein Produkt zum Barcode $1 gefunden.",
    es: "No se encontró ningún producto con el código de barras $1.",
    fr: "Aucun produit trouvé pour le code-barres $1.",
    it: "Nessun prodotto trovato per il codice a barre $1.",
    nl: "Geen product gevonden voor barcode $1.",
    pt: "Nenhum produto encontrado com o código de barras $1.",
    ru: "Продукт со штрихкодом $1 не найден.",
  },
  {
    english: /^We know (.+) but not its nutrition yet\. Scan the nutrition label to add it\.$/,
    de: "„$1“ kennen wir, aber noch nicht die Nährwerte. Scanne die Nährwerttabelle, um sie hinzuzufügen.",
    es: "Conocemos «$1», pero aún no su información nutricional. Escanea la etiqueta nutricional para añadirla.",
    fr: "Nous connaissons «\u202f$1\u202f», mais pas encore ses valeurs nutritionnelles. Scanne l’étiquette nutritionnelle pour les ajouter.",
    it: "Conosciamo “$1”, ma non ancora i suoi valori nutrizionali. Scansiona l’etichetta nutrizionale per aggiungerli.",
    nl: "We kennen “$1”, maar de voedingswaarden nog niet. Scan de voedingswaardetabel om ze toe te voegen.",
    pt: "Conhecemos “$1”, mas ainda não as informações nutricionais. Escaneie a tabela nutricional para adicioná-las.",
    ru: "Продукт «$1» нам известен, но его пищевой ценности пока нет. Отсканируйте этикетку, чтобы добавить её.",
  },
  // Goals: the goal's name comes in lower case.
  ...(
    [
      ["calories", "kcal", { de: "Kalorien", es: "Las calorías diarias deben", fr: "les calories", it: "calorie", nl: "calorieën", pt: "calorias", ru: "Калории" }],
      ["protein", "grams", { de: "Eiweiß", es: "La proteína diaria debe", fr: "les protéines", it: "proteine", nl: "eiwit", pt: "proteínas", ru: "Белок" }],
      ["carbs", "grams", { de: "Kohlenhydrate", es: "Los carbohidratos diarios deben", fr: "les glucides", it: "carboidrati", nl: "koolhydraten", pt: "carboidratos", ru: "Углеводы" }],
      ["fat", "grams", { de: "Fett", es: "La grasa diaria debe", fr: "les lipides", it: "grassi", nl: "vet", pt: "gorduras", ru: "Жиры" }],
      ["fiber", "grams", { de: "Ballaststoffe", es: "La fibra diaria debe", fr: "les fibres", it: "fibre", nl: "vezels", pt: "fibras", ru: "Клетчатка" }],
    ] as const
  ).map(([label, unit, name]) => {
    const short = unit === "kcal" ? { de: "kcal", es: "kcal", fr: "kcal", it: "kcal", nl: "kcal", pt: "kcal", ru: "ккал" } : { de: "g", es: "g", fr: "g", it: "g", nl: "g", pt: "g", ru: "г" };
    return {
      english: new RegExp(`^Daily ${label} must be a whole number from (\\d+) to (\\d+) ${unit}\\.$`),
      de: `Tageswert für ${name.de}: eine ganze Zahl von $1 bis $2 ${short.de}.`,
      es: `${name.es} ser un número entero de $1 a $2 ${short.es}.`,
      fr: `Objectif quotidien pour ${name.fr}\u202f: un nombre entier de $1 à $2 ${short.fr}.`,
      it: `Obiettivo giornaliero di ${name.it}: un numero intero da $1 a $2 ${short.it}.`,
      nl: `Dagdoel voor ${name.nl}: een heel getal van $1 tot $2 ${short.nl}.`,
      pt: `Meta diária de ${name.pt}: um número inteiro de $1 a $2 ${short.pt}.`,
      ru: `${name.ru} в день: целое число от $1 до $2 ${short.ru}.`,
    };
  }),
];

export function translateErrorMessage(message: string, locale: Locale): string {
  if (locale === "en") {
    return message;
  }
  const known = MESSAGES[message]?.[locale];
  if (known) {
    return known;
  }
  const template = TEMPLATES.find(({ english }) => english.test(message));
  return template ? message.replace(template.english, template[locale]) : message;
}
