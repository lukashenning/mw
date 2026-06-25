// Helper function to extract inventory operations from a command string
// IMPORTANT: Skips @+ @- @% patterns (those are memory operations!)
export function extractInventoryOperations(commandStr: string): { 
  adds: string[]; 
  removes: string[]; 
  removesAll: string[] 
} {
  const adds: string[] = [];
  const removes: string[] = [];
  const removesAll: string[] = [];
  
  // CRITICAL: Use correct regex pattern without excessive backslashes
  const operationRegex = /([+%-])(\w+)/g;
  let match;
  
  while ((match = operationRegex.exec(commandStr)) !== null) {
    const matchIndex = match.index;
    const charBefore = matchIndex > 0 ? commandStr[matchIndex - 1] : '';
    
    // Skip if this is a memory operation (preceded by @)
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
