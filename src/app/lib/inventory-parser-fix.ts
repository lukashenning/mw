// HOTFIX for inventory operation parsing
// This module provides a fixed version of inventory operation parsing
// that correctly skips @+ @- @% patterns (which are memory operations, not inventory operations)

export function parseInventoryOperations(commandStr: string): {
  adds: string[];
  removes: string[];
  removesAll: string[];
} {
  const adds: string[] = [];
  const removes: string[] = [];
  const removesAll: string[] = [];
  
  const operationRegex = /([+%-])(\w+)/g;
  let match;
  
  while ((match = operationRegex.exec(commandStr)) !== null) {
    const matchIndex = match.index;
    const charBefore = matchIndex > 0 ? commandStr[matchIndex - 1] : '';
    
    // CRITICAL: Skip if this is a memory operation (preceded by @)
    if (charBefore === '@') {
      continue;
    }
    
    const [, operation, targetItem] = match;
    const itemLower = targetItem.toLowerCase();
    
    if (operation === '+') {
      adds.push(itemLower);
    } else if (operation === '-') {
      removes.push(itemLower);
    } else if (operation === '%') {
      removesAll.push(itemLower);
    }
  }
  
  return { adds, removes, removesAll };
}

// Override String.prototype.matchAll for specific regex patterns
// This is a runtime hotfix that intercepts all matchAll calls
export function applyMatchAllHotfix() {
  const originalMatchAll = String.prototype.matchAll;
  
  String.prototype.matchAll = function(regexp: RegExp) {
    const regexSource = regexp.source;
    
    // Debug logging to see what pattern we're matching
    console.log('🔍 matchAll called with pattern:', regexSource);
    
    // Only intercept inventory operation patterns
    // Note: regexp.source for /([+%-])(\w+)/g is '([+%-])(\\w+)' (single backslash in source)
    if (regexSource === '([+%-])(\\w+)' || regexSource === '([+-])(\\w+)') {
      console.log('✅ HOTFIX APPLIED for pattern:', regexSource);
      // Use our safe parsing instead
      const result = parseInventoryOperations(this as string);
      
      // Convert to matchAll-compatible iterator
      const matches: RegExpMatchArray[] = [];
      
      // Re-parse to create proper match objects with index
      const regex = new RegExp(regexSource, 'g');
      let match;
      while ((match = regex.exec(this as string)) !== null) {
        const matchIndex = match.index;
        const charBefore = matchIndex > 0 ? (this as string)[matchIndex - 1] : '';
        
        // Skip @ prefixed
        if (charBefore !== '@') {
          matches.push(match);
        }
      }
      
      return matches[Symbol.iterator]();
    }
    
    // Fall back to original for other patterns
    return originalMatchAll.call(this, regexp);
  };
}