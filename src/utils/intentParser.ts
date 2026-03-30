import { REGEX_COMMANDS, IntentAction } from '../constants/commands';
import { parseIntentWithGemini } from './geminiService';

export interface Intent {
  action: IntentAction;
  book?: string;
  page?: number;
  speed?: number;
  response_text: string;
}

/**
 * Regex tabanlı intent parsing (offline fallback)
 */
function parseIntentWithRegex(command: string): Intent {
  const normalized = command.trim().toLowerCase();

  for (const cmd of REGEX_COMMANDS) {
    const match = normalized.match(cmd.pattern);
    if (match) {
      const extracted = cmd.extract ? cmd.extract(match) : {};
      const bookExtracted = cmd.extractBook ? cmd.extractBook(match) : {};
      return {
        action: cmd.action,
        ...extracted,
        ...bookExtracted,
        response_text: bookExtracted.book
          ? `${bookExtracted.book} aranıyor.`
          : getRegexResponseText(cmd.action, extracted),
      };
    }
  }

  return {
    action: 'open_book',
    book: command.trim(),
    response_text: `${command.trim()} aranıyor.`,
  };
}

/**
 * Ana intent parser — Gemini varsa onu kullanır, yoksa regex fallback
 */
export async function parseIntent(command: string): Promise<Intent> {
  // Önce Gemini ile dene
  const geminiResult = await parseIntentWithGemini(command);
  if (geminiResult) {
    return {
      action: geminiResult.action,
      book: geminiResult.book ?? undefined,
      page: geminiResult.page ?? undefined,
      response_text: geminiResult.response_text,
    };
  }

  // Gemini başarısızsa regex fallback
  return parseIntentWithRegex(command);
}

/**
 * Senkron regex parser (geriye uyumluluk için)
 */
export function parseIntentSync(command: string): Intent {
  return parseIntentWithRegex(command);
}

function getRegexResponseText(
  action: IntentAction,
  extracted: { page?: number; speed?: number }
): string {
  switch (action) {
    case 'pause':
      return 'Duraklatıldı.';
    case 'resume':
      return 'Devam ediliyor.';
    case 'go_to_page':
      return `${extracted.page}. sayfaya gidiliyor.`;
    case 'go_to_start':
      return 'Başa dönülüyor.';
    case 'set_speed_up':
      return 'Okuma hızı artırıldı.';
    case 'set_speed_down':
      return 'Okuma hızı azaltıldı.';
    case 'next_chapter':
      return 'Sonraki bölüme geçiliyor.';
    case 'prev_chapter':
      return 'Önceki bölüme geçiliyor.';
    default:
      return 'İşlem gerçekleştirildi.';
  }
}
