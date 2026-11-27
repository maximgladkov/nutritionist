import type { Locale } from "../i18n/locales.ts";

type Translated = { de: string; es: string; fr: string; ru: string };

// Error messages the API writes in English, in the other languages the app speaks. Keyed by the
// English text, so throw sites stay as they are and toApiError can keep reading English to pick a
// status. Messages with a value in them are in TEMPLATES below; developer-facing ones stay English.
const MESSAGES: Record<string, Translated> = {
  // Defaults and the router's own.
  "Invalid request.": { de: "Ungültige Anfrage.", es: "La solicitud no es válida.", fr: "Requête invalide.", ru: "Неверный запрос." },
  "Method not allowed.": { de: "Methode nicht erlaubt.", es: "Método no permitido.", fr: "Méthode non autorisée.", ru: "Метод не поддерживается." },
  "No such endpoint.": { de: "Diese Adresse gibt es nicht.", es: "Esa dirección no existe.", fr: "Cette adresse n’existe pas.", ru: "Такого адреса нет." },
  "Not found.": { de: "Nicht gefunden.", es: "No se encontró.", fr: "Introuvable.", ru: "Не найдено." },
  "Sign in to continue.": { de: "Melde dich an, um weiterzumachen.", es: "Inicia sesión para continuar.", fr: "Connecte-toi pour continuer.", ru: "Войдите, чтобы продолжить." },
  "Something went wrong.": { de: "Etwas ist schiefgelaufen.", es: "Algo salió mal.", fr: "Un problème est survenu.", ru: "Что-то пошло не так." },
  "You cannot do that.": { de: "Das kannst du nicht tun.", es: "No puedes hacer eso.", fr: "Tu ne peux pas faire ça.", ru: "Это действие вам недоступно." },

  // Signing in.
  "Apple sign-in failed. Try again.": { de: "Anmeldung mit Apple fehlgeschlagen. Versuch es noch mal.",
    es: "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.",
    fr: "La connexion avec Apple a échoué. Réessaie.", ru: "Не удалось войти через Apple. Попробуйте ещё раз.",
  },
  "Open this from the Telegram bot.": { de: "Öffne das aus dem Telegram-Bot.", es: "Ábrelo desde el bot de Telegram.", fr: "Ouvre ceci depuis le bot Telegram.", ru: "Откройте это из бота в Telegram." },
  "Sign in again.": { de: "Melde dich erneut an.", es: "Vuelve a iniciar sesión.", fr: "Reconnecte-toi.", ru: "Войдите снова." },
  "Telegram is not configured.": { de: "Telegram ist nicht eingerichtet.", es: "Telegram no está configurado.", fr: "Telegram n’est pas configuré.", ru: "Telegram не настроен." },
  "Telegram login expired. Close and open the app again.": { de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die App und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra la app y vuelve a abrirla.",
    fr: "La connexion Telegram a expiré. Ferme l’app et rouvre-la.", ru: "Вход через Telegram истёк. Закройте приложение и откройте его снова.",
  },
  "That code expired. Request a new one.": { de: "Dieser Code ist abgelaufen. Fordere einen neuen an.",
    es: "Ese código caducó. Pide uno nuevo.",
    fr: "Ce code a expiré. Demandes-en un nouveau.", ru: "Срок действия кода истёк. Запросите новый.",
  },
  "That code is not correct.": { de: "Dieser Code ist nicht richtig.", es: "Ese código no es correcto.", fr: "Ce code n’est pas correct.", ru: "Неверный код." },
  "That code is not valid or expired.": { de: "Dieser Code ist ungültig oder abgelaufen.",
    es: "Ese código no es válido o ha caducado.",
    fr: "Ce code n’est pas valide ou a expiré.", ru: "Код недействителен или его срок истёк.",
  },
  "Your session expired. Refresh the token or sign in again.": { de: "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
    es: "Tu sesión caducó. Vuelve a iniciar sesión.",
    fr: "Ta session a expiré. Reconnecte-toi.", ru: "Сессия истекла. Войдите снова.",
  },

  // Account.
  "Account not found.": { de: "Konto nicht gefunden.", es: "No se encontró la cuenta.", fr: "Compte introuvable.", ru: "Аккаунт не найден." },
  "Choose a valid country.": { de: "Wähle ein gültiges Land.", es: "Elige un país válido.", fr: "Choisis un pays valide.", ru: "Выберите страну из списка." },
  "Choose a valid time zone.": { de: "Wähle eine gültige Zeitzone.", es: "Elige una zona horaria válida.", fr: "Choisis un fuseau horaire valide.", ru: "Выберите часовой пояс из списка." },
  "That account is not linked.": { de: "Dieses Konto ist nicht verknüpft.", es: "Esa cuenta no está vinculada.", fr: "Ce compte n’est pas associé.", ru: "Этот аккаунт не привязан." },
  "There's no photo on your Telegram account.": { de: "Dein Telegram-Konto hat kein Foto.",
    es: "Tu cuenta de Telegram no tiene foto.",
    fr: "Ton compte Telegram n’a pas de photo.", ru: "В вашем аккаунте Telegram нет фото.",
  },

  // Diary, foods and meals.
  "Each saved food needs a name.": { de: "Jedes gespeicherte Lebensmittel braucht einen Namen.", es: "Cada alimento guardado necesita un nombre.", fr: "Chaque aliment enregistré doit avoir un nom.", ru: "У каждого сохранённого продукта должно быть название." },
  "Meal not found.": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", fr: "Repas introuvable.", ru: "Приём пищи не найден." },
  "Photo not found.": { de: "Foto nicht gefunden.", es: "No se encontró la foto.", fr: "Photo introuvable.", ru: "Фото не найдено." },
  "Recipe not found.": { de: "Rezept nicht gefunden.", es: "No se encontró la receta.", fr: "Recette introuvable.", ru: "Рецепт не найден." },
  "Saved meal not found.": { de: "Gespeicherte Mahlzeit nicht gefunden.", es: "No se encontró la comida guardada.", fr: "Repas enregistré introuvable.", ru: "Сохранённый приём пищи не найден." },
  "That food is not in the catalog.": { de: "Dieses Lebensmittel ist nicht im Katalog.", es: "Ese alimento no está en el catálogo.", fr: "Cet aliment n’est pas dans le catalogue.", ru: "Этого продукта нет в каталоге." },
  "That food is not in this member's diary.": { de: "Dieses Lebensmittel ist nicht im Tagebuch dieses Mitglieds.",
    es: "Ese alimento no está en el diario de este miembro.",
    fr: "Cet aliment n’est pas dans le journal de ce membre.", ru: "Этого продукта нет в дневнике участника.",
  },
  "That item id is already taken. Try again.": { de: "Diese ID ist schon vergeben. Versuch es noch mal.",
    es: "Ese identificador ya está en uso. Inténtalo de nuevo.",
    fr: "Cet identifiant est déjà pris. Réessaie.", ru: "Этот идентификатор уже занят. Попробуйте ещё раз.",
  },
  "That meal has no foods to save.": { de: "Diese Mahlzeit enthält nichts zum Speichern.", es: "Esa comida no tiene alimentos que guardar.", fr: "Ce repas n’a aucun aliment à enregistrer.", ru: "В этом приёме пищи нечего сохранить." },
  "That meal has no foods to share.": { de: "Diese Mahlzeit enthält nichts zum Teilen.", es: "Esa comida no tiene alimentos que compartir.", fr: "Ce repas n’a aucun aliment à partager.", ru: "В этом приёме пищи нечем поделиться." },
  "That recipe is gone.": { de: "Dieses Rezept gibt es nicht mehr.", es: "Esa receta ya no existe.", fr: "Cette recette n’existe plus.", ru: "Этого рецепта больше нет." },
  "There's nothing to undo.": { de: "Es gibt nichts rückgängig zu machen.", es: "No hay nada que deshacer.", fr: "Il n’y a rien à annuler.", ru: "Отменять нечего." },
  "This shared meal isn't available.": { de: "Diese geteilte Mahlzeit ist nicht verfügbar.", es: "Esta comida compartida no está disponible.", fr: "Ce repas partagé n’est pas disponible.", ru: "Этот приём пищи больше недоступен." },
  "Use a YYYY-MM-DD date.": { de: "Gib ein Datum im Format JJJJ-MM-TT an.", es: "Usa una fecha con formato AAAA-MM-DD.", fr: "Indique une date au format AAAA-MM-JJ.", ru: "Укажите дату в формате ГГГГ-ММ-ДД." },
  "Weight entry not found.": { de: "Gewichtseintrag nicht gefunden.", es: "No se encontró ese registro de peso.", fr: "Pesée introuvable.", ru: "Запись о весе не найдена." },
  "You can't log food for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Essen eintragen.",
    es: "No puedes registrar comida en un día futuro.",
    fr: "Tu ne peux pas noter de repas pour un jour à venir.", ru: "Нельзя записать еду на будущий день.",
  },
  "You can't log weight for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Gewicht eintragen.",
    es: "No puedes registrar el peso en un día futuro.",
    fr: "Tu ne peux pas noter de poids pour un jour à venir.", ru: "Нельзя записать вес на будущий день.",
  },
  "from must be on or before to.": { de: "Das Startdatum darf nicht nach dem Enddatum liegen.",
    es: "La fecha inicial debe ser anterior o igual a la final.",
    fr: "La date de début doit être antérieure ou égale à la date de fin.", ru: "Начальная дата должна быть не позже конечной.",
  },

  // Photos, recordings and recognition.
  "Choose a JPEG, PNG, GIF, or WebP image.": { de: "Wähle ein JPEG-, PNG-, GIF- oder WebP-Bild.", es: "Elige una imagen JPEG, PNG, GIF o WebP.", fr: "Choisis une image JPEG, PNG, GIF ou WebP.", ru: "Выберите изображение JPEG, PNG, GIF или WebP." },
  "Choose an image under 10 MB.": { de: "Wähle ein Bild unter 10 MB.", es: "Elige una imagen de menos de 10 MB.", fr: "Choisis une image de moins de 10 Mo.", ru: "Выберите изображение меньше 10 МБ." },
  "List each of the meal's photos once.": { de: "Gib jedes Foto der Mahlzeit nur einmal an.", es: "Incluye cada foto de la comida una sola vez.", fr: "Indique chaque photo du repas une seule fois.", ru: "Укажите каждое фото приёма пищи один раз." },
  "Send the recording as WAV, M4A, MP3, OGG, FLAC or WebM.": { de: "Schick die Aufnahme als WAV, M4A, MP3, OGG, FLAC oder WebM.",
    es: "Envía la grabación en WAV, M4A, MP3, OGG, FLAC o WebM.",
    fr: "Envoie l’enregistrement en WAV, M4A, MP3, OGG, FLAC ou WebM.", ru: "Отправьте запись в формате WAV, M4A, MP3, OGG, FLAC или WebM.",
  },
  "That recording is too long. Keep it under a few minutes.": { de: "Die Aufnahme ist zu lang. Bleib unter ein paar Minuten.",
    es: "La grabación es demasiado larga. Que dure unos pocos minutos como mucho.",
    fr: "Cet enregistrement est trop long. Ne dépasse pas quelques minutes.", ru: "Запись слишком длинная. Уложитесь в несколько минут.",
  },
  "The image is empty.": { de: "Das Bild ist leer.", es: "La imagen está vacía.", fr: "L’image est vide.", ru: "Изображение пустое." },
  "The recording is empty.": { de: "Die Aufnahme ist leer.", es: "La grabación está vacía.", fr: "L’enregistrement est vide.", ru: "Запись пустая." },
  "Upload not found.": { de: "Datei nicht gefunden.", es: "No se encontró el archivo.", fr: "Fichier introuvable.", ru: "Файл не найден." },
  "We couldn't make out any speech in that recording.": { de: "In dieser Aufnahme konnten wir keine Sprache erkennen.",
    es: "No pudimos entender nada en esa grabación.",
    fr: "Nous n’avons entendu aucune parole dans cet enregistrement.", ru: "Не удалось разобрать речь в этой записи.",
  },
  "We couldn't read that. Try again or add the foods by hand.": { de: "Das konnten wir nicht lesen. Versuch es noch mal oder füge die Lebensmittel von Hand hinzu.",
    es: "No pudimos leerlo. Inténtalo de nuevo o añade los alimentos a mano.",
    fr: "Nous n’avons pas pu le lire. Réessaie ou ajoute les aliments à la main.", ru: "Не удалось это распознать. Попробуйте ещё раз или добавьте продукты вручную.",
  },
  "We don't know this barcode yet. Scan the nutrition label to add it.": { de: "Diesen Barcode kennen wir noch nicht. Scanne die Nährwerttabelle, um ihn hinzuzufügen.",
    es: "Aún no conocemos este código de barras. Escanea la etiqueta nutricional para añadirlo.",
    fr: "Nous ne connaissons pas encore ce code-barres. Scanne l’étiquette nutritionnelle pour l’ajouter.", ru: "Мы пока не знаем этот штрихкод. Отсканируйте этикетку с пищевой ценностью, чтобы добавить его.",
  },

  // Coach.
  "Couldn't start talking. Try again in a moment.": { de: "Das Gespräch konnte nicht starten. Versuch es gleich noch mal.",
    es: "No se pudo empezar a hablar. Inténtalo de nuevo en un momento.",
    fr: "Impossible de lancer l’appel. Réessaie dans un instant.", ru: "Не удалось начать разговор. Попробуйте ещё раз через минуту.",
  },
  "Your coach is asleep: you've used this week's free minutes. Come back next week for more, or upgrade.": { de: "Dein Coach schläft: Du hast die Gratisminuten dieser Woche aufgebraucht. Komm nächste Woche wieder oder hol dir mehr mit einem Upgrade.",
    es: "Tu coach está durmiendo: ya usaste los minutos gratis de esta semana. Vuelve la próxima semana o mejora tu plan para tener más.",
    fr: "Ton coach dort\u202f: tu as utilisé les minutes gratuites de la semaine. Reviens la semaine prochaine ou passe à une formule supérieure pour en avoir plus.", ru: "Ваш коуч спит: бесплатные минуты на эту неделю закончились. Возвращайтесь на следующей неделе или перейдите на платный тариф.",
  },
  "Talking isn't available right now.":{ de: "Sprechen ist gerade nicht möglich.", es: "Ahora mismo no se puede hablar.", fr: "Impossible de parler pour le moment.", ru: "Разговор сейчас недоступен." },
  "That call is gone.": { de: "Dieses Gespräch gibt es nicht mehr.", es: "Esa llamada ya no existe.", fr: "Cet appel n’existe plus.", ru: "Этого звонка больше нет." },
  "That conversation isn't yours.": { de: "Diese Unterhaltung gehört nicht dir.", es: "Esa conversación no es tuya.", fr: "Cette conversation n’est pas la tienne.", ru: "Это не ваш разговор." },
  "That idea is gone.": { de: "Diese Idee gibt es nicht mehr.", es: "Esa idea ya no existe.", fr: "Cette idée n’existe plus.", ru: "Этой идеи больше нет." },
  "That message is gone.": { de: "Diese Nachricht gibt es nicht mehr.", es: "Ese mensaje ya no existe.", fr: "Ce message n’existe plus.", ru: "Этого сообщения больше нет." },
  "You've talked a lot lately. Try again later, or type instead.": { de: "Du hast in letzter Zeit viel gesprochen. Versuch es später noch mal oder schreib stattdessen.",
    es: "Has hablado mucho últimamente. Inténtalo más tarde o escribe.",
    fr: "Tu as beaucoup parlé ces derniers temps. Réessaie plus tard ou écris plutôt.", ru: "Вы много говорили в последнее время. Попробуйте позже или напишите.",
  },
  "You've used this week's minutes for talking. Type instead, or upgrade for more.": { de: "Du hast die Sprechminuten dieser Woche aufgebraucht. Schreib stattdessen oder hol dir mehr mit einem Upgrade.",
    es: "Ya usaste los minutos de voz de esta semana. Escribe o mejora tu plan para tener más.",
    fr: "Tu as utilisé tes minutes d’appel de la semaine. Écris plutôt ou passe à une formule supérieure pour en avoir plus.", ru: "Минуты разговора на эту неделю закончились. Напишите или перейдите на тариф с большим лимитом.",
  },

  // Groups.
  "Group not found.": { de: "Gruppe nicht gefunden.", es: "No se encontró el grupo.", fr: "Groupe introuvable.", ru: "Группа не найдена." },
  "Members can only reply to comments from the group owner.": { de: "Mitglieder können nur auf Kommentare der Gruppenleitung antworten.",
    es: "Los miembros solo pueden responder a los comentarios del dueño del grupo.",
    fr: "Les membres ne peuvent répondre qu’aux commentaires du coach du groupe.", ru: "Участники могут отвечать только на комментарии владельца группы.",
  },
  "Owners don't share a diary with their own group.": { de: "Die Gruppenleitung teilt ihr Tagebuch nicht mit der eigenen Gruppe.",
    es: "Quien crea el grupo no comparte su diario con él.",
    fr: "Le coach ne partage pas son journal avec son propre groupe.", ru: "Владелец не делится дневником со своей группой.",
  },
  "Reviewing members' days is part of Pro.": { de: "Tage der Mitglieder durchsehen gehört zu Pro.",
    es: "Revisar los días de los miembros es parte de Pro.",
    fr: "Vérifier les journées des membres fait partie de Pro.", ru: "Разбор дней участников входит в Pro.",
  },
  "That comment is not in this group.": { de: "Dieser Kommentar ist nicht in dieser Gruppe.", es: "Ese comentario no está en este grupo.", fr: "Ce commentaire n’est pas dans ce groupe.", ru: "Этого комментария нет в группе." },
  "This group doesn't share that with its owner.": { de: "Diese Gruppe teilt das nicht mit ihrer Leitung.",
    es: "Este grupo no comparte eso con su dueño.",
    fr: "Ce groupe ne partage pas ça avec son coach.", ru: "Эта группа не делится этим с владельцем.",
  },
  "This member has paused sharing their diary with the group.": { de: "Dieses Mitglied teilt sein Tagebuch gerade nicht mit der Gruppe.",
    es: "Este miembro pausó compartir su diario con el grupo.",
    fr: "Ce membre a mis en pause le partage de son journal avec le groupe.", ru: "Участник приостановил доступ группы к своему дневнику.",
  },
  "Write a message.": { de: "Schreib eine Nachricht.", es: "Escribe un mensaje.", fr: "Écris un message.", ru: "Напишите сообщение." },
  // Signing in and accounts, again.
  "Too many codes requested. Try again in a few minutes.": {
    de: "Zu viele Codes angefordert. Versuch es in ein paar Minuten noch mal.",
    es: "Pediste demasiados códigos. Inténtalo de nuevo en unos minutos.",
    fr: "Trop de codes demandés. Réessaie dans quelques minutes.", ru: "Слишком много запросов кода. Попробуйте через несколько минут.",
  },
  "That Apple ID already opens another Btr.me account. Use a link code to join the two.": {
    de: "Mit dieser Apple-ID wird schon ein anderes Btr.me-Konto geöffnet. Verbinde die beiden mit einem Verknüpfungscode.",
    es: "Ese Apple ID ya abre otra cuenta de Btr.me. Usa un código de vinculación para unirlas.",
    fr: "Cet identifiant Apple ouvre déjà un autre compte Btr.me. Utilise un code de liaison pour réunir les deux.", ru: "Этот Apple ID уже открывает другой аккаунт Btr.me. Объедините их с помощью кода привязки.",
  },
  "Add another way to sign in before removing this one.": {
    de: "Füge erst eine andere Anmeldemethode hinzu, bevor du diese entfernst.",
    es: "Añade otra forma de iniciar sesión antes de quitar esta.",
    fr: "Ajoute un autre moyen de connexion avant de retirer celui-ci.", ru: "Добавьте другой способ входа, прежде чем удалять этот.",
  },
  "Telegram login expired. Try signing in again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Melde dich erneut an.",
    es: "La sesión de Telegram caducó. Vuelve a iniciar sesión.",
    fr: "La connexion Telegram a expiré. Réessaie de te connecter.", ru: "Вход через Telegram истёк. Войдите снова.",
  },
  "Telegram login expired. Close and open the summary again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die Übersicht und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra el resumen y vuelve a abrirlo.",
    fr: "La connexion Telegram a expiré. Ferme le résumé et rouvre-le.", ru: "Вход через Telegram истёк. Закройте сводку и откройте её снова.",
  },

  // Plans and purchases.
  "Creating groups is part of Plus and Pro.": {
    de: "Gruppen erstellen gehört zu Plus und Pro.",
    es: "Crear grupos es parte de Plus y Pro.",
    fr: "Créer des groupes fait partie de Plus et Pro.", ru: "Создание групп входит в Plus и Pro.",
  },
  "That purchase is for another app.": { de: "Dieser Kauf gehört zu einer anderen App.", es: "Esa compra es de otra app.", fr: "Cet achat concerne une autre app.", ru: "Эта покупка относится к другому приложению." },
  "That isn't a Btr.me plan.": { de: "Das ist kein Btr.me-Plan.", es: "Ese no es un plan de Btr.me.", fr: "Ce n’est pas une formule Btr.me.", ru: "Это не тариф Btr.me." },
  "This subscription belongs to another Btr.me account.": {
    de: "Dieses Abo gehört zu einem anderen Btr.me-Konto.",
    es: "Esta suscripción pertenece a otra cuenta de Btr.me.",
    fr: "Cet abonnement appartient à un autre compte Btr.me.", ru: "Эта подписка привязана к другому аккаунту Btr.me.",
  },
  "This coach has no spots left for new clients. Ask them to make room.": {
    de: "Bei diesem Coach ist kein Platz mehr für neue Klienten frei. Bitte um einen freien Platz.",
    es: "Este coach no tiene plazas para clientes nuevos. Pídele que haga sitio.",
    fr: "Ce coach n’a plus de place pour de nouveaux clients. Demande-lui de libérer une place.", ru: "У этого коуча нет мест для новых клиентов. Попросите освободить место.",
  },

  // FatSecret.
  "FatSecret isn't available right now.": { de: "FatSecret ist gerade nicht verfügbar.", es: "FatSecret no está disponible ahora mismo.", fr: "FatSecret n’est pas disponible pour le moment.", ru: "FatSecret сейчас недоступен." },
  "Connect FatSecret first.": { de: "Verbinde zuerst FatSecret.", es: "Conecta FatSecret primero.", fr: "Connecte d’abord FatSecret.", ru: "Сначала подключите FatSecret." },

  // Meals and reminders.
  "Meal not found": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", fr: "Repas introuvable", ru: "Приём пищи не найден." },
  "Meal item not found": { de: "Eintrag nicht gefunden.", es: "No se encontró ese alimento.", fr: "Aliment introuvable", ru: "Продукт в приёме пищи не найден." },
  "Reminder not found": { de: "Erinnerung nicht gefunden.", es: "No se encontró el recordatorio.", fr: "Rappel introuvable", ru: "Напоминание не найдено." },
  "Save a timezone before changing reminders": {
    de: "Speichere eine Zeitzone, bevor du Erinnerungen änderst.",
    es: "Guarda una zona horaria antes de cambiar los recordatorios.",
    fr: "Enregistre un fuseau horaire avant de modifier les rappels", ru: "Сохраните часовой пояс, прежде чем менять напоминания.",
  },

  // Groups, again.
  "Choose a smaller image.": { de: "Wähle ein kleineres Bild.", es: "Elige una imagen más pequeña.", fr: "Choisis une image plus petite.", ru: "Выберите изображение поменьше." },
  "Choose a group name.": { de: "Gib der Gruppe einen Namen.", es: "Ponle un nombre al grupo.", fr: "Choisis un nom de groupe.", ru: "Придумайте название группы." },
  "Choose a shorter group name.": { de: "Wähle einen kürzeren Gruppennamen.", es: "Elige un nombre de grupo más corto.", fr: "Choisis un nom de groupe plus court.", ru: "Сократите название группы." },
  "Choose a shorter description.": { de: "Wähle eine kürzere Beschreibung.", es: "Elige una descripción más corta.", fr: "Choisis une description plus courte.", ru: "Сократите описание." },
  "Choose a shorter message.": { de: "Schreib eine kürzere Nachricht.", es: "Escribe un mensaje más corto.", fr: "Écris un message plus court.", ru: "Сократите сообщение." },
  "Choose a shorter note.": { de: "Schreib eine kürzere Notiz.", es: "Escribe una nota más corta.", fr: "Écris une note plus courte.", ru: "Сократите заметку." },
  "Choose a shorter title.": { de: "Wähle einen kürzeren Titel.", es: "Elige un título más corto.", fr: "Choisis un titre plus court.", ru: "Сократите заголовок." },
  "Choose a shorter notice.": { de: "Schreib eine kürzere Mitteilung.", es: "Escribe un aviso más corto.", fr: "Écris une annonce plus courte.", ru: "Сократите объявление." },
  "Choose a name, description, or image to update.": {
    de: "Wähle einen Namen, eine Beschreibung oder ein Bild zum Ändern.",
    es: "Elige un nombre, una descripción o una imagen para cambiar.",
    fr: "Choisis un nom, une description ou une image à modifier.", ru: "Выберите, что изменить: название, описание или изображение.",
  },
  "Choose at least one thing members share.": {
    de: "Wähle mindestens eine Sache, die Mitglieder teilen.",
    es: "Elige al menos una cosa que compartan los miembros.",
    fr: "Choisis au moins une chose que les membres partagent.", ru: "Выберите хотя бы одно, чем делятся участники.",
  },
  "Could not create that group.": { de: "Die Gruppe konnte nicht erstellt werden.", es: "No se pudo crear el grupo.", fr: "Impossible de créer ce groupe.", ru: "Не удалось создать группу." },
  "Give the notice a title.": { de: "Gib der Mitteilung einen Titel.", es: "Ponle un título al aviso.", fr: "Donne un titre à l’annonce.", ru: "Добавьте заголовок объявления." },
  "Write the notice.": { de: "Schreib die Mitteilung.", es: "Escribe el aviso.", fr: "Écris l’annonce.", ru: "Напишите объявление." },
  "Notice not found.": { de: "Mitteilung nicht gefunden.", es: "No se encontró el aviso.", fr: "Annonce introuvable.", ru: "Объявление не найдено." },
  "Only the group owner can post notices; you cannot edit them.": {
    de: "Nur die Gruppenleitung kann Mitteilungen posten; du kannst sie nicht bearbeiten.",
    es: "Solo quien creó el grupo puede publicar avisos; tú no puedes editarlos.",
    fr: "Seul le coach du groupe peut publier des annonces\u202f; tu ne peux pas les modifier.", ru: "Объявления публикует только владелец группы; изменить их вы не можете.",
  },
  "Invite not found.": { de: "Einladung nicht gefunden.", es: "No se encontró la invitación.", fr: "Invitation introuvable.", ru: "Приглашение не найдено." },
  "That invite link is not valid.": { de: "Dieser Einladungslink ist ungültig.", es: "Ese enlace de invitación no es válido.", fr: "Ce lien d’invitation n’est pas valide.", ru: "Эта ссылка-приглашение недействительна." },
  "You are not a member of that group.": { de: "Du bist kein Mitglied dieser Gruppe.", es: "No eres miembro de ese grupo.", fr: "Tu n’es pas membre de ce groupe.", ru: "Вы не участник этой группы." },
  "You are not in that group.": { de: "Du bist nicht in dieser Gruppe.", es: "No estás en ese grupo.", fr: "Tu ne fais pas partie de ce groupe.", ru: "Вас нет в этой группе." },
  "That person is not in this group.": { de: "Diese Person ist nicht in der Gruppe.", es: "Esa persona no está en este grupo.", fr: "Cette personne ne fait pas partie de ce groupe.", ru: "Этого человека нет в группе." },
  "Owners can delete the group instead of leaving.": {
    de: "Als Gruppenleitung kannst du die Gruppe löschen, statt sie zu verlassen.",
    es: "Quien creó el grupo puede eliminarlo en lugar de salir.",
    fr: "Le coach peut supprimer le groupe au lieu de le quitter.", ru: "Владелец может удалить группу, но не выйти из неё.",
  },
  "Owners cannot be removed.": { de: "Die Gruppenleitung kann nicht entfernt werden.", es: "No se puede quitar a quien creó el grupo.", fr: "Le coach ne peut pas être retiré.", ru: "Владельца нельзя удалить из группы." },
  "You cannot edit that group.": { de: "Du kannst diese Gruppe nicht bearbeiten.", es: "No puedes editar ese grupo.", fr: "Tu ne peux pas modifier ce groupe.", ru: "Вы не можете изменить эту группу." },
  "You cannot review that group.": { de: "Du kannst die Tage dieser Gruppe nicht durchsehen.", es: "No puedes revisar ese grupo.", fr: "Tu ne peux pas vérifier ce groupe.", ru: "Вы не можете проверять дни этой группы." },
  "That day hasn't happened yet": { de: "Dieser Tag kommt erst noch.", es: "Ese día todavía no ha llegado.", fr: "Ce jour n’est pas encore arrivé", ru: "Этот день ещё не наступил." },
  "React with one emoji.": { de: "Reagiere mit einem Emoji.", es: "Reacciona con un emoji.", fr: "Réagis avec un seul emoji.", ru: "Отреагируйте одним эмодзи." },
};

