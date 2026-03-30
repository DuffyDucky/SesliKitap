export type IntentAction =
  | 'pause'
  | 'resume'
  | 'go_to_page'
  | 'go_to_start'
  | 'set_speed_up'
  | 'set_speed_down'
  | 'next_chapter'
  | 'prev_chapter'
  | 'open_book'
  | 'search'
  | 'play'
  | 'set_speed'
  | 'unknown';

export interface RegexCommand {
  pattern: RegExp;
  action: IntentAction;
  extract?: (match: RegExpMatchArray) => { page?: number; speed?: number };
}

export interface RegexCommandWithBook extends RegexCommand {
  extractBook?: (match: RegExpMatchArray) => { book?: string };
}

export const REGEX_COMMANDS: RegexCommandWithBook[] = [
  {
    pattern: /^(dur|durdur)$/i,
    action: 'pause',
  },
  {
    pattern: /^(devam et|devam)$/i,
    action: 'resume',
  },
  {
    pattern: /(\d+)\.\s*sayfa(?:ya\s+git)?/i,
    action: 'go_to_page',
    extract: (match) => ({ page: parseInt(match[1], 10) }),
  },
  {
    pattern: /^başa dön$/i,
    action: 'go_to_start',
  },
  {
    pattern: /^(daha hızlı|hızlı oku)$/i,
    action: 'set_speed_up',
  },
  {
    pattern: /^(daha yavaş|yavaş oku)$/i,
    action: 'set_speed_down',
  },
  {
    pattern: /^(sonraki bölüm|ileri)$/i,
    action: 'next_chapter',
  },
  {
    pattern: /^(önceki bölüm|geri)$/i,
    action: 'prev_chapter',
  },
  // Kitap açma komutları: "X oku", "X aç", "X kitabını oku/aç", "X dinle"
  {
    pattern: /^(.+?)(?:\s+kitabını)?\s+(oku|aç|dinle|bul|ara)$/i,
    action: 'open_book',
    extractBook: (match) => ({ book: match[1].trim() }),
  },
  // "oku X", "aç X", "dinle X"
  {
    pattern: /^(oku|aç|dinle|bul|ara)\s+(.+)$/i,
    action: 'open_book',
    extractBook: (match) => ({ book: match[2].trim() }),
  },
];
