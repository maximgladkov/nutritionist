import type { Locale } from "../i18n/locales.ts";

type Translated = { de: string; es: string; ru: string };

// Error messages the API writes in English, in the other languages the app speaks. Keyed by the
// English text, so throw sites stay as they are and toApiError can keep reading English to pick a
// status. Messages with a value in them are in TEMPLATES below; developer-facing ones stay English.
const MESSAGES: Record<string, Translated> = {
  // Defaults and the router's own.
  "Invalid request.": { de: "Ungültige Anfrage.", es: "La solicitud no es válida.", ru: "Неверный запрос." },
  "Method not allowed.": { de: "Methode nicht erlaubt.", es: "Método no permitido.", ru: "Метод не поддерживается." },
  "No such endpoint.": { de: "Diese Adresse gibt es nicht.", es: "Esa dirección no existe.", ru: "Такого адреса нет." },
  "Not found.": { de: "Nicht gefunden.", es: "No se encontró.", ru: "Не найдено." },
  "Sign in to continue.": { de: "Melde dich an, um weiterzumachen.", es: "Inicia sesión para continuar.", ru: "Войдите, чтобы продолжить." },
  "Something went wrong.": { de: "Etwas ist schiefgelaufen.", es: "Algo salió mal.", ru: "Что-то пошло не так." },
  "You cannot do that.": { de: "Das kannst du nicht tun.", es: "No puedes hacer eso.", ru: "Это действие вам недоступно." },

  // Signing in.
  "Apple sign-in failed. Try again.": { de: "Anmeldung mit Apple fehlgeschlagen. Versuch es noch mal.",
    es: "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.",
    ru: "Не удалось войти через Apple. Попробуйте ещё раз.",
  },
  "Open this from the Telegram bot.": { de: "Öffne das aus dem Telegram-Bot.", es: "Ábrelo desde el bot de Telegram.", ru: "Откройте это из бота в Telegram." },
  "Sign in again.": { de: "Melde dich erneut an.", es: "Vuelve a iniciar sesión.", ru: "Войдите снова." },
  "Telegram is not configured.": { de: "Telegram ist nicht eingerichtet.", es: "Telegram no está configurado.", ru: "Telegram не настроен." },
  "Telegram login expired. Close and open the app again.": { de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die App und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra la app y vuelve a abrirla.",
    ru: "Вход через Telegram истёк. Закройте приложение и откройте его снова.",
  },
  "That code expired. Request a new one.": { de: "Dieser Code ist abgelaufen. Fordere einen neuen an.",
    es: "Ese código caducó. Pide uno nuevo.",
    ru: "Срок действия кода истёк. Запросите новый.",
  },
  "That code is not correct.": { de: "Dieser Code ist nicht richtig.", es: "Ese código no es correcto.", ru: "Неверный код." },
  "That code is not valid or expired.": { de: "Dieser Code ist ungültig oder abgelaufen.",
    es: "Ese código no es válido o ha caducado.",
    ru: "Код недействителен или его срок истёк.",
  },
  "Your session expired. Refresh the token or sign in again.": { de: "Deine Sitzung ist abgelaufen. Melde dich erneut an.",
    es: "Tu sesión caducó. Vuelve a iniciar sesión.",
    ru: "Сессия истекла. Войдите снова.",
  },

  // Account.
  "Account not found.": { de: "Konto nicht gefunden.", es: "No se encontró la cuenta.", ru: "Аккаунт не найден." },
  "Choose a valid country.": { de: "Wähle ein gültiges Land.", es: "Elige un país válido.", ru: "Выберите страну из списка." },
  "Choose a valid time zone.": { de: "Wähle eine gültige Zeitzone.", es: "Elige una zona horaria válida.", ru: "Выберите часовой пояс из списка." },
  "That account is not linked.": { de: "Dieses Konto ist nicht verknüpft.", es: "Esa cuenta no está vinculada.", ru: "Этот аккаунт не привязан." },
  "There's no photo on your Telegram account.": { de: "Dein Telegram-Konto hat kein Foto.",
    es: "Tu cuenta de Telegram no tiene foto.",
    ru: "В вашем аккаунте Telegram нет фото.",
  },

  // Diary, foods and meals.
  "Each saved food needs a name.": { de: "Jedes gespeicherte Lebensmittel braucht einen Namen.", es: "Cada alimento guardado necesita un nombre.", ru: "У каждого сохранённого продукта должно быть название." },
  "Meal not found.": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", ru: "Приём пищи не найден." },
  "Photo not found.": { de: "Foto nicht gefunden.", es: "No se encontró la foto.", ru: "Фото не найдено." },
  "Recipe not found.": { de: "Rezept nicht gefunden.", es: "No se encontró la receta.", ru: "Рецепт не найден." },
  "Saved meal not found.": { de: "Gespeicherte Mahlzeit nicht gefunden.", es: "No se encontró la comida guardada.", ru: "Сохранённый приём пищи не найден." },
  "That food is not in the catalog.": { de: "Dieses Lebensmittel ist nicht im Katalog.", es: "Ese alimento no está en el catálogo.", ru: "Этого продукта нет в каталоге." },
  "That food is not in this member's diary.": { de: "Dieses Lebensmittel ist nicht im Tagebuch dieses Mitglieds.",
    es: "Ese alimento no está en el diario de este miembro.",
    ru: "Этого продукта нет в дневнике участника.",
  },
  "That item id is already taken. Try again.": { de: "Diese ID ist schon vergeben. Versuch es noch mal.",
    es: "Ese identificador ya está en uso. Inténtalo de nuevo.",
    ru: "Этот идентификатор уже занят. Попробуйте ещё раз.",
  },
  "That meal has no foods to save.": { de: "Diese Mahlzeit enthält nichts zum Speichern.", es: "Esa comida no tiene alimentos que guardar.", ru: "В этом приёме пищи нечего сохранить." },
  "That meal has no foods to share.": { de: "Diese Mahlzeit enthält nichts zum Teilen.", es: "Esa comida no tiene alimentos que compartir.", ru: "В этом приёме пищи нечем поделиться." },
  "That recipe is gone.": { de: "Dieses Rezept gibt es nicht mehr.", es: "Esa receta ya no existe.", ru: "Этого рецепта больше нет." },
  "There's nothing to undo.": { de: "Es gibt nichts rückgängig zu machen.", es: "No hay nada que deshacer.", ru: "Отменять нечего." },
  "This shared meal isn't available.": { de: "Diese geteilte Mahlzeit ist nicht verfügbar.", es: "Esta comida compartida no está disponible.", ru: "Этот приём пищи больше недоступен." },
  "Use a YYYY-MM-DD date.": { de: "Gib ein Datum im Format JJJJ-MM-TT an.", es: "Usa una fecha con formato AAAA-MM-DD.", ru: "Укажите дату в формате ГГГГ-ММ-ДД." },
  "Weight entry not found.": { de: "Gewichtseintrag nicht gefunden.", es: "No se encontró ese registro de peso.", ru: "Запись о весе не найдена." },
  "You can't log food for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Essen eintragen.",
    es: "No puedes registrar comida en un día futuro.",
    ru: "Нельзя записать еду на будущий день.",
  },
  "You can't log weight for a future day.": { de: "Für einen zukünftigen Tag kannst du kein Gewicht eintragen.",
    es: "No puedes registrar el peso en un día futuro.",
    ru: "Нельзя записать вес на будущий день.",
  },
  "from must be on or before to.": { de: "Das Startdatum darf nicht nach dem Enddatum liegen.",
    es: "La fecha inicial debe ser anterior o igual a la final.",
    ru: "Начальная дата должна быть не позже конечной.",
  },

  // Photos, recordings and recognition.
  "Choose a JPEG, PNG, GIF, or WebP image.": { de: "Wähle ein JPEG-, PNG-, GIF- oder WebP-Bild.", es: "Elige una imagen JPEG, PNG, GIF o WebP.", ru: "Выберите изображение JPEG, PNG, GIF или WebP." },
  "Choose an image under 10 MB.": { de: "Wähle ein Bild unter 10 MB.", es: "Elige una imagen de menos de 10 MB.", ru: "Выберите изображение меньше 10 МБ." },
  "List each of the meal's photos once.": { de: "Gib jedes Foto der Mahlzeit nur einmal an.", es: "Incluye cada foto de la comida una sola vez.", ru: "Укажите каждое фото приёма пищи один раз." },
  "Send the recording as WAV, M4A, MP3, OGG, FLAC or WebM.": { de: "Schick die Aufnahme als WAV, M4A, MP3, OGG, FLAC oder WebM.",
    es: "Envía la grabación en WAV, M4A, MP3, OGG, FLAC o WebM.",
    ru: "Отправьте запись в формате WAV, M4A, MP3, OGG, FLAC или WebM.",
  },
  "That recording is too long. Keep it under a few minutes.": { de: "Die Aufnahme ist zu lang. Bleib unter ein paar Minuten.",
    es: "La grabación es demasiado larga. Que dure unos pocos minutos como mucho.",
    ru: "Запись слишком длинная. Уложитесь в несколько минут.",
  },
  "The image is empty.": { de: "Das Bild ist leer.", es: "La imagen está vacía.", ru: "Изображение пустое." },
  "The recording is empty.": { de: "Die Aufnahme ist leer.", es: "La grabación está vacía.", ru: "Запись пустая." },
  "Upload not found.": { de: "Datei nicht gefunden.", es: "No se encontró el archivo.", ru: "Файл не найден." },
  "We couldn't make out any speech in that recording.": { de: "In dieser Aufnahme konnten wir keine Sprache erkennen.",
    es: "No pudimos entender nada en esa grabación.",
    ru: "Не удалось разобрать речь в этой записи.",
  },
  "We couldn't read that. Try again or add the foods by hand.": { de: "Das konnten wir nicht lesen. Versuch es noch mal oder füge die Lebensmittel von Hand hinzu.",
    es: "No pudimos leerlo. Inténtalo de nuevo o añade los alimentos a mano.",
    ru: "Не удалось это распознать. Попробуйте ещё раз или добавьте продукты вручную.",
  },
  "We don't know this barcode yet. Scan the nutrition label to add it.": { de: "Diesen Barcode kennen wir noch nicht. Scanne die Nährwerttabelle, um ihn hinzuzufügen.",
    es: "Aún no conocemos este código de barras. Escanea la etiqueta nutricional para añadirlo.",
    ru: "Мы пока не знаем этот штрихкод. Отсканируйте этикетку с пищевой ценностью, чтобы добавить его.",
  },

  // Coach.
  "Couldn't start talking. Try again in a moment.": { de: "Das Gespräch konnte nicht starten. Versuch es gleich noch mal.",
    es: "No se pudo empezar a hablar. Inténtalo de nuevo en un momento.",
    ru: "Не удалось начать разговор. Попробуйте ещё раз через минуту.",
  },
  "Your coach is asleep: you've used this week's free minutes. Come back next week for more, or upgrade.": { de: "Dein Coach schläft: Du hast die Gratisminuten dieser Woche aufgebraucht. Komm nächste Woche wieder oder hol dir mehr mit einem Upgrade.",
    es: "Tu coach está durmiendo: ya usaste los minutos gratis de esta semana. Vuelve la próxima semana o mejora tu plan para tener más.",
    ru: "Ваш коуч спит: бесплатные минуты на эту неделю закончились. Возвращайтесь на следующей неделе или перейдите на платный тариф.",
  },
  "Talking isn't available right now.":{ de: "Sprechen ist gerade nicht möglich.", es: "Ahora mismo no se puede hablar.", ru: "Разговор сейчас недоступен." },
  "That call is gone.": { de: "Dieses Gespräch gibt es nicht mehr.", es: "Esa llamada ya no existe.", ru: "Этого звонка больше нет." },
  "That conversation isn't yours.": { de: "Diese Unterhaltung gehört nicht dir.", es: "Esa conversación no es tuya.", ru: "Это не ваш разговор." },
  "That idea is gone.": { de: "Diese Idee gibt es nicht mehr.", es: "Esa idea ya no existe.", ru: "Этой идеи больше нет." },
  "That message is gone.": { de: "Diese Nachricht gibt es nicht mehr.", es: "Ese mensaje ya no existe.", ru: "Этого сообщения больше нет." },
  "You've talked a lot lately. Try again later, or type instead.": { de: "Du hast in letzter Zeit viel gesprochen. Versuch es später noch mal oder schreib stattdessen.",
    es: "Has hablado mucho últimamente. Inténtalo más tarde o escribe.",
    ru: "Вы много говорили в последнее время. Попробуйте позже или напишите.",
  },
  "You've used this week's minutes for talking. Type instead, or upgrade for more.": { de: "Du hast die Sprechminuten dieser Woche aufgebraucht. Schreib stattdessen oder hol dir mehr mit einem Upgrade.",
    es: "Ya usaste los minutos de voz de esta semana. Escribe o mejora tu plan para tener más.",
    ru: "Минуты разговора на эту неделю закончились. Напишите или перейдите на тариф с большим лимитом.",
  },

  // Groups.
  "Group not found.": { de: "Gruppe nicht gefunden.", es: "No se encontró el grupo.", ru: "Группа не найдена." },
  "Members can only reply to comments from the group owner.": { de: "Mitglieder können nur auf Kommentare der Gruppenleitung antworten.",
    es: "Los miembros solo pueden responder a los comentarios del dueño del grupo.",
    ru: "Участники могут отвечать только на комментарии владельца группы.",
  },
  "Owners don't share a diary with their own group.": { de: "Die Gruppenleitung teilt ihr Tagebuch nicht mit der eigenen Gruppe.",
    es: "Quien crea el grupo no comparte su diario con él.",
    ru: "Владелец не делится дневником со своей группой.",
  },
  "Reviewing members' days is part of Pro.": { de: "Tage der Mitglieder durchsehen gehört zu Pro.",
    es: "Revisar los días de los miembros es parte de Pro.",
    ru: "Разбор дней участников входит в Pro.",
  },
  "That comment is not in this group.": { de: "Dieser Kommentar ist nicht in dieser Gruppe.", es: "Ese comentario no está en este grupo.", ru: "Этого комментария нет в группе." },
  "This group doesn't share that with its owner.": { de: "Diese Gruppe teilt das nicht mit ihrer Leitung.",
    es: "Este grupo no comparte eso con su dueño.",
    ru: "Эта группа не делится этим с владельцем.",
  },
  "This member has paused sharing their diary with the group.": { de: "Dieses Mitglied teilt sein Tagebuch gerade nicht mit der Gruppe.",
    es: "Este miembro pausó compartir su diario con el grupo.",
    ru: "Участник приостановил доступ группы к своему дневнику.",
  },
  "Write a message.": { de: "Schreib eine Nachricht.", es: "Escribe un mensaje.", ru: "Напишите сообщение." },
  // Signing in and accounts, again.
  "Too many codes requested. Try again in a few minutes.": {
    de: "Zu viele Codes angefordert. Versuch es in ein paar Minuten noch mal.",
    es: "Pediste demasiados códigos. Inténtalo de nuevo en unos minutos.",
    ru: "Слишком много запросов кода. Попробуйте через несколько минут.",
  },
  "That Apple ID already opens another Btr.me account. Use a link code to join the two.": {
    de: "Mit dieser Apple-ID wird schon ein anderes Btr.me-Konto geöffnet. Verbinde die beiden mit einem Verknüpfungscode.",
    es: "Ese Apple ID ya abre otra cuenta de Btr.me. Usa un código de vinculación para unirlas.",
    ru: "Этот Apple ID уже открывает другой аккаунт Btr.me. Объедините их с помощью кода привязки.",
  },
  "Add another way to sign in before removing this one.": {
    de: "Füge erst eine andere Anmeldemethode hinzu, bevor du diese entfernst.",
    es: "Añade otra forma de iniciar sesión antes de quitar esta.",
    ru: "Добавьте другой способ входа, прежде чем удалять этот.",
  },
  "Telegram login expired. Try signing in again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Melde dich erneut an.",
    es: "La sesión de Telegram caducó. Vuelve a iniciar sesión.",
    ru: "Вход через Telegram истёк. Войдите снова.",
  },
  "Telegram login expired. Close and open the summary again.": {
    de: "Die Telegram-Anmeldung ist abgelaufen. Schließ die Übersicht und öffne sie erneut.",
    es: "La sesión de Telegram caducó. Cierra el resumen y vuelve a abrirlo.",
    ru: "Вход через Telegram истёк. Закройте сводку и откройте её снова.",
  },

  // Plans and purchases.
  "Creating groups is part of Plus and Pro.": {
    de: "Gruppen erstellen gehört zu Plus und Pro.",
    es: "Crear grupos es parte de Plus y Pro.",
    ru: "Создание групп входит в Plus и Pro.",
  },
  "That purchase is for another app.": { de: "Dieser Kauf gehört zu einer anderen App.", es: "Esa compra es de otra app.", ru: "Эта покупка относится к другому приложению." },
  "That isn't a Btr.me plan.": { de: "Das ist kein Btr.me-Plan.", es: "Ese no es un plan de Btr.me.", ru: "Это не тариф Btr.me." },
  "This subscription belongs to another Btr.me account.": {
    de: "Dieses Abo gehört zu einem anderen Btr.me-Konto.",
    es: "Esta suscripción pertenece a otra cuenta de Btr.me.",
    ru: "Эта подписка привязана к другому аккаунту Btr.me.",
  },
  "This coach has no spots left for new clients. Ask them to make room.": {
    de: "Bei diesem Coach ist kein Platz mehr für neue Klienten frei. Bitte um einen freien Platz.",
    es: "Este coach no tiene plazas para clientes nuevos. Pídele que haga sitio.",
    ru: "У этого коуча нет мест для новых клиентов. Попросите освободить место.",
  },

  // FatSecret.
  "FatSecret isn't available right now.": { de: "FatSecret ist gerade nicht verfügbar.", es: "FatSecret no está disponible ahora mismo.", ru: "FatSecret сейчас недоступен." },
  "Connect FatSecret first.": { de: "Verbinde zuerst FatSecret.", es: "Conecta FatSecret primero.", ru: "Сначала подключите FatSecret." },

  // Meals and reminders.
  "Meal not found": { de: "Mahlzeit nicht gefunden.", es: "No se encontró la comida.", ru: "Приём пищи не найден." },
  "Meal item not found": { de: "Eintrag nicht gefunden.", es: "No se encontró ese alimento.", ru: "Продукт в приёме пищи не найден." },
  "Reminder not found": { de: "Erinnerung nicht gefunden.", es: "No se encontró el recordatorio.", ru: "Напоминание не найдено." },
  "Save a timezone before changing reminders": {
    de: "Speichere eine Zeitzone, bevor du Erinnerungen änderst.",
    es: "Guarda una zona horaria antes de cambiar los recordatorios.",
    ru: "Сохраните часовой пояс, прежде чем менять напоминания.",
  },

  // Groups, again.
  "Choose a smaller image.": { de: "Wähle ein kleineres Bild.", es: "Elige una imagen más pequeña.", ru: "Выберите изображение поменьше." },
  "Choose a group name.": { de: "Gib der Gruppe einen Namen.", es: "Ponle un nombre al grupo.", ru: "Придумайте название группы." },
  "Choose a shorter group name.": { de: "Wähle einen kürzeren Gruppennamen.", es: "Elige un nombre de grupo más corto.", ru: "Сократите название группы." },
  "Choose a shorter description.": { de: "Wähle eine kürzere Beschreibung.", es: "Elige una descripción más corta.", ru: "Сократите описание." },
  "Choose a shorter message.": { de: "Schreib eine kürzere Nachricht.", es: "Escribe un mensaje más corto.", ru: "Сократите сообщение." },
  "Choose a shorter note.": { de: "Schreib eine kürzere Notiz.", es: "Escribe una nota más corta.", ru: "Сократите заметку." },
  "Choose a shorter title.": { de: "Wähle einen kürzeren Titel.", es: "Elige un título más corto.", ru: "Сократите заголовок." },
  "Choose a shorter notice.": { de: "Schreib eine kürzere Mitteilung.", es: "Escribe un aviso más corto.", ru: "Сократите объявление." },
  "Choose a name, description, or image to update.": {
    de: "Wähle einen Namen, eine Beschreibung oder ein Bild zum Ändern.",
    es: "Elige un nombre, una descripción o una imagen para cambiar.",
    ru: "Выберите, что изменить: название, описание или изображение.",
  },
  "Choose at least one thing members share.": {
    de: "Wähle mindestens eine Sache, die Mitglieder teilen.",
    es: "Elige al menos una cosa que compartan los miembros.",
    ru: "Выберите хотя бы одно, чем делятся участники.",
  },
  "Could not create that group.": { de: "Die Gruppe konnte nicht erstellt werden.", es: "No se pudo crear el grupo.", ru: "Не удалось создать группу." },
  "Give the notice a title.": { de: "Gib der Mitteilung einen Titel.", es: "Ponle un título al aviso.", ru: "Добавьте заголовок объявления." },
  "Write the notice.": { de: "Schreib die Mitteilung.", es: "Escribe el aviso.", ru: "Напишите объявление." },
  "Notice not found.": { de: "Mitteilung nicht gefunden.", es: "No se encontró el aviso.", ru: "Объявление не найдено." },
  "Only the group owner can post notices; you cannot edit them.": {
    de: "Nur die Gruppenleitung kann Mitteilungen posten; du kannst sie nicht bearbeiten.",
    es: "Solo quien creó el grupo puede publicar avisos; tú no puedes editarlos.",
    ru: "Объявления публикует только владелец группы; изменить их вы не можете.",
  },
  "Invite not found.": { de: "Einladung nicht gefunden.", es: "No se encontró la invitación.", ru: "Приглашение не найдено." },
  "That invite link is not valid.": { de: "Dieser Einladungslink ist ungültig.", es: "Ese enlace de invitación no es válido.", ru: "Эта ссылка-приглашение недействительна." },
  "You are not a member of that group.": { de: "Du bist kein Mitglied dieser Gruppe.", es: "No eres miembro de ese grupo.", ru: "Вы не участник этой группы." },
  "You are not in that group.": { de: "Du bist nicht in dieser Gruppe.", es: "No estás en ese grupo.", ru: "Вас нет в этой группе." },
  "That person is not in this group.": { de: "Diese Person ist nicht in der Gruppe.", es: "Esa persona no está en este grupo.", ru: "Этого человека нет в группе." },
  "Owners can delete the group instead of leaving.": {
    de: "Als Gruppenleitung kannst du die Gruppe löschen, statt sie zu verlassen.",
    es: "Quien creó el grupo puede eliminarlo en lugar de salir.",
    ru: "Владелец может удалить группу, но не выйти из неё.",
  },
  "Owners cannot be removed.": { de: "Die Gruppenleitung kann nicht entfernt werden.", es: "No se puede quitar a quien creó el grupo.", ru: "Владельца нельзя удалить из группы." },
  "You cannot edit that group.": { de: "Du kannst diese Gruppe nicht bearbeiten.", es: "No puedes editar ese grupo.", ru: "Вы не можете изменить эту группу." },
  "You cannot review that group.": { de: "Du kannst die Tage dieser Gruppe nicht durchsehen.", es: "No puedes revisar ese grupo.", ru: "Вы не можете проверять дни этой группы." },
  "That day hasn't happened yet": { de: "Dieser Tag kommt erst noch.", es: "Ese día todavía no ha llegado.", ru: "Этот день ещё не наступил." },
  "React with one emoji.": { de: "Reagiere mit einem Emoji.", es: "Reacciona con un emoji.", ru: "Отреагируйте одним эмодзи." },
};

