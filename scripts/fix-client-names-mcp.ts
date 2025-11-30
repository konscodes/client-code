// Script to extract names from notes and update client records using Supabase MCP
// This script will be executed via the Supabase MCP tools

/**
 * Extracts a name from notes text
 */
function extractNameFromNotes(notes: string | null): string | null {
  if (!notes || notes.trim() === '' || notes === '[object Object]' || notes === '?') {
    return null;
  }

  const lines = notes.split(/\r?\n/).map(line => line.trim()).filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0];

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
    firstLine.toLowerCase().includes('давал')
  ) {
    if (lines.length > 1) {
      const secondLine = lines[1];
      if (!secondLine.match(/^[\d\s\+\-\(\)]+$/) && !secondLine.includes('@')) {
        return extractNameFromText(secondLine);
      }
    }
    return null;
  }

  return extractNameFromText(firstLine);
}

function extractNameFromText(text: string): string | null {
  if (!text || text.trim() === '') {
    return null;
  }

  let cleaned = text.trim();
  
  cleaned = cleaned.replace(/[\d\s\+\-\(\)]{8,}/g, '');
  cleaned = cleaned.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, '');
  cleaned = cleaned.replace(/т\.\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/тел\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/M:\s*\+?[\d\s\+\-\(\)]+/gi, '');
  cleaned = cleaned.replace(/моб\.\s*:?\s*[\d\s\+\-\(\)]+/gi, '');
  
  const jobTitles = [
    'механик', 'директор', 'инженер', 'начальник', 'руководитель',
    'заместитель', 'главный', 'водитель', 'юрист', 'контакт',
    'ОМ', 'ОМТС', 'ММФ', 'ММф'
  ];
  
  for (const title of jobTitles) {
    const regex = new RegExp(`\\b${title}\\b`, 'gi');
    cleaned = cleaned.replace(regex, '');
  }
  
  cleaned = cleaned.replace(/ООО\s*["']?[^"']*["']?/gi, '');
  cleaned = cleaned.replace(/["'][^"']*["']/g, '');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  
  if (cleaned.length < 2 || !/[А-Яа-яA-Za-z]/.test(cleaned)) {
    return null;
  }
  
  const words = cleaned.split(/\s+/).filter(w => w.length > 0);
  const nameWords: string[] = [];
  
  for (const word of words) {
    if (word.match(/^[\d\+\-\(\)]+$/) || word.includes('@') || word.length > 20) {
      break;
    }
    nameWords.push(word);
    if (nameWords.length >= 3) {
      break;
    }
  }
  
  const extractedName = nameWords.join(' ').trim();
  
  if (extractedName.length >= 2 && extractedName.length <= 50 && /[А-Яа-яA-Za-z]/.test(extractedName)) {
    return extractedName;
  }
  
  return null;
}

// This will be used to generate SQL updates
console.log('Script ready. Use MCP Supabase tools to execute.');

