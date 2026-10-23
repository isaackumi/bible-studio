// The phone page's words in the phone's own language (its Accept-Language): English, French or
// Spanish, as the app is. English is the key, as in the app; a line missing here shows in English.

export type PhoneLanguage = "en" | "fr" | "es";

const FR: Record<string, string> = {
  "Joining…": "Connexion…",
  "Your name (optional)": "Votre nom (facultatif)",
  "Shown with your questions": "Affiché avec vos questions",
  Join: "Rejoindre",
  "Ask a question": "Poser une question",
  "Type your question…": "Écrivez votre question…",
  "Send question": "Envoyer la question",
  Top: "Les plus votées",
  Newest: "Les plus récentes",
  "This room has ended. Thank you for joining.": "Cette salle est fermée. Merci d’avoir participé.",
  "Join a room": "Rejoindre une salle",
  "Enter the code shown on the screen.": "Saisissez le code affiché à l’écran.",
  "No room with that code. Check the screen and try again.": "Aucune salle avec ce code. Vérifiez l’écran et réessayez.",
  "Something went wrong.": "Un problème est survenu.",
  "Sent. It appears here once the church puts it through.": "Envoyée. Elle apparaîtra ici une fois validée par l’église.",
  "Sent.": "Envoyée.",
  "No questions up yet. Yours appears once the church puts it through.": "Pas encore de questions. La vôtre apparaîtra une fois validée par l’église.",
  "No questions yet. Ask the first one.": "Pas encore de questions. Posez la première.",
  Pinned: "Épinglée",
  Answered: "Répondu",
  "Take back your vote for: ": "Retirer votre vote pour : ",
  "Vote for: ": "Voter pour : ",
  "{n} of yours waiting": "{n} des vôtres en attente",
  "Question {n} of {total}": "Question {n} sur {total}",
  Poll: "Sondage",
  "Get ready… the answers open in a moment.": "Préparez-vous… les réponses s’ouvrent dans un instant.",
  "Answer in. Wait for the others…": "Réponse envoyée. Attendez les autres…",
  "Time is up!": "Temps écoulé !",
  "Thanks for voting.": "Merci d’avoir voté.",
  "Correct!": "Bonne réponse !",
  "No answer this time": "Pas de réponse cette fois",
  "Not this time": "Pas cette fois",
  "{n} in a row": "{n} d’affilée",
  "{place} of {players}": "{place} sur {players}",
  "{n} points": "{n} points",
  Guest: "Invité",
  "Room ended": "Salle fermée",
  "Team {name}": "Équipe {name}",
  Red: "rouge",
  Blue: "bleue",
  Gold: "or",
  Green: "verte",
};

const ES: Record<string, string> = {
  "Joining…": "Entrando…",
  "Your name (optional)": "Tu nombre (opcional)",
  "Shown with your questions": "Se muestra con tus preguntas",
  Join: "Entrar",
  "Ask a question": "Haz una pregunta",
  "Type your question…": "Escribe tu pregunta…",
  "Send question": "Enviar pregunta",
  Top: "Más votadas",
  Newest: "Más recientes",
  "This room has ended. Thank you for joining.": "Esta sala ha terminado. Gracias por participar.",
  "Join a room": "Entrar en una sala",
  "Enter the code shown on the screen.": "Escribe el código que aparece en la pantalla.",
  "No room with that code. Check the screen and try again.": "No hay ninguna sala con ese código. Revisa la pantalla e inténtalo de nuevo.",
  "Something went wrong.": "Algo salió mal.",
  "Sent. It appears here once the church puts it through.": "Enviada. Aparecerá aquí cuando la iglesia la apruebe.",
  "Sent.": "Enviada.",
  "No questions up yet. Yours appears once the church puts it through.": "Aún no hay preguntas. La tuya aparecerá cuando la iglesia la apruebe.",
  "No questions yet. Ask the first one.": "Aún no hay preguntas. Haz la primera.",
  Pinned: "Fijada",
  Answered: "Respondida",
  "Take back your vote for: ": "Quitar tu voto de: ",
  "Vote for: ": "Votar por: ",
  "{n} of yours waiting": "{n} tuyas en espera",
  "Question {n} of {total}": "Pregunta {n} de {total}",
  Poll: "Encuesta",
  "Get ready… the answers open in a moment.": "Prepárate… las respuestas se abren en un momento.",
  "Answer in. Wait for the others…": "Respuesta enviada. Espera a los demás…",
  "Time is up!": "¡Se acabó el tiempo!",
  "Thanks for voting.": "Gracias por votar.",
  "Correct!": "¡Correcto!",
  "No answer this time": "Sin respuesta esta vez",
  "Not this time": "Esta vez no",
  "{n} in a row": "{n} seguidas",
  "{place} of {players}": "{place} de {players}",
  "{n} points": "{n} puntos",
  Guest: "Invitado",
  "Room ended": "Sala terminada",
  "Team {name}": "Equipo {name}",
  Red: "rojo",
  Blue: "azul",
  Gold: "oro",
  Green: "verde",
};

export const PHONE_WORDS: Record<PhoneLanguage, Record<string, string>> = { en: {}, fr: FR, es: ES };

/** The phone's language from its Accept-Language header ("fr-CA,fr;q=0.9,en" → French). */
export function phoneLanguage(header: string | null): PhoneLanguage {
  for (const part of (header ?? "").split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase().slice(0, 2);
    if (tag === "en" || tag === "fr" || tag === "es") return tag;
  }
  return "en";
}

/** A phone line in that language, with {placeholders} filled. */
export function phoneWord(language: PhoneLanguage, text: string, values: Record<string, string | number> = {}): string {
  const line = PHONE_WORDS[language][text] ?? text;
  return line.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));
}