// Messages with a value in them, matched on the English and rewritten with that value.
const TEMPLATES: { english: RegExp; de: string; es: string; fr: string; ru: string }[] = [
  {
    english: /^Choose one of: (.+)\.$/,
    de: "Wähle eins davon: $1.",
    es: "Elige una de estas opciones: $1.",
    fr: "Choisis parmi\u202f: $1.",
    ru: "Выберите одно из: $1.",
  },
  {
    english: /^Your plan includes up to (\d+) groups\.$/,
    de: "Dein Plan umfasst bis zu $1 Gruppen.",
    es: "Tu plan incluye hasta $1 grupos.",
    fr: "Ta formule comprend jusqu’à $1 groupes.",
    ru: "Ваш тариф включает до $1 групп.",
  },
  {
    english: /^Attach up to (\d+) photos\.$/,
    de: "Hänge bis zu $1 Fotos an.",
    es: "Adjunta hasta $1 fotos.",
    fr: "Joins jusqu’à $1 photos.",
    ru: "Прикрепите не больше $1 фото.",
  },
  {
    english: /^A meal can have at most (\d+) items$/,
    de: "Eine Mahlzeit kann höchstens $1 Einträge haben.",
    es: "Una comida puede tener como máximo $1 alimentos.",
    fr: "Un repas peut contenir au maximum $1 aliments.",
    ru: "В приёме пищи может быть не больше $1 продуктов.",
  },
  {
    english: /^Product not found for barcode (\S+)\.$/,
    de: "Kein Produkt zum Barcode $1 gefunden.",
    es: "No se encontró ningún producto con el código de barras $1.",
    fr: "Aucun produit trouvé pour le code-barres $1.",
    ru: "Продукт со штрихкодом $1 не найден.",
  },
  {
    english: /^We know (.+) but not its nutrition yet\. Scan the nutrition label to add it\.$/,
    de: "„$1“ kennen wir, aber noch nicht die Nährwerte. Scanne die Nährwerttabelle, um sie hinzuzufügen.",
    es: "Conocemos «$1», pero aún no su información nutricional. Escanea la etiqueta nutricional para añadirla.",
    fr: "Nous connaissons «\u202f$1\u202f», mais pas encore ses valeurs nutritionnelles. Scanne l’étiquette nutritionnelle pour les ajouter.",
    ru: "Продукт «$1» нам известен, но его пищевой ценности пока нет. Отсканируйте этикетку, чтобы добавить её.",
  },
  // Goals: the goal's name comes in lower case.
  ...(
    [
      ["calories", "kcal", { de: "Kalorien", es: "Las calorías diarias deben", fr: "les calories", ru: "Калории" }],
      ["protein", "grams", { de: "Eiweiß", es: "La proteína diaria debe", fr: "les protéines", ru: "Белок" }],
      ["carbs", "grams", { de: "Kohlenhydrate", es: "Los carbohidratos diarios deben", fr: "les glucides", ru: "Углеводы" }],
      ["fat", "grams", { de: "Fett", es: "La grasa diaria debe", fr: "les lipides", ru: "Жиры" }],
      ["fiber", "grams", { de: "Ballaststoffe", es: "La fibra diaria debe", fr: "les fibres", ru: "Клетчатка" }],
    ] as const
  ).map(([label, unit, name]) => {
    const short = unit === "kcal" ? { de: "kcal", es: "kcal", fr: "kcal", ru: "ккал" } : { de: "g", es: "g", fr: "g", ru: "г" };
    return {
      english: new RegExp(`^Daily ${label} must be a whole number from (\\d+) to (\\d+) ${unit}\\.$`),
      de: `Tageswert für ${name.de}: eine ganze Zahl von $1 bis $2 ${short.de}.`,
      es: `${name.es} ser un número entero de $1 a $2 ${short.es}.`,
      fr: `Objectif quotidien pour ${name.fr}\u202f: un nombre entier de $1 à $2 ${short.fr}.`,
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
