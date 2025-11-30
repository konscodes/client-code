// Process client data and generate UPDATE statements
// This will be run to extract names and update the database

interface Client {
  id: string;
  name: string;
  notes: string | null;
}

function extractNameFromNotes(notes: string | null): string | null {
  if (!notes || notes.trim() === '' || notes === '[object Object]' || notes === '?') {
    return null;
  }

  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length === 0) return null;

  let firstLine = lines[0];

  // Skip if it's clearly not a name
  if (
    firstLine.match(/^[\d\s\+\-\(\)]+$/) ||
    firstLine.includes('@') ||
    firstLine.toLowerCase().includes('механик') ||
    firstLine.toLowerCase().includes('директор') ||
    firstLine.toLowerCase().includes('инженер') ||
    firstLine.toLowerCase().includes('начальник') ||
    firstLine.toLowerCase().includes('руководитель') ||
    firstLine.toLowerCase().includes('заместитель') ||
    firstLine.toLowerCase().includes('главный') ||
    firstLine.toLowerCase().includes('через') ||
    firstLine.toLowerCase().includes('от') ||
    firstLine.toLowerCase().includes('тоже') ||
    firstLine.toLowerCase().includes('новый') ||
    firstLine.toLowerCase().includes('старый') ||
    firstLine.toLowerCase().includes('водитель') ||
    firstLine.toLowerCase().includes('юрист') ||
    firstLine.toLowerCase().includes('контакт') ||
    firstLine.toLowerCase().includes('для оплаты') ||
    firstLine.toLowerCase().includes('давал') ||
    firstLine.toLowerCase().includes('брат') ||
    firstLine.toLowerCase().includes('директор')
  ) {
    // Try second line
    if (lines.length > 1) {
      firstLine = lines[1];
      if (firstLine.match(/^[\d\s\+\-\(\)]+$/) || firstLine.includes('@')) {
        return null;
      }
    } else {
      return null;
    }
  }

  return extractNameFromText(firstLine);
}

function extractNameFromText(text: string): string | null {
  if (!text || text.trim() === '') return null;

  let cleaned = text.trim();
  
  // Remove phone numbers
  cleaned = cleaned.replace(/[\d\s\+\-\(\)]{8,}/g, '');
  cleaned = cleaned.replace(/т\.\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/тел\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/M:\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/моб\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  
  // Remove emails
  cleaned = cleaned.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '');
  
  // Remove job titles
  const jobTitles = ['механик', 'директор', 'инженер', 'начальник', 'руководитель', 'заместитель', 'главный', 'водитель', 'юрист', 'контакт', 'ОМ', 'ОМТС', 'ММФ', 'ММф', 'директор'];
  for (const title of jobTitles) {
    cleaned = cleaned.replace(new RegExp(`\\b${title}\\b`, 'gi'), '');
  }
  
  // Remove company names
  cleaned = cleaned.replace(/ООО\s*["']?[^"']*["']?/gi, '');
  cleaned = cleaned.replace(/["'][^"']*["']/g, '');
  
  // Remove location references
  cleaned = cleaned.replace(/\b(г\.|город|Москва|Пенза|Подольск|Рязань|Клин|Тула|Брянск|Видное|Люберцы|Красногорск|Новосибирск|Выкса)\b/gi, '');
  
  // Remove common prefixes
  cleaned = cleaned.replace(/^(от|через|тоже|новый|старый|брат)\s+/gi, '');
  
  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  if (cleaned.length < 2 || !/[А-Яа-яA-Za-z]/.test(cleaned)) return null;
  
  // Extract name words (typically 1-3 words for Russian names)
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  const nameWords: string[] = [];
  
  for (const word of words) {
    if (word.match(/^[\d\+\-\(\)]+$/) || word.includes('@') || word.length > 20) break;
    nameWords.push(word);
    if (nameWords.length >= 3) break;
  }
  
  const extractedName = nameWords.join(' ').trim();
  
  // Final validation
  if (extractedName.length >= 2 && extractedName.length <= 50 && /[А-Яа-яA-Za-z]/.test(extractedName)) {
    return extractedName;
  }
  
  return null;
}

// Sample processing - this will be used to generate SQL
export { extractNameFromNotes, extractNameFromText };