// Messages with a value in them, matched on the English and rewritten with that value.
const TEMPLATES: { english: RegExp; de: string; es: string; ru: string }[] = [
  {
    english: /^Choose one of: (.+)\.$/,
    de: "Wähle eins davon: $1.",
    es: "Elige una de estas opciones: $1.",
    ru: "Выберите одно из: $1.",
  },
  {
    english: /^Your plan includes up to (\d+) groups\.$/,
    de: "Dein Plan umfasst bis zu $1 Gruppen.",
    es: "Tu plan incluye hasta $1 grupos.",
    ru: "Ваш тариф включает до $1 групп.",
  },
  {
    english: /^Attach up to (\d+) photos\.$/,
    de: "Hänge bis zu $1 Fotos an.",
    es: "Adjunta hasta $1 fotos.",
    ru: "Прикрепите не больше $1 фото.",
  },
  {
    english: /^A meal can have at most (\d+) items$/,
    de: "Eine Mahlzeit kann höchstens $1 Einträge haben.",
    es: "Una comida puede tener como máximo $1 alimentos.",
    ru: "В приёме пищи может быть не больше $1 продуктов.",
  },
  {
    english: /^Product not found for barcode (\S+)\.$/,
    de: "Kein Produkt zum Barcode $1 gefunden.",
    es: "No se encontró ningún producto con el código de barras $1.",
    ru: "Продукт со штрихкодом $1 не найден.",
  },
  {
    english: /^We know (.+) but not its nutrition yet\. Scan the nutrition label to add it\.$/,
    de: "„$1“ kennen wir, aber noch nicht die Nährwerte. Scanne die Nährwerttabelle, um sie hinzuzufügen.",
    es: "Conocemos «$1», pero aún no su información nutricional. Escanea la etiqueta nutricional para añadirla.",
    ru: "Продукт «$1» нам известен, но его пищевой ценности пока нет. Отсканируйте этикетку, чтобы добавить её.",
  },
  // Goals: the goal's name comes in lower case.
  ...(
    [
      ["calories", "kcal", { de: "Kalorien", es: "Las calorías diarias deben", ru: "Калории" }],
      ["protein", "grams", { de: "Eiweiß", es: "La proteína diaria debe", ru: "Белок" }],
      ["carbs", "grams", { de: "Kohlenhydrate", es: "Los carbohidratos diarios deben", ru: "Углеводы" }],
      ["fat", "grams", { de: "Fett", es: "La grasa diaria debe", ru: "Жиры" }],
      ["fiber", "grams", { de: "Ballaststoffe", es: "La fibra diaria debe", ru: "Клетчатка" }],
    ] as const
  ).map(([label, unit, name]) => {
    const short = unit === "kcal" ? { de: "kcal", es: "kcal", ru: "ккал" } : { de: "g", es: "g", ru: "г" };
    return {
      english: new RegExp(`^Daily ${label} must be a whole number from (\\d+) to (\\d+) ${unit}\\.$`),
      de: `Tageswert für ${name.de}: eine ganze Zahl von $1 bis $2 ${short.de}.`,
      es: `${name.es} ser un número entero de $1 a $2 ${short.es}.`,
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
