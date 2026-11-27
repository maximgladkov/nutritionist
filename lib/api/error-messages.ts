import type { Locale } from "../i18n/locales.ts";

type Translated = { es: string; ru: string };

// Error messages the API writes in English, in the other languages the app speaks. Keyed by the
// English text, so throw sites stay as they are and toApiError can keep reading English to pick a
// status. Messages built from values (domain errors, validation) aren't here and stay English.
const MESSAGES: Record<string, Translated> = {
  // Defaults and the router's own.
  "Invalid request.": { es: "La solicitud no es válida.", ru: "Неверный запрос." },
  "Method not allowed.": { es: "Método no permitido.", ru: "Метод не поддерживается." },
  "No such endpoint.": { es: "Esa dirección no existe.", ru: "Такого адреса нет." },
  "Not found.": { es: "No se encontró.", ru: "Не найдено." },
  "Sign in to continue.": { es: "Inicia sesión para continuar.", ru: "Войдите, чтобы продолжить." },
  "Something went wrong.": { es: "Algo salió mal.", ru: "Что-то пошло не так." },
  "You cannot do that.": { es: "No puedes hacer eso.", ru: "Это действие вам недоступно." },

  // Signing in.
  "Apple sign-in failed. Try again.": {
    es: "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.",
    ru: "Не удалось войти через Apple. Попробуйте ещё раз.",
  },
  "Open this from the Telegram bot.": { es: "Ábrelo desde el bot de Telegram.", ru: "Откройте это из бота в Telegram." },
  "Sign in again.": { es: "Vuelve a iniciar sesión.", ru: "Войдите снова." },
  "Telegram is not configured.": { es: "Telegram no está configurado.", ru: "Telegram не настроен." },
  "Telegram login expired. Close and open the app again.": {
    es: "La sesión de Telegram caducó. Cierra la app y vuelve a abrirla.",
    ru: "Вход через Telegram истёк. Закройте приложение и откройте его снова.",
  },
  "That code expired. Request a new one.": {
    es: "Ese código caducó. Pide uno nuevo.",
    ru: "Срок действия кода истёк. Запросите новый.",
  },
  "That code is not correct.": { es: "Ese código no es correcto.", ru: "Неверный код." },
  "That code is not valid or expired.": {
    es: "Ese código no es válido o ha caducado.",
    ru: "Код недействителен или его срок истёк.",
  },
  "Your session expired. Refresh the token or sign in again.": {
    es: "Tu sesión caducó. Vuelve a iniciar sesión.",
    ru: "Сессия истекла. Войдите снова.",
  },

  // Account.
  "Account not found.": { es: "No se encontró la cuenta.", ru: "Аккаунт не найден." },
  "Choose a valid country.": { es: "Elige un país válido.", ru: "Выберите страну из списка." },
  "Choose a valid time zone.": { es: "Elige una zona horaria válida.", ru: "Выберите часовой пояс из списка." },
  "That account is not linked.": { es: "Esa cuenta no está vinculada.", ru: "Этот аккаунт не привязан." },
  "There's no photo on your Telegram account.": {
    es: "Tu cuenta de Telegram no tiene foto.",
    ru: "В вашем аккаунте Telegram нет фото.",
  },

  // Diary, foods and meals.
  "Each saved food needs a name.": { es: "Cada alimento guardado necesita un nombre.", ru: "У каждого сохранённого продукта должно быть название." },
  "Meal not found.": { es: "No se encontró la comida.", ru: "Приём пищи не найден." },
  "Photo not found.": { es: "No se encontró la foto.", ru: "Фото не найдено." },
  "Recipe not found.": { es: "No se encontró la receta.", ru: "Рецепт не найден." },
  "Saved meal not found.": { es: "No se encontró la comida guardada.", ru: "Сохранённый приём пищи не найден." },
  "That food is not in the catalog.": { es: "Ese alimento no está en el catálogo.", ru: "Этого продукта нет в каталоге." },
  "That food is not in this member's diary.": {
    es: "Ese alimento no está en el diario de este miembro.",
    ru: "Этого продукта нет в дневнике участника.",
  },
  "That item id is already taken. Try again.": {
    es: "Ese identificador ya está en uso. Inténtalo de nuevo.",
    ru: "Этот идентификатор уже занят. Попробуйте ещё раз.",
  },
  "That meal has no foods to save.": { es: "Esa comida no tiene alimentos que guardar.", ru: "В этом приёме пищи нечего сохранить." },
  "That meal has no foods to share.": { es: "Esa comida no tiene alimentos que compartir.", ru: "В этом приёме пищи нечем поделиться." },
  "That recipe is gone.": { es: "Esa receta ya no existe.", ru: "Этого рецепта больше нет." },
  "There's nothing to undo.": { es: "No hay nada que deshacer.", ru: "Отменять нечего." },
  "This shared meal isn't available.": { es: "Esta comida compartida no está disponible.", ru: "Этот приём пищи больше недоступен." },
  "Use a YYYY-MM-DD date.": { es: "Usa una fecha con formato AAAA-MM-DD.", ru: "Укажите дату в формате ГГГГ-ММ-ДД." },
  "Weight entry not found.": { es: "No se encontró ese registro de peso.", ru: "Запись о весе не найдена." },
  "You can't log food for a future day.": {
    es: "No puedes registrar comida en un día futuro.",
    ru: "Нельзя записать еду на будущий день.",
  },
  "You can't log weight for a future day.": {
    es: "No puedes registrar el peso en un día futuro.",
    ru: "Нельзя записать вес на будущий день.",
  },
  "from must be on or before to.": {
    es: "La fecha inicial debe ser anterior o igual a la final.",
    ru: "Начальная дата должна быть не позже конечной.",
  },

  // Photos, recordings and recognition.
  "Choose a JPEG, PNG, GIF, or WebP image.": { es: "Elige una imagen JPEG, PNG, GIF o WebP.", ru: "Выберите изображение JPEG, PNG, GIF или WebP." },
  "Choose an image under 10 MB.": { es: "Elige una imagen de menos de 10 MB.", ru: "Выберите изображение меньше 10 МБ." },
  "List each of the meal's photos once.": { es: "Incluye cada foto de la comida una sola vez.", ru: "Укажите каждое фото приёма пищи один раз." },
  "Send the recording as WAV, M4A, MP3, OGG, FLAC or WebM.": {
    es: "Envía la grabación en WAV, M4A, MP3, OGG, FLAC o WebM.",
    ru: "Отправьте запись в формате WAV, M4A, MP3, OGG, FLAC или WebM.",
  },
  "That recording is too long. Keep it under a few minutes.": {
    es: "La grabación es demasiado larga. Que dure unos pocos minutos como mucho.",
    ru: "Запись слишком длинная. Уложитесь в несколько минут.",
  },
  "The image is empty.": { es: "La imagen está vacía.", ru: "Изображение пустое." },
  "The recording is empty.": { es: "La grabación está vacía.", ru: "Запись пустая." },
  "Upload not found.": { es: "No se encontró el archivo.", ru: "Файл не найден." },
  "We couldn't make out any speech in that recording.": {
    es: "No pudimos entender nada en esa grabación.",
    ru: "Не удалось разобрать речь в этой записи.",
  },
  "We couldn't read that. Try again or add the foods by hand.": {
    es: "No pudimos leerlo. Inténtalo de nuevo o añade los alimentos a mano.",
    ru: "Не удалось это распознать. Попробуйте ещё раз или добавьте продукты вручную.",
  },
  "We don't know this barcode yet. Scan the nutrition label to add it.": {
    es: "Aún no conocemos este código de barras. Escanea la etiqueta nutricional para añadirlo.",
    ru: "Мы пока не знаем этот штрихкод. Отсканируйте этикетку с пищевой ценностью, чтобы добавить его.",
  },

  // Coach.
  "Couldn't start talking. Try again in a moment.": {
    es: "No se pudo empezar a hablar. Inténtalo de nuevo en un momento.",
    ru: "Не удалось начать разговор. Попробуйте ещё раз через минуту.",
  },
  "Your coach is asleep: you've used this week's free minutes. Come back next week for more, or upgrade.": {
    es: "Tu coach está durmiendo: ya usaste los minutos gratis de esta semana. Vuelve la próxima semana o mejora tu plan para tener más.",
    ru: "Ваш коуч спит: бесплатные минуты на эту неделю закончились. Возвращайтесь на следующей неделе или перейдите на платный тариф.",
  },
  "Talking isn't available right now.":{ es: "Ahora mismo no se puede hablar.", ru: "Разговор сейчас недоступен." },
  "That call is gone.": { es: "Esa llamada ya no existe.", ru: "Этого звонка больше нет." },
  "That conversation isn't yours.": { es: "Esa conversación no es tuya.", ru: "Это не ваш разговор." },
  "That idea is gone.": { es: "Esa idea ya no existe.", ru: "Этой идеи больше нет." },
  "That message is gone.": { es: "Ese mensaje ya no existe.", ru: "Этого сообщения больше нет." },
  "You've talked a lot lately. Try again later, or type instead.": {
    es: "Has hablado mucho últimamente. Inténtalo más tarde o escribe.",
    ru: "Вы много говорили в последнее время. Попробуйте позже или напишите.",
  },
  "You've used this week's minutes for talking. Type instead, or upgrade for more.": {
    es: "Ya usaste los minutos de voz de esta semana. Escribe o mejora tu plan para tener más.",
    ru: "Минуты разговора на эту неделю закончились. Напишите или перейдите на тариф с большим лимитом.",
  },

  // Groups.
  "Group not found.": { es: "No se encontró el grupo.", ru: "Группа не найдена." },
  "Members can only reply to comments from the group owner.": {
    es: "Los miembros solo pueden responder a los comentarios del dueño del grupo.",
    ru: "Участники могут отвечать только на комментарии владельца группы.",
  },
  "Owners don't share a diary with their own group.": {
    es: "Quien crea el grupo no comparte su diario con él.",
    ru: "Владелец не делится дневником со своей группой.",
  },
  "Reviewing members' days is part of Pro.": {
    es: "Revisar los días de los miembros es parte de Pro.",
    ru: "Разбор дней участников входит в Pro.",
  },
  "That comment is not in this group.": { es: "Ese comentario no está en este grupo.", ru: "Этого комментария нет в группе." },
  "This group doesn't share that with its owner.": {
    es: "Este grupo no comparte eso con su dueño.",
    ru: "Эта группа не делится этим с владельцем.",
  },
  "This member has paused sharing their diary with the group.": {
    es: "Este miembro pausó compartir su diario con el grupo.",
    ru: "Участник приостановил доступ группы к своему дневнику.",
  },
  "Write a message.": { es: "Escribe un mensaje.", ru: "Напишите сообщение." },
};

export function translateErrorMessage(message: string, locale: Locale): string {
  return locale === "en" ? message : (MESSAGES[message]?.[locale] ?? message);
}
