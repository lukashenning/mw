import { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { DndProvider, useDrag, useDrop } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { ImageWithFallback } from './components/figma/ImageWithFallback';
import { useIsMobile } from './components/ui/use-mobile';
import JSZip from 'jszip';
import * as Telegraph from './lib/telegraph';
import { applyMatchAllHotfix } from './lib/inventory-parser-fix';
import { extractInventoryOperations } from './lib/extract-inventory-ops';

// Apply hotfix immediately
applyMatchAllHotfix();
// HOTFIX: Patch String.prototype.matchAll to skip @-prefixed matches for inventory operations
// This fixes the bug where @+item was parsed as both inventory AND memory operation
(function() {
  const originalMatchAll = String.prototype.matchAll;
  String.prototype.matchAll = function(regexp: RegExp) {
    // Only apply fix to the specific regex pattern used for inventory operations
    const regexStr = regexp.source;
    if (regexStr === '([+\\\\-%])(\\\\w+)' || regexStr === '([+-])(\\\\w+)') {
      const matches: RegExpMatchArray[] = [];
      const results = originalMatchAll.call(this, regexp);
      for (const match of results) {
        const matchIndex = match.index!;
        const charBefore = matchIndex > 0 ? this[matchIndex - 1] : '';
        // Skip if preceded by @
        if (charBefore !== '@') {
          matches.push(match);
        }
      }
      return matches[Symbol.iterator]();
    }
    return originalMatchAll.call(this, regexp);
  };
})();

// Extend File interface to include webkitRelativePath
declare global {
  interface File {
    webkitRelativePath?: string;
  }
}

const DEFAULT_SCRIPT = `DEBUG
start: &startscreen §welcome +symbol
debug: true
world: 
token: 
//background: #000000
//textcolor: #e6e6e6
//textfont: Garamond (24, normal)
//labelfont: Garamond
//animation: page //page,slide,none
//inherit: true //true,false

PERSON welcome (MW20-12-25)
"Shift + Escape"

SCENE startscreen ( )
welcome
> startscreen
`;

interface Destination {
  id: string;
  displayName?: string; // Optional custom display text
  requirements: string[];
  notRequirements: string[];
  memoryRequirements: string[];
  memoryNotRequirements: string[];
  comparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[];
}

interface Inhabitant {
  id: string;
  requirements: string[];
  notRequirements: string[];
  memoryRequirements: string[];
  memoryNotRequirements: string[];
  comparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[];
}

interface Location {
  id: string;
  name: string;
  emoji: string;
  image: string;
  imageRef?: string; // Optional reference to another item for image inheritance
  inhabitants: Inhabitant[];
  destinations: Destination[];
  systemCall: string | null; // Optional system call when entering location
}

interface GreetingOption {
  text: string;
  adds: string[];
  removes: string[];
  removesAll: string[];
  memoryAdds: string[];
  memoryRemoves: string[];
  memoryRemovesAll: string[];
  memoryCopies: { sourcePrefix: string; targetPrefix: string }[]; // @id_>@id2_ operations
  telegraphUpload: boolean;
  telegraphDownload: boolean;
  teleportTo: string | null;
  clearInventory: boolean;
  switchToCharacter: string | null;
  systemCall: string | null;
  requirements: string[];
  notRequirements: string[];
  memoryRequirements: string[];
  memoryNotRequirements: string[];
  comparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[];
}

interface ReactionOption {
  text: string;
  adds: string[];
  removes: string[];
  removesAll: string[];
  memoryAdds: string[];
  memoryRemoves: string[];
  memoryRemovesAll: string[];
  memoryCopies: { sourcePrefix: string; targetPrefix: string }[]; // @id_>@id2_ operations
  telegraphUpload: boolean;
  telegraphDownload: boolean;
  teleportTo: string | null;
  clearInventory: boolean;
  switchToCharacter: string | null;
  systemCall: string | null;
  requirements: string[];
  notRequirements: string[];
  memoryRequirements: string[];
  memoryNotRequirements: string[];
  comparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[];
}

interface Character {
  id: string;
  name: string;
  emoji: string;
  image: string;
  imageRef?: string; // Optional reference to another item for image inheritance
  greetings: GreetingOption[];
  reactions: { [itemId: string]: ReactionOption[] };
  systemCall: string | null; // Optional system call when character appears
}

interface SystemLine {
  adds: string[];
  removes: string[];
  removesAll: string[];
  memoryAdds: string[];
  memoryRemoves: string[];
  memoryRemovesAll: string[];
  memoryCopies: { sourcePrefix: string; targetPrefix: string }[]; // @id_>@id2_ operations
  telegraphUpload: boolean; // @! command
  telegraphDownload: boolean; // @? command
  teleportTo: string | null;
  clearInventory: boolean;
  switchToCharacter: string | null;
  systemCall: string | null;
  requirements: string[];
  notRequirements: string[];
  memoryRequirements: string[];
  memoryNotRequirements: string[];
  comparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[];
  originalCommands: string;
}

interface System {
  id: string;
  lines: SystemLine[];
}

interface Item {
  id: string;
  name: string;
  emoji: string;
  image: string;
  imageRef?: string; // Optional reference to another item for image inheritance
}

interface DebugState {
  location: string;
  character: string;
  inventory: string[];
  telegraphPath: string;
  telegraphToken: string;
  debugMode: boolean;
  startCommands: string;
  startLocation?: string;
  startCharacter?: string | null;
  startInventory?: {[itemId: string]: InventoryItem};
  background: string;
  textColor: string;
  textFont: string;
  labelFont: string;
  textFontSize?: string;
  textFontStyle?: string;
  labelFontSize?: string;
  labelFontStyle?: string;
  animation?: string;
  inherit?: boolean;  // Controls underscore inheritance (default: true)
}

interface GameData {
  locations: { [id: string]: Location };
  characters: { [id: string]: Character };
  items: { [id: string]: Item };
  systems: { [id: string]: System };
  debug: DebugState | null;
}

function parseRequirements(requirementsStr: string) {
  const requirements: string[] = [];
  const notRequirements: string[] = [];
  const memoryRequirements: string[] = [];
  const memoryNotRequirements: string[] = [];
  const comparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
  const memoryComparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
  
  if (requirementsStr) {
    requirementsStr.split(',').forEach(r => {
      const trimmedReq = r.trim();
      
      // Check for comparison operators (< or >)
      const comparisonMatch = trimmedReq.match(/^(@)?(\w+)\s*([<>])\s*(\d+)$/);
      if (comparisonMatch) {
        const isMemory = comparisonMatch[1] === '@';
        const itemId = isMemory ? comparisonMatch[2] : comparisonMatch[2].toLowerCase();
        const operator = comparisonMatch[3] as '<' | '>';
        const value = parseInt(comparisonMatch[4], 10);
        
        if (isMemory) {
          memoryComparisons.push({ itemId, operator, value });
        } else {
          comparisons.push({ itemId, operator, value });
        }
      } else if (trimmedReq.startsWith('@%')) {
        // @%memoryID = memory must NOT exist (case-sensitive)
        memoryNotRequirements.push(trimmedReq.substring(2));
      } else if (trimmedReq.startsWith('@')) {
        // @memoryID = memory must exist (case-sensitive)
        memoryRequirements.push(trimmedReq.substring(1));
      } else if (trimmedReq.startsWith('%')) {
        // %itemID = item must NOT be in inventory
        notRequirements.push(trimmedReq.substring(1).toLowerCase());
      } else if (trimmedReq) {
        // itemID = item must be in inventory
        requirements.push(trimmedReq.toLowerCase());
      }
    });
  }
  
  return { requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons };
}

// DEPRECATED: Replaced by imported version from /lib/extract-inventory-ops.ts
// This function had a broken regex pattern and is no longer used
function extractInventoryOperations_DEPRECATED_DO_NOT_USE(commandStr: string): { adds: string[]; removes: string[]; removesAll: string[] } {
  const adds: string[] = [];
  const removes: string[] = [];
  const removesAll: string[] = [];
  
  const operationRegex = /([+\\-%])(\\w+)/g;
  let match;
  while ((match = operationRegex.exec(commandStr)) !== null) {
    const matchIndex = match.index;
    const charBefore = matchIndex > 0 ? commandStr[matchIndex - 1] : '';
    
    // Skip if this is a memory operation (preceded by @)
    if (charBefore === '@') {
      continue;
    }
    
    const [, operation, targetItem] = match;
    if (operation === '+') {
      adds.push(targetItem.toLowerCase());
    } else if (operation === '-') {
      removes.push(targetItem.toLowerCase());
    } else if (operation === '%') {
      removesAll.push(targetItem.toLowerCase());
    }
  }
  
  return { adds, removes, removesAll };
}

// Helper function to get inventory count with wildcard pattern support
function getInventoryCount(id: string, inventory: { [itemId: string]: { count: number; lastAdded: number } } | null): number {
  if (!inventory) return 0;
  
  if (id.endsWith('_')) {
    // Wildcard pattern: sum all items starting with this prefix
    const prefix = id;
    let totalCount = 0;
    for (const itemId in inventory) {
      if (itemId.startsWith(prefix)) {
        totalCount += inventory[itemId].count;
      }
    }
    return totalCount;
  } else {
    // Exact match
    return inventory[id]?.count || 0;
  }
}

// Helper function to get world memory count with wildcard pattern support
function getMemoryCount(id: string, worldMemory: { [memoryId: string]: number }): number {
  if (id.endsWith('_')) {
    // Wildcard pattern: sum all memory entries starting with this prefix
    const prefix = id;
    let totalCount = 0;
    for (const memoryId in worldMemory) {
      if (memoryId.startsWith(prefix)) {
        totalCount += worldMemory[memoryId];
      }
    }
    return totalCount;
  } else {
    // Exact match
    return worldMemory[id] || 0;
  }
}

// Helper function to replace [@prefix_] placeholders with random world memory values
function replaceMemoryPlaceholders(text: string, worldMemory: { [memoryId: string]: number }): string {
  // Find all [@...._] patterns
  const pattern = /\[@(\w+_)\]/g;
  
  return text.replace(pattern, (match, prefix) => {
    // Find all memory entries that start with this prefix
    const matchingEntries: string[] = [];
    for (const memoryId in worldMemory) {
      if (memoryId.startsWith(prefix) && worldMemory[memoryId] > 0) {
        matchingEntries.push(memoryId);
      }
    }
    
    // If no matching entries, return empty string
    if (matchingEntries.length === 0) {
      return '';
    }
    
    // Pick a random entry
    const randomEntry = matchingEntries[Math.floor(Math.random() * matchingEntries.length)];
    
    // Return the suffix (everything after the prefix)
    return randomEntry.substring(prefix.length);
  });
}

function parseScript(script: string, assetBackend?: {[filename: string]: string}): GameData {
  const locations: { [id: string]: Location } = {};
  const characters: { [id: string]: Character } = {};
  const items: { [id: string]: Item } = {};
  const systems: { [id: string]: System } = {};
  let debug: DebugState | null = null;

  const lines = script.split('\n');
  let currentId = '';
  let currentType = '';
  let inReactions = false;
  let inDebugSection = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Handle debug section header
    const lineLower = line.toLowerCase();
    if ((line.startsWith('#') && line.substring(1).trim().toLowerCase() === 'debug') || lineLower === 'debug') {
      inDebugSection = true;
      continue;
    }
    
    // Exit debug section when we hit SCENE, PERSON, SYMBOL, or SYSTEM
    if (line.startsWith('SCENE ') || line.startsWith('PERSON ') || line.startsWith('SYMBOL ') || line.startsWith('SYSTEM ')) {
      inDebugSection = false;
    }

    if (!line || line.startsWith('//')) continue;

    // Handle debug section content
    if (inDebugSection && line.includes(':')) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();
      const keyLower = key.trim().toLowerCase();
      
      if (!debug) {
        debug = { 
          location: '', 
          character: '', 
          inventory: [], 
          telegraphPath: '', 
          telegraphToken: '', 
          debugMode: false, 
          startCommands: '',
          background: '#000000',
          textColor: '#e6e6e6',
          textFont: 'IM Fell English',
          labelFont: 'IM Fell English',
          textFontStyle: 'italic',  // Default to italic for IM Fell English
          labelFontStyle: 'normal',   // Default to normal for labels
          animation: 'page',  // Default animation style
          inherit: true  // Default to inherit enabled
        };
      }
      
      if (keyLower === 'ort') {
        debug.location = value.toLowerCase();
      } else if (keyLower === 'charakter' || keyLower === 'person') {
        debug.character = value.toLowerCase();
      } else if (keyLower === 'inventar') {
        debug.inventory = value ? value.split(',').map(s => s.trim().toLowerCase()).filter(s => s) : [];
      } else if (keyLower === 'welt' || keyLower === 'world') {
        debug.telegraphPath = value.trim();
        console.log('🔍 [PARSER] Found Telegraph path in debug:', value.trim());
      } else if (keyLower === 'token') {
        debug.telegraphToken = value.trim();
        console.log('🔍 [PARSER] Found Telegraph token in debug:', value.trim() ? '***' + value.trim().slice(-4) : 'empty');
      } else if (keyLower === 'debug') {
        debug.debugMode = value.toLowerCase() === 'true';
      } else if (keyLower === 'start') {
        debug.startCommands = value.trim();
      } else if (keyLower === 'background') {
        debug.background = value.trim();
      } else if (keyLower === 'textcolor') {
        debug.textColor = value.trim();
      } else if (keyLower === 'textfont') {
        const fontMatch = value.trim().match(/^(.+?)\s*(?:\(([^)]+)\))?$/);
        if (fontMatch) {
          debug.textFont = fontMatch[1].trim();
          if (fontMatch[2]) {
            // Parse size and style from parentheses (e.g., "12, italic")
            const params = fontMatch[2].split(',').map(p => p.trim());
            params.forEach(param => {
              if (/^\d+(\.\d+)?$/.test(param)) {
                debug.textFontSize = param + 'px';
              } else if (['italic', 'bold', 'normal', 'bold italic', 'italic bold'].includes(param.toLowerCase())) {
                debug.textFontStyle = param.toLowerCase();
              }
            });
          } else {
            // No parentheses: use regular style (not italic)
            debug.textFontStyle = 'normal';
          }
        }
      } else if (keyLower === 'labelfont') {
        const fontMatch = value.trim().match(/^(.+?)\s*(?:\(([^)]+)\))?$/);
        if (fontMatch) {
          debug.labelFont = fontMatch[1].trim();
          if (fontMatch[2]) {
            // Parse size and style from parentheses
            const params = fontMatch[2].split(',').map(p => p.trim());
            params.forEach(param => {
              if (/^\d+(\.\d+)?$/.test(param)) {
                debug.labelFontSize = param + 'px';
              } else if (['italic', 'bold', 'normal', 'bold italic', 'italic bold'].includes(param.toLowerCase())) {
                debug.labelFontStyle = param.toLowerCase();
              }
            });
          } else {
            // No parentheses: use normal style
            debug.labelFontStyle = 'normal';
          }
        }
      } else if (keyLower === 'animation') {
        debug.animation = value.trim().toLowerCase();
      } else if (keyLower === 'inherit') {
        debug.inherit = value.trim().toLowerCase() !== 'false';
      }
      continue;
    }

    const idMatch = line.match(/^\[(.+)\]$/);
    // Check for SCENE, PERSON, SYMBOL, SYSTEM keywords
    const sceneMatch = line.match(/^SCENE\s+(\w+)(?:\s*\(([^)]*)\))?$/i);
    const personMatch = line.match(/^PERSON\s+(\w+)(?:\s*\(([^)]*)\))?$/i);
    const symbolMatch = line.match(/^SYMBOL\s+(\w+)(?:\s*\(([^)]*)\))?$/i);
    const systemMatch = line.match(/^SYSTEM\s+(\w+)$/i);
    
    if (sceneMatch) {
      currentId = sceneMatch[1].toLowerCase();
      currentType = 'location';
      inReactions = false;
      // Handle display name logic:
      // - If no parentheses (undefined): set to null for later fallback
      // - If empty parentheses or whitespace-only: set to empty string (no name)
      // - Otherwise: use the name in parentheses
      let displayName: string;
      if (sceneMatch[2] === undefined) {
        displayName = '\0'; // Special marker: No parentheses - will use fallback later
      } else if (sceneMatch[2].trim() === '') {
        displayName = ''; // Empty parentheses - no name
      } else {
        displayName = sceneMatch[2]; // Use name in parentheses
      }
      locations[currentId] = { id: currentId, name: displayName, emoji: '', image: '', inhabitants: [], destinations: [], systemCall: null };
      continue;
    } else if (personMatch) {
      currentId = personMatch[1].toLowerCase();
      currentType = 'character';
      inReactions = false;
      let displayName: string;
      if (personMatch[2] === undefined) {
        displayName = '\0'; // Special marker: No parentheses - will use fallback later
      } else if (personMatch[2].trim() === '') {
        displayName = ''; // Empty parentheses - no name
      } else {
        displayName = personMatch[2]; // Use name in parentheses
      }
      characters[currentId] = { id: currentId, name: displayName, emoji: '', image: '', greetings: [], reactions: {}, systemCall: null };
      continue;
    } else if (symbolMatch) {
      currentId = symbolMatch[1].toLowerCase();
      currentType = 'item';
      inReactions = false;
      let displayName: string;
      if (symbolMatch[2] === undefined) {
        displayName = '\0'; // Special marker: No parentheses - will use fallback later
      } else if (symbolMatch[2].trim() === '') {
        displayName = ''; // Empty parentheses - no name
      } else {
        displayName = symbolMatch[2]; // Use name in parentheses
      }
      items[currentId] = { id: currentId, name: displayName, emoji: '', image: '' };
      continue;
    } else if (systemMatch) {
      currentId = systemMatch[1].toLowerCase();
      currentType = 'system';
      inReactions = false;
      systems[currentId] = { id: currentId, lines: [] };
      continue;
    }

    if (!currentId) continue;

    if (line.toLowerCase().startsWith('reaktionen:')) {
      inReactions = true;
      continue;
    }

    if (inReactions && currentType === 'character') {
      const reactionMatch = line.match(/^\[(.+?)\]\s*"([^"]+)"(.*)$/);
      if (reactionMatch) {
        const [, itemId, text, operationsStr] = reactionMatch;
        const adds: string[] = [];
        const removes: string[] = [];
        const removesAll: string[] = [];
        const memoryAdds: string[] = [];
        const memoryRemoves: string[] = [];
        const memoryRemovesAll: string[] = [];
        const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
        let teleportTo: string | null = null;
        let clearInventory = false;
        let switchToCharacter: string | null = null;
        
        // Extract all +item, -item, and %item operations
        const operationMatches = operationsStr.matchAll(/([+\-%])(\w+)/g);
        for (const match of operationMatches) {
          const [, operation, targetItem] = match;
          if (operation === '+') {
            adds.push(targetItem.toLowerCase());
          } else if (operation === '-') {
            removes.push(targetItem.toLowerCase());
          } else if (operation === '%') {
            removesAll.push(targetItem.toLowerCase());
          }
        }
        
        // Check for @% (without ID) - clear all world memory
        if (operationsStr.includes('@%') && !operationsStr.match(/@%\w/)) {
          memoryRemovesAll.push('');
        }
        
        // Extract all @+memory, @-memory, and @%memory operations
        const memoryMatches = operationsStr.matchAll(/@([+\-%])(\w+_?)/g);
        for (const match of memoryMatches) {
          const [, operation, memoryId] = match;
          if (operation === '+') {
            memoryAdds.push(memoryId);
          } else if (operation === '-') {
            memoryRemoves.push(memoryId);
          } else if (operation === '%') {
            memoryRemovesAll.push(memoryId);
          }
        }
        
        // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
        const memoryCopyMatches = operationsStr.matchAll(/@(\w+)_>@(\w*)/g);
        for (const match of memoryCopyMatches) {
          const [, sourcePrefix, targetPrefix] = match;
          memoryCopies.push({ sourcePrefix, targetPrefix });
        }
        
        // Extract &ortID for teleport
        const teleportMatch = operationsStr.match(/&(\w+)/);
        if (teleportMatch) {
          teleportTo = teleportMatch[1].toLowerCase();
        }
        
        // Check for &% or %% to clear inventory
        if (operationsStr.includes('&%') || operationsStr.includes('%%')) {
          clearInventory = true;
        }
        
        // Extract §charakterID for character switch
        const characterSwitchMatch = operationsStr.match(/§(\w+)/);
        if (characterSwitchMatch) {
          switchToCharacter = characterSwitchMatch[1].toLowerCase();
        }
        
        // Extract #systemID for system call
        let systemCall: string | null = null;
        const systemCallMatch = operationsStr.match(/#(\w+)/);
        if (systemCallMatch) {
          systemCall = systemCallMatch[1].toLowerCase();
        }
        
        // Check for @! (upload to Telegraph)
        let telegraphUpload = false;
        if (operationsStr.includes('@!')) {
          telegraphUpload = true;
        }
        
        // Check for @? (download from Telegraph)
        let telegraphDownload = false;
        if (operationsStr.includes('@?')) {
          telegraphDownload = true;
        }
        
        const itemIdLower = itemId.toLowerCase();
        // Add to array of reactions for this item
        if (!characters[currentId].reactions[itemIdLower]) {
          characters[currentId].reactions[itemIdLower] = [];
        }
        characters[currentId].reactions[itemIdLower].push({
          text,
          adds,
          removes,
          removesAll,
          memoryAdds,
          memoryRemoves,
          memoryRemovesAll,
          memoryCopies,
          telegraphUpload,
          telegraphDownload,
          teleportTo,
          clearInventory,
          switchToCharacter,
          systemCall,
          requirements: [],
          notRequirements: [],
          memoryRequirements: [],
          memoryNotRequirements: [],
          comparisons: [],
          memoryComparisons: [],
        });
      }
      continue;
    }

    // Handle system call in location definition
    if (currentType === 'location' && line.startsWith('#')) {
      const systemCallMatch = line.match(/^#(\w+)$/);
      if (systemCallMatch) {
        locations[currentId].systemCall = systemCallMatch[1].toLowerCase();
      }
      continue;
    }

    // Handle line-based inhabitants and destinations for locations
    if (currentType === 'location' && (line.startsWith('>') || line.match(/^\w+\s*(?:\(|$)/))) {
      // Line starts with '>' -> it's a destination
      if (line.startsWith('>')) {
        const destLine = line.substring(1).trim();
        // Match: sceneID "Display Text" (requirements) or sceneID (requirements) or sceneID "Display Text" or sceneID
        const match = destLine.match(/^(\w+)(?:\s+"([^"]+)")?(?:\s*\(([^)]+)\))?$/);
        if (match) {
          const destId = match[1].toLowerCase();
          const displayName = match[2]; // Optional display text from quotes
          const requirementsStr = match[3]; // Optional requirements
          const requirements: string[] = [];
          const notRequirements: string[] = [];
          const memoryRequirements: string[] = [];
          const memoryNotRequirements: string[] = [];
          const comparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
          const memoryComparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
          
          if (requirementsStr) {
            requirementsStr.split(',').forEach(r => {
              const trimmedReq = r.trim();
              
              // Check for comparison operators (< or >)
              const comparisonMatch = trimmedReq.match(/^(@)?(\w+)\s*([<>])\s*(\d+)$/);
              if (comparisonMatch) {
                const isMemory = comparisonMatch[1] === '@';
                const itemId = isMemory ? comparisonMatch[2] : comparisonMatch[2].toLowerCase();
                const operator = comparisonMatch[3] as '<' | '>';
                const value = parseInt(comparisonMatch[4], 10);
                
                if (isMemory) {
                  memoryComparisons.push({ itemId, operator, value });
                } else {
                  comparisons.push({ itemId, operator, value });
                }
              } else if (trimmedReq.startsWith('@%')) {
                // @%memoryID = memory must NOT exist (case-sensitive)
                memoryNotRequirements.push(trimmedReq.substring(2));
              } else if (trimmedReq.startsWith('@')) {
                // @memoryID = memory must exist (case-sensitive)
                memoryRequirements.push(trimmedReq.substring(1));
              } else if (trimmedReq.startsWith('%')) {
                // %itemID = item must NOT be in inventory
                notRequirements.push(trimmedReq.substring(1).toLowerCase());
              } else if (trimmedReq) {
                // itemID = item must be in inventory
                requirements.push(trimmedReq.toLowerCase());
              }
            });
          }
          
          locations[currentId].destinations.push({ 
            id: destId, 
            displayName, 
            requirements, 
            notRequirements, 
            memoryRequirements, 
            memoryNotRequirements, 
            comparisons, 
            memoryComparisons 
          });
        }
      }
      // Line doesn't start with '>' -> it's an inhabitant
      else {
        const match = line.match(/^(\w+)\s*(?:\(([^)]+)\))?$/);
        if (match) {
          const inhId = match[1].toLowerCase();
          const requirementsStr = match[2];
          const requirements: string[] = [];
          const notRequirements: string[] = [];
          const memoryRequirements: string[] = [];
          const memoryNotRequirements: string[] = [];
          const comparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
          const memoryComparisons: Array<{ itemId: string; operator: '<' | '>'; value: number }> = [];
          
          if (requirementsStr) {
            requirementsStr.split(',').forEach(r => {
              const trimmedReq = r.trim();
              
              // Check for comparison operators (< or >)
              const comparisonMatch = trimmedReq.match(/^(@)?(\w+)\s*([<>])\s*(\d+)$/);
              if (comparisonMatch) {
                const isMemory = comparisonMatch[1] === '@';
                const itemId = isMemory ? comparisonMatch[2] : comparisonMatch[2].toLowerCase();
                const operator = comparisonMatch[3] as '<' | '>';
                const value = parseInt(comparisonMatch[4], 10);
                
                if (isMemory) {
                  memoryComparisons.push({ itemId, operator, value });
                } else {
                  comparisons.push({ itemId, operator, value });
                }
              } else if (trimmedReq.startsWith('@%')) {
                // @%memoryID = memory must NOT exist (case-sensitive)
                memoryNotRequirements.push(trimmedReq.substring(2));
              } else if (trimmedReq.startsWith('@')) {
                // @memoryID = memory must exist (case-sensitive)
                memoryRequirements.push(trimmedReq.substring(1));
              } else if (trimmedReq.startsWith('%')) {
                // %itemID = item must NOT be in inventory
                notRequirements.push(trimmedReq.substring(1).toLowerCase());
              } else if (trimmedReq) {
                // itemID = item must be in inventory
                requirements.push(trimmedReq.toLowerCase());
              }
            });
          }
          
          locations[currentId].inhabitants.push({ id: inhId, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
        }
      }
      continue;
    }

    // Handle system call in character definition
    if (currentType === 'character' && line.startsWith('#')) {
      const systemCallMatch = line.match(/^#(\w+)$/);
      if (systemCallMatch) {
        characters[currentId].systemCall = systemCallMatch[1].toLowerCase();
      }
      continue;
    }

    // Handle line-based greetings and reactions for characters
    if (currentType === 'character' && (line.startsWith('"') || line.startsWith('[') || line.startsWith('('))) {
      // Line starts with '(' -> check if it's a requirement for the next greeting
      // But don't skip if the greeting is on the same line
      if (line.startsWith('(') && !line.match(/^\([^)]+\)\s*"/) && i + 1 < lines.length && lines[i + 1].trim().startsWith('"')) {
        // This is a requirement line followed by a greeting on the NEXT line, skip it for now
        // It will be handled when we process the greeting line
        continue;
      }
      
      // Line starts with '"' -> it's a greeting
      // Also handle lines that start with '(' followed by '"' on the same line
      if (line.startsWith('"') || line.match(/^\([^)]+\)\s*"/)) {
        let requirementsStr = '';
        let lineToMatch = line;
        
        // Check if requirements are on the same line as the greeting
        const inlineReqMatch = line.match(/^\(([^)]+)\)\s*(.+)$/);
        if (inlineReqMatch) {
          requirementsStr = inlineReqMatch[1];
          lineToMatch = inlineReqMatch[2];
        } else if (i > 0) {
          // Check if previous line has requirements
          const prevLine = lines[i - 1].trim();
          const reqMatch = prevLine.match(/^\(([^)]+)\)$/);
          if (reqMatch) {
            requirementsStr = reqMatch[1];
          }
        }
        
        const greetingMatch = lineToMatch.match(/^"([^"]+)"(.*)$/);
        if (greetingMatch) {
          const text = greetingMatch[1];
          const operationsStr = greetingMatch[2];
          const adds: string[] = [];
          const removes: string[] = [];
          const removesAll: string[] = [];
          const memoryAdds: string[] = [];
          const memoryRemoves: string[] = [];
          const memoryRemovesAll: string[] = [];
          const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
          let teleportTo: string | null = null;
          let clearInventory = false;
          let switchToCharacter: string | null = null;
          
          // Parse requirements if present
          const { requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons } = parseRequirements(requirementsStr);
          
          // Extract all +item, -item, and %item operations
          const operationMatches = operationsStr.matchAll(/([+\-%])(\w+)/g);
          for (const match of operationMatches) {
            const [, operation, targetItem] = match;
            if (operation === '+') {
              adds.push(targetItem.toLowerCase());
            } else if (operation === '-') {
              removes.push(targetItem.toLowerCase());
            } else if (operation === '%') {
              removesAll.push(targetItem.toLowerCase());
            }
          }
          
          // Check for @% (without ID) - clear all world memory
          if (operationsStr.includes('@%') && !operationsStr.match(/@%\w/)) {
            memoryRemovesAll.push('');
          }
          
          // Extract all @+memory, @-memory, and @%memory operations
          const memoryMatches = operationsStr.matchAll(/@([+\-%])(\w+_?)/g);
          for (const match of memoryMatches) {
            const [, operation, memoryId] = match;
            if (operation === '+') {
              memoryAdds.push(memoryId);
            } else if (operation === '-') {
              memoryRemoves.push(memoryId);
            } else if (operation === '%') {
              memoryRemovesAll.push(memoryId);
            }
          }
          
          // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
          const memoryCopyMatches = operationsStr.matchAll(/@(\w+)_>@(\w*)/g);
          for (const match of memoryCopyMatches) {
            const [, sourcePrefix, targetPrefix] = match;
            memoryCopies.push({ sourcePrefix, targetPrefix });
          }
          
          // Extract &ortID for teleport
          const teleportMatch = operationsStr.match(/&(\w+)/);
          if (teleportMatch) {
            teleportTo = teleportMatch[1].toLowerCase();
          }
          
          // Check for &% or %% to clear inventory
          if (operationsStr.includes('&%') || operationsStr.includes('%%')) {
            clearInventory = true;
          }
          
          // Extract §charakterID for character switch
          const characterSwitchMatch = operationsStr.match(/§(\w+)/);
          if (characterSwitchMatch) {
            switchToCharacter = characterSwitchMatch[1].toLowerCase();
          }
          
          // Extract #systemID for system call
          let systemCall: string | null = null;
          const systemCallMatch = operationsStr.match(/#(\w+)/);
          if (systemCallMatch) {
            systemCall = systemCallMatch[1].toLowerCase();
          }
          
          // Check for @! (upload to Telegraph)
          let telegraphUpload = false;
          if (operationsStr.includes('@!')) {
            telegraphUpload = true;
          }
          
          // Check for @? (download from Telegraph)
          let telegraphDownload = false;
          if (operationsStr.includes('@?')) {
            telegraphDownload = true;
          }
          
          characters[currentId].greetings.push({ text, adds, removes, removesAll, memoryAdds, memoryRemoves, memoryRemovesAll, memoryCopies, telegraphUpload, telegraphDownload, teleportTo, clearInventory, switchToCharacter, systemCall, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
        }
      }
      // Line starts with '[' -> it's a reaction
      else if (line.startsWith('[')) {
        // Match: [item] (requirements) "text" or [item] "text"
        const reactionMatch = line.match(/^\[\s*(\w*)\s*\](?:\s*\(([^)]+)\))?\s*"([^"]+)"(.*)$/);
        if (reactionMatch) {
          const itemId = reactionMatch[1] || 'nichts'; // Empty brackets = nichts
          const requirementsStr = reactionMatch[2] || ''; // Optional requirements
          const text = reactionMatch[3];
          const operationsStr = reactionMatch[4];
          const adds: string[] = [];
          const removes: string[] = [];
          const removesAll: string[] = [];
          const memoryAdds: string[] = [];
          const memoryRemoves: string[] = [];
          const memoryRemovesAll: string[] = [];
          let teleportTo: string | null = null;
          let clearInventory = false;
          let switchToCharacter: string | null = null;
          
          // Parse requirements if present
          const { requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons } = parseRequirements(requirementsStr);
          
          // Extract all +item, -item, and %item operations
          const operationMatches = operationsStr.matchAll(/([+\-%])(\w+)/g);
          for (const match of operationMatches) {
            const [, operation, targetItem] = match;
            if (operation === '+') {
              adds.push(targetItem.toLowerCase());
            } else if (operation === '-') {
              removes.push(targetItem.toLowerCase());
            } else if (operation === '%') {
              removesAll.push(targetItem.toLowerCase());
            }
          }
          
          // Check for @% (without ID) - clear all world memory
          if (operationsStr.includes('@%') && !operationsStr.match(/@%\w/)) {
            memoryRemovesAll.push('');
          }
          
          // Extract all @+memory, @-memory, and @%memory operations
          const memoryMatches = operationsStr.matchAll(/@([+\-%])(\w+_?)/g);
          for (const match of memoryMatches) {
            const [, operation, memoryId] = match;
            if (operation === '+') {
              memoryAdds.push(memoryId);
            } else if (operation === '-') {
              memoryRemoves.push(memoryId);
            } else if (operation === '%') {
              memoryRemovesAll.push(memoryId);
            }
          }
          
          // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
          const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
          const memoryCopyMatches = operationsStr.matchAll(/@(\w+)_>@(\w*)/g);
          for (const match of memoryCopyMatches) {
            const [, sourcePrefix, targetPrefix] = match;
            memoryCopies.push({ sourcePrefix, targetPrefix });
          }
          
          // Extract &ortID for teleport
          const teleportMatch = operationsStr.match(/&(\w+)/);
          if (teleportMatch) {
            teleportTo = teleportMatch[1].toLowerCase();
          }
          
          // Check for &% or %% to clear inventory
          if (operationsStr.includes('&%') || operationsStr.includes('%%')) {
            clearInventory = true;
          }
          
          // Extract §charakterID for character switch
          const characterSwitchMatch = operationsStr.match(/§(\w+)/);
          if (characterSwitchMatch) {
            switchToCharacter = characterSwitchMatch[1].toLowerCase();
          }
          
          // Extract #systemID for system call
          let systemCall: string | null = null;
          const systemCallMatch = operationsStr.match(/#(\w+)/);
          if (systemCallMatch) {
            systemCall = systemCallMatch[1].toLowerCase();
          }
          
          // Check for @! (upload to Telegraph)
          let telegraphUpload = false;
          if (operationsStr.includes('@!')) {
            telegraphUpload = true;
          }
          
          // Check for @? (download from Telegraph)
          let telegraphDownload = false;
          if (operationsStr.includes('@?')) {
            telegraphDownload = true;
          }
          
          const itemIdLower = itemId.toLowerCase();
          // Add to array of reactions for this item
          if (!characters[currentId].reactions[itemIdLower]) {
            characters[currentId].reactions[itemIdLower] = [];
          }
          characters[currentId].reactions[itemIdLower].push({
            text,
            adds,
            removes,
            removesAll,
            memoryAdds,
            memoryRemoves,
            memoryRemovesAll,
            memoryCopies,
            telegraphUpload,
            telegraphDownload,
            teleportTo,
            clearInventory,
            switchToCharacter,
            systemCall,
            requirements,
            notRequirements,
            memoryRequirements,
            memoryNotRequirements,
            comparisons,
            memoryComparisons,
          });
        }
      }
      continue;
    }

    // Handle SYSTEM lines (no text, only commands)
    if (currentType === 'system') {
      // SYSTEM lines can start with requirements or directly with commands
      // Format: (requirements) +item -item #systemcall &teleport
      let requirementsStr = '';
      let commandsStr = line;
      
      // Check if line starts with requirements
      const reqMatch = line.match(/^\(([^)]+)\)\s*(.*)$/);
      if (reqMatch) {
        requirementsStr = reqMatch[1];
        commandsStr = reqMatch[2];
      }
      
      // Parse requirements
      const { requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons } = parseRequirements(requirementsStr);
      
      // Parse commands
      const adds: string[] = [];
      const removes: string[] = [];
      const removesAll: string[] = [];
      const memoryAdds: string[] = [];
      const memoryRemoves: string[] = [];
      const memoryRemovesAll: string[] = [];
      let telegraphUpload = false;
      let telegraphDownload = false;
      let teleportTo: string | null = null;
      let clearInventory = false;
      let switchToCharacter: string | null = null;
      let systemCall: string | null = null;
      
      // Extract all +item, -item, and %item operations
      const operationMatches = commandsStr.matchAll(/([+\-%])(\w+)/g);
      for (const match of operationMatches) {
        const [, operation, targetItem] = match;
        if (operation === '+') {
          adds.push(targetItem.toLowerCase());
        } else if (operation === '-') {
          removes.push(targetItem.toLowerCase());
        } else if (operation === '%') {
          removesAll.push(targetItem.toLowerCase());
        }
      }
      
      // Check for @% (without ID) - clear all world memory
      if (commandsStr.includes('@%') && !commandsStr.match(/@%\w/)) {
        memoryRemovesAll.push('');
      }
      
      // Extract all @+memory, @-memory, and @%memory operations
      const memoryMatches = commandsStr.matchAll(/@([+\-%])(\w+_?)/g);
      for (const match of memoryMatches) {
        const [, operation, memoryId] = match;
        if (operation === '+') {
          memoryAdds.push(memoryId);
        } else if (operation === '-') {
          memoryRemoves.push(memoryId);
        } else if (operation === '%') {
          memoryRemovesAll.push(memoryId);
        }
      }
      
      // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
      const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
      const memoryCopyMatches = commandsStr.matchAll(/@(\w+)_>@(\w*)/g);
      for (const match of memoryCopyMatches) {
        const [, sourcePrefix, targetPrefix] = match;
        memoryCopies.push({ sourcePrefix, targetPrefix });
      }
      
      // Extract &ortID for teleport
      const teleportMatch = commandsStr.match(/&(\w+)/);
      if (teleportMatch) {
        teleportTo = teleportMatch[1].toLowerCase();
      }
      
      // Check for &% or %% to clear inventory
      if (commandsStr.includes('&%') || commandsStr.includes('%%')) {
        clearInventory = true;
      }
      
      // Extract §charakterID for character switch
      const characterSwitchMatch = commandsStr.match(/§(\w+)/);
      if (characterSwitchMatch) {
        switchToCharacter = characterSwitchMatch[1].toLowerCase();
      }
      
      // Extract #systemID for system call
      const systemCallMatch = commandsStr.match(/#(\w+)/);
      if (systemCallMatch) {
        systemCall = systemCallMatch[1].toLowerCase();
      }
      
      // Check for @! (upload to Telegraph)
      if (commandsStr.includes('@!')) {
        telegraphUpload = true;
      }
      
      // Check for @? (download from Telegraph)
      if (commandsStr.includes('@?')) {
        telegraphDownload = true;
      }
      
      systems[currentId].lines.push({
        adds,
        removes,
        removesAll,
        memoryAdds,
        memoryRemoves,
        memoryRemovesAll,
        memoryCopies,
        telegraphUpload,
        telegraphDownload,
        teleportTo,
        clearInventory,
        switchToCharacter,
        systemCall,
        requirements,
        notRequirements,
        memoryRequirements,
        memoryNotRequirements,
        comparisons,
        memoryComparisons,
        originalCommands: commandsStr,
      });
      
      continue;
    }

    const [key, ...valueParts] = line.split(':');
    if (!key || valueParts.length === 0) continue;

    const value = valueParts.join(':').trim();
    const keyLower = key.trim().toLowerCase();

    if (currentType === 'location') {
      if (keyLower === 'name') locations[currentId].name = value;
      else if (keyLower === 'emoji') locations[currentId].emoji = value;
      else if (keyLower === 'bild' || keyLower === 'mask') {
        locations[currentId].imageRef = value; // Store as reference, will be resolved later
      }
      else if (keyLower === 'bewohner') {
        // Parse inhabitants with optional requirements (same logic as destinations)
        const inhabitants: Inhabitant[] = [];
        let current = '';
        let parenDepth = 0;
        
        for (let i = 0; i < value.length; i++) {
          const char = value[i];
          if (char === '(') {
            parenDepth++;
            current += char;
          } else if (char === ')') {
            parenDepth--;
            current += char;
          } else if (char === ',' && parenDepth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
              const match = trimmed.match(/^(\w+)\s*(?:\(([^)]+)\))?$/);
              if (match) {
                const inhId = match[1].toLowerCase();
                const requirementsStr = match[2];
                const requirements: string[] = [];
                const notRequirements: string[] = [];
                const memoryRequirements: string[] = [];
                const memoryNotRequirements: string[] = [];
                const comparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
                const memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
                
                if (requirementsStr) {
                  requirementsStr.split(',').forEach(r => {
                    const trimmedReq = r.trim();
                    
                    // Check for comparison operators (< or >)
                    const comparisonMatch = trimmedReq.match(/^(@?)(%?)(\w+)\s*([<>])\s*(\d+)$/);
                    if (comparisonMatch) {
                      const isMemory = comparisonMatch[1] === '@';
                      const isNot = comparisonMatch[2] === '%';
                      const itemId = isMemory ? comparisonMatch[3] : comparisonMatch[3].toLowerCase();
                      const operator = comparisonMatch[4] as '<' | '>';
                      const value = parseInt(comparisonMatch[5]);
                      
                      if (isMemory) {
                        memoryComparisons.push({ itemId, operator, value });
                      } else if (!isNot) {
                        comparisons.push({ itemId, operator, value });
                      }
                      // Note: %itemID<5 doesn't make logical sense, so we ignore it
                    } else if (trimmedReq.startsWith('@%')) {
                      // @%memoryID = memory must NOT exist (case-sensitive)
                      memoryNotRequirements.push(trimmedReq.substring(2));
                    } else if (trimmedReq.startsWith('@')) {
                      // @memoryID = memory must exist (case-sensitive)
                      memoryRequirements.push(trimmedReq.substring(1));
                    } else if (trimmedReq.startsWith('%')) {
                      notRequirements.push(trimmedReq.substring(1).toLowerCase());
                    } else if (trimmedReq) {
                      requirements.push(trimmedReq.toLowerCase());
                    }
                  });
                }
                
                inhabitants.push({ id: inhId, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
              } else if (trimmed) {
                inhabitants.push({ id: trimmed.toLowerCase(), requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
              }
            }
            current = '';
          } else {
            current += char;
          }
        }
        
        const trimmed = current.trim();
        if (trimmed) {
          const match = trimmed.match(/^(\w+)\s*(?:\(([^)]+)\))?$/);
          if (match) {
            const inhId = match[1].toLowerCase();
            const requirementsStr = match[2];
            const requirements: string[] = [];
            const notRequirements: string[] = [];
            const memoryRequirements: string[] = [];
            const memoryNotRequirements: string[] = [];
            const comparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
            const memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
            
            if (requirementsStr) {
              requirementsStr.split(',').forEach(r => {
                const trimmedReq = r.trim();
                
                // Check for comparison operators (< or >)
                const comparisonMatch = trimmedReq.match(/^(@?)(%?)(\w+)\s*([<>])\s*(\d+)$/);
                if (comparisonMatch) {
                  const isMemory = comparisonMatch[1] === '@';
                  const isNot = comparisonMatch[2] === '%';
                  const itemId = isMemory ? comparisonMatch[3] : comparisonMatch[3].toLowerCase();
                  const operator = comparisonMatch[4] as '<' | '>';
                  const value = parseInt(comparisonMatch[5]);
                  
                  if (isMemory) {
                    memoryComparisons.push({ itemId, operator, value });
                  } else if (!isNot) {
                    comparisons.push({ itemId, operator, value });
                  }
                } else if (trimmedReq.startsWith('@%')) {
                  // @%memoryID = memory must NOT exist (case-sensitive)
                  memoryNotRequirements.push(trimmedReq.substring(2));
                } else if (trimmedReq.startsWith('@')) {
                  // @memoryID = memory must exist (case-sensitive)
                  memoryRequirements.push(trimmedReq.substring(1));
                } else if (trimmedReq.startsWith('%')) {
                  notRequirements.push(trimmedReq.substring(1).toLowerCase());
                } else if (trimmedReq) {
                  requirements.push(trimmedReq.toLowerCase());
                }
              });
            }
            
            inhabitants.push({ id: inhId, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
          } else if (trimmed) {
            inhabitants.push({ id: trimmed.toLowerCase(), requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
          }
        }
        
        locations[currentId].inhabitants = inhabitants;
      }
      else if (keyLower === 'ziele') {
        // Parse destinations with optional requirements
        const destinations: Destination[] = [];
        let current = '';
        let parenDepth = 0;
        
        for (let i = 0; i < value.length; i++) {
          const char = value[i];
          if (char === '(') {
            parenDepth++;
            current += char;
          } else if (char === ')') {
            parenDepth--;
            current += char;
          } else if (char === ',' && parenDepth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
              const match = trimmed.match(/^(\w+)\s*(?:\(([^)]+)\))?$/);
              if (match) {
                const destId = match[1].toLowerCase();
                const requirementsStr = match[2];
                const requirements: string[] = [];
                const notRequirements: string[] = [];
                const memoryRequirements: string[] = [];
                const memoryNotRequirements: string[] = [];
                const comparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
                const memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
                
                if (requirementsStr) {
                  requirementsStr.split(',').forEach(r => {
                    const trimmedReq = r.trim();
                    
                    // Check for comparison operators (< or >)
                    const comparisonMatch = trimmedReq.match(/^(@?)(%?)(\w+)\s*([<>])\s*(\d+)$/);
                    if (comparisonMatch) {
                      const isMemory = comparisonMatch[1] === '@';
                      const isNot = comparisonMatch[2] === '%';
                      const itemId = isMemory ? comparisonMatch[3] : comparisonMatch[3].toLowerCase();
                      const operator = comparisonMatch[4] as '<' | '>';
                      const value = parseInt(comparisonMatch[5]);
                      
                      if (isMemory) {
                        memoryComparisons.push({ itemId, operator, value });
                      } else if (!isNot) {
                        comparisons.push({ itemId, operator, value });
                      }
                    } else if (trimmedReq.startsWith('@%')) {
                      // @%memoryID = memory must NOT exist (case-sensitive)
                      memoryNotRequirements.push(trimmedReq.substring(2));
                    } else if (trimmedReq.startsWith('@')) {
                      // @memoryID = memory must exist (case-sensitive)
                      memoryRequirements.push(trimmedReq.substring(1));
                    } else if (trimmedReq.startsWith('%')) {
                      notRequirements.push(trimmedReq.substring(1).toLowerCase());
                    } else if (trimmedReq) {
                      requirements.push(trimmedReq.toLowerCase());
                    }
                  });
                }
                
                destinations.push({ id: destId, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
              } else if (trimmed) {
                destinations.push({ id: trimmed.toLowerCase(), requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
              }
            }
            current = '';
          } else {
            current += char;
          }
        }
        
        const trimmed = current.trim();
        if (trimmed) {
          const match = trimmed.match(/^(\w+)\s*(?:\(([^)]+)\))?$/);
          if (match) {
            const destId = match[1].toLowerCase();
            const requirementsStr = match[2];
            const requirements: string[] = [];
            const notRequirements: string[] = [];
            const memoryRequirements: string[] = [];
            const memoryNotRequirements: string[] = [];
            const comparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
            const memoryComparisons: { itemId: string; operator: '<' | '>'; value: number }[] = [];
            
            if (requirementsStr) {
              requirementsStr.split(',').forEach(r => {
                const trimmedReq = r.trim();
                
                // Check for comparison operators (< or >)
                const comparisonMatch = trimmedReq.match(/^(@?)(%?)(\w+)\s*([<>])\s*(\d+)$/);
                if (comparisonMatch) {
                  const isMemory = comparisonMatch[1] === '@';
                  const isNot = comparisonMatch[2] === '%';
                  const itemId = isMemory ? comparisonMatch[3] : comparisonMatch[3].toLowerCase();
                  const operator = comparisonMatch[4] as '<' | '>';
                  const value = parseInt(comparisonMatch[5]);
                  
                  if (isMemory) {
                    memoryComparisons.push({ itemId, operator, value });
                  } else if (!isNot) {
                    comparisons.push({ itemId, operator, value });
                  }
                } else if (trimmedReq.startsWith('@%')) {
                  // @%memoryID = memory must NOT exist (case-sensitive)
                  memoryNotRequirements.push(trimmedReq.substring(2));
                } else if (trimmedReq.startsWith('@')) {
                  // @memoryID = memory must exist (case-sensitive)
                  memoryRequirements.push(trimmedReq.substring(1));
                } else if (trimmedReq.startsWith('%')) {
                  notRequirements.push(trimmedReq.substring(1).toLowerCase());
                } else if (trimmedReq) {
                  requirements.push(trimmedReq.toLowerCase());
                }
              });
            }
            
            destinations.push({ id: destId, requirements, notRequirements, memoryRequirements, memoryNotRequirements, comparisons, memoryComparisons });
          } else if (trimmed) {
            destinations.push({ id: trimmed.toLowerCase(), requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
          }
        }
        
        locations[currentId].destinations = destinations;
      }
    } else if (currentType === 'character') {
      if (keyLower === 'name') characters[currentId].name = value;
      else if (keyLower === 'emoji') characters[currentId].emoji = value;
      else if (keyLower === 'bild' || keyLower === 'mask') {
        characters[currentId].imageRef = value; // Store as reference, will be resolved later
      }
      else if (keyLower === 'begruessung' || keyLower === 'begrüssung') {
        // If value is empty, collect greeting lines that follow
        if (!value) {
          // Look ahead for greeting lines (lines that start with quotes)
          let j = i + 1;
          while (j < lines.length) {
            const nextLine = lines[j].trim();
            // Stop if we hit a new key:value line or a new definition (SCENE, PERSON, SYMBOL)
            if (!nextLine || nextLine.startsWith('#') || nextLine.startsWith('SCENE ') || nextLine.startsWith('PERSON ') || nextLine.startsWith('SYMBOL ') || (nextLine.includes(':') && !nextLine.startsWith('\"'))) {
              break;
            }
            
            // Check if line starts with a quote
            const greetingMatch = nextLine.match(/^["']([^"']+)["'](.*)$/);
            if (greetingMatch) {
              const text = greetingMatch[1];
              const operationsStr = greetingMatch[2];
              const adds: string[] = [];
              const removes: string[] = [];
              const removesAll: string[] = [];
              const memoryAdds: string[] = [];
              const memoryRemoves: string[] = [];
              const memoryRemovesAll: string[] = [];
              let teleportTo: string | null = null;
              let clearInventory = false;
              let switchToCharacter: string | null = null;
              let telegraphUpload = false;
              let telegraphDownload = false;
              
              // Extract all +item, -item, and %item operations
              const operationMatches = operationsStr.matchAll(/([+\-%])(\w+)/g);
              for (const match of operationMatches) {
                const [, operation, targetItem] = match;
                if (operation === '+') {
                  adds.push(targetItem.toLowerCase());
                } else if (operation === '-') {
                  removes.push(targetItem.toLowerCase());
                } else if (operation === '%') {
                  removesAll.push(targetItem.toLowerCase());
                }
              }
              
              // Check for @% (without ID) - clear all world memory
              if (operationsStr.includes('@%') && !operationsStr.match(/@%\w/)) {
                memoryRemovesAll.push('');
              }
              
              // Extract all @+memory, @-memory, and @%memory operations
              const memoryMatches = operationsStr.matchAll(/@([+\-%])(\w+_?)/g);
              for (const match of memoryMatches) {
                const [, operation, memoryId] = match;
                if (operation === '+') {
                  memoryAdds.push(memoryId);
                } else if (operation === '-') {
                  memoryRemoves.push(memoryId);
                } else if (operation === '%') {
                  memoryRemovesAll.push(memoryId);
                }
              }
              
              // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
              const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
              const memoryCopyMatches = operationsStr.matchAll(/@(\w+)_>@(\w*)/g);
              for (const match of memoryCopyMatches) {
                const [, sourcePrefix, targetPrefix] = match;
                memoryCopies.push({ sourcePrefix, targetPrefix });
              }
              
              // Extract &ortID for teleport
              const teleportMatch = operationsStr.match(/&(\w+)/);
              if (teleportMatch) {
                teleportTo = teleportMatch[1].toLowerCase();
              }
              
              // Check for &% or %% to clear inventory
              if (operationsStr.includes('&%') || operationsStr.includes('%%')) {
                clearInventory = true;
              }
              
              // Extract §charakterID for character switch
              const characterSwitchMatch = operationsStr.match(/§(\w+)/);
              if (characterSwitchMatch) {
                switchToCharacter = characterSwitchMatch[1].toLowerCase();
              }
              
              // Extract #systemID for system call
              let systemCall: string | null = null;
              const systemCallMatch = operationsStr.match(/#(\w+)/);
              if (systemCallMatch) {
                systemCall = systemCallMatch[1].toLowerCase();
              }
              
              // Check for @! (upload to Telegraph)
              if (operationsStr.includes('@!')) {
                telegraphUpload = true;
              }
              
              // Check for @? (download from Telegraph)
              if (operationsStr.includes('@?')) {
                telegraphDownload = true;
              }
              
              characters[currentId].greetings.push({ text, adds, removes, removesAll, memoryAdds, memoryRemoves, memoryRemovesAll, memoryCopies, telegraphUpload, telegraphDownload, teleportTo, clearInventory, switchToCharacter, systemCall, requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
            }
            j++;
          }
          // Skip the lines we just processed
          i = j - 1;
        } else {
          // Single line greeting (old format support)
          const quotedMatch = value.match(/^["']([^"']+)["'](.*)$/);
          let text: string;
          let operationsStr: string;
          
          if (quotedMatch) {
            text = quotedMatch[1];
            operationsStr = quotedMatch[2];
          } else {
            text = value;
            operationsStr = '';
          }
          
          const adds: string[] = [];
          const removes: string[] = [];
          const removesAll: string[] = [];
          const memoryAdds: string[] = [];
          const memoryRemoves: string[] = [];
          const memoryRemovesAll: string[] = [];
          let teleportTo: string | null = null;
          let clearInventory = false;
          let switchToCharacter: string | null = null;
          let telegraphUpload = false;
          let telegraphDownload = false;
          
          // Extract all +item, -item, and %item operations
          const operationMatches = operationsStr.matchAll(/([+\-%])(\w+)/g);
          for (const match of operationMatches) {
            const [, operation, targetItem] = match;
            if (operation === '+') {
              adds.push(targetItem.toLowerCase());
            } else if (operation === '-') {
              removes.push(targetItem.toLowerCase());
            } else if (operation === '%') {
              removesAll.push(targetItem.toLowerCase());
            }
          }
          
          // Check for @% (without ID) - clear all world memory
          if (operationsStr.includes('@%') && !operationsStr.match(/@%\w/)) {
            memoryRemovesAll.push('');
          }
          
          // Extract all @+memory, @-memory, and @%memory operations
          const memoryMatches = operationsStr.matchAll(/@([+\-%])(\w+_?)/g);
          for (const match of memoryMatches) {
            const [, operation, memoryId] = match;
            if (operation === '+') {
              memoryAdds.push(memoryId);
            } else if (operation === '-') {
              memoryRemoves.push(memoryId);
            } else if (operation === '%') {
              memoryRemovesAll.push(memoryId);
            }
          }
          
          // Extract @id_>@id2_ operations (wildcard copy suffix) - store for later execution
          const memoryCopies: { sourcePrefix: string; targetPrefix: string }[] = [];
          const memoryCopyMatches = operationsStr.matchAll(/@(\w+)_>@(\w*)/g);
          for (const match of memoryCopyMatches) {
            const [, sourcePrefix, targetPrefix] = match;
            memoryCopies.push({ sourcePrefix, targetPrefix });
          }
          
          // Extract &ortID for teleport
          const teleportMatch = operationsStr.match(/&(\w+)/);
          if (teleportMatch) {
            teleportTo = teleportMatch[1].toLowerCase();
          }
          
          // Check for &% or %% to clear inventory
          if (operationsStr.includes('&%') || operationsStr.includes('%%')) {
            clearInventory = true;
          }
          
          // Extract §charakterID for character switch
          const characterSwitchMatch = operationsStr.match(/§(\w+)/);
          if (characterSwitchMatch) {
            switchToCharacter = characterSwitchMatch[1].toLowerCase();
          }
          
          // Extract #systemID for system call
          let systemCall: string | null = null;
          const systemCallMatch = operationsStr.match(/#(\w+)/);
          if (systemCallMatch) {
            systemCall = systemCallMatch[1].toLowerCase();
          }
          
          // Check for @! (upload to Telegraph)
          if (operationsStr.includes('@!')) {
            telegraphUpload = true;
          }
          
          // Check for @? (download from Telegraph)
          if (operationsStr.includes('@?')) {
            telegraphDownload = true;
          }
          
          characters[currentId].greetings.push({ text, adds, removes, removesAll, memoryAdds, memoryRemoves, memoryRemovesAll, memoryCopies, telegraphUpload, telegraphDownload, teleportTo, clearInventory, switchToCharacter, systemCall, requirements: [], notRequirements: [], memoryRequirements: [], memoryNotRequirements: [], comparisons: [], memoryComparisons: [] });
        }
      }
    } else if (currentType === 'item') {
      if (keyLower === 'name') items[currentId].name = value;
      else if (keyLower === 'emoji') items[currentId].emoji = value;
      else if (keyLower === 'bild' || keyLower === 'mask') {
        items[currentId].imageRef = value; // Store as reference, will be resolved later
      }
    }
  }

  // Resolve images from assetBackend
  if (assetBackend) {
    // Helper function to find image in backend by ID with underscore fallback
    const findImageByID = (id: string, enableInherit: boolean): string => {
      // Check for common image extensions
      const extensions = ['jpg', 'jpeg', 'png'];
      
      // First try the exact ID
      for (const ext of extensions) {
        const filename = `${id}.${ext}`;
        if (assetBackend[filename]) {
          return assetBackend[filename];
        }
      }
      
      // If ID contains underscores, try progressively removing them from right to left
      if (enableInherit && id.includes('_')) {
        const parts = id.split('_');
        // Try removing one part at a time from the end
        for (let i = parts.length - 1; i > 0; i--) {
          const fallbackId = parts.slice(0, i).join('_');
          for (const ext of extensions) {
            const filename = `${fallbackId}.${ext}`;
            if (assetBackend[filename]) {
              return assetBackend[filename];
            }
          }
        }
      }
      
      return '';
    };

    // Helper function to find imageRef fallback by ID with underscore inheritance
    const findImageRefByID = (id: string, collection: Record<string, { imageRef?: string }>, enableInherit: boolean): string => {
      // If ID contains underscore, try fallback chain
      if (enableInherit && id.includes('_')) {
        const parts = id.split('_');
        // Try progressively shorter IDs (remove suffix parts)
        for (let i = parts.length - 1; i > 0; i--) {
          const fallbackId = parts.slice(0, i).join('_');
          // Use imageRef from fallback if it exists
          if (collection[fallbackId] && collection[fallbackId].imageRef) {
            return collection[fallbackId].imageRef!;
          }
        }
      }
      return '';
    };

    const enableInherit = debug?.inherit !== false; // Default to true if not specified

    // First pass: inherit imageRef via underscore fallback
    for (const id in locations) {
      if (!locations[id].imageRef) {
        locations[id].imageRef = findImageRefByID(id, locations, enableInherit);
      }
    }

    for (const id in characters) {
      if (!characters[id].imageRef) {
        characters[id].imageRef = findImageRefByID(id, characters, enableInherit);
      }
    }

    for (const id in items) {
      if (!items[id].imageRef) {
        items[id].imageRef = findImageRefByID(id, items, enableInherit);
      }
    }

    // Second pass: resolve images from assetBackend or imageRef
    // For items WITHOUT imageRef: use normal underscore fallback via findImageByID
    // For items WITH imageRef: we'll resolve them in the next pass after all base images are loaded
    for (const id in locations) {
      if (!locations[id].imageRef) {
        // No explicit reference, use normal ID-based lookup with underscore fallback
        locations[id].image = findImageByID(id, enableInherit);
      }
      // If imageRef exists, leave image empty for now
    }

    // Process characters
    for (const id in characters) {
      if (!characters[id].imageRef) {
        // No explicit reference, use normal ID-based lookup with underscore fallback
        characters[id].image = findImageByID(id, enableInherit);
      }
      // If imageRef exists, leave image empty for now
    }

    // Process items
    for (const id in items) {
      if (!items[id].imageRef) {
        // No explicit reference, use normal ID-based lookup with underscore fallback
        items[id].image = findImageByID(id, enableInherit);
      }
      // If imageRef exists, leave image empty for now
    }

    // Second pass: resolve imageRef references
    // Now all base images are loaded, we can resolve references to them
    for (const id in locations) {
      if (locations[id].imageRef) {
        const refId = locations[id].imageRef!.toLowerCase();
        // Check locations
        if (locations[refId]) {
          locations[id].image = locations[refId].image;
        }
        // Check characters
        else if (characters[refId]) {
          locations[id].image = characters[refId].image;
        }
        // Check items
        else if (items[refId]) {
          locations[id].image = items[refId].image;
        }
        // If reference not found or has no image, leave empty
      }
    }

    for (const id in characters) {
      if (characters[id].imageRef) {
        const refId = characters[id].imageRef!.toLowerCase();
        // Check locations
        if (locations[refId]) {
          characters[id].image = locations[refId].image;
        }
        // Check characters
        else if (characters[refId]) {
          characters[id].image = characters[refId].image;
        }
        // Check items
        else if (items[refId]) {
          characters[id].image = items[refId].image;
        }
        // If reference not found or has no image, leave empty
      }
    }

    for (const id in items) {
      if (items[id].imageRef) {
        const refId = items[id].imageRef!.toLowerCase();
        // Check locations
        if (locations[refId]) {
          items[id].image = locations[refId].image;
        }
        // Check characters
        else if (characters[refId]) {
          items[id].image = characters[refId].image;
        }
        // Check items
        else if (items[refId]) {
          items[id].image = items[refId].image;
        }
        // If reference not found or has no image, leave empty
      }
    }

    // Helper function to find name fallback by ID (similar to findImageByID)
    const findNameByID = (id: string, collection: Record<string, { name: string }>, enableInherit: boolean): string => {
      // If ID contains underscore, try fallback chain
      if (enableInherit && id.includes('_')) {
        const parts = id.split('_');
        // Try progressively shorter IDs (remove suffix parts)
        for (let i = parts.length - 1; i > 0; i--) {
          const fallbackId = parts.slice(0, i).join('_');
          // Only use as fallback if it has a real name (not '\0' marker and not empty string)
          if (collection[fallbackId] && collection[fallbackId].name !== '\0' && collection[fallbackId].name !== '') {
            return collection[fallbackId].name;
          }
        }
      }
      return '';
    };

    // Process name fallbacks for locations
    for (const id in locations) {
      if (locations[id].name === '\0') {
        // Special marker: no parentheses - use fallback
        locations[id].name = findNameByID(id, locations, enableInherit) || id;
      }
    }

    // Process name fallbacks for characters
    for (const id in characters) {
      if (characters[id].name === '\0') {
        // Special marker: no parentheses - use fallback
        characters[id].name = findNameByID(id, characters, enableInherit) || id;
      }
    }

    // Process name fallbacks for items
    for (const id in items) {
      if (items[id].name === '\0') {
        // Special marker: no parentheses - use fallback
        items[id].name = findNameByID(id, items, enableInherit) || id;
      }
    }
  }

  return { locations, characters, items, systems, debug };
}

// Function to dynamically load Google Fonts
function loadGoogleFont(fontFamily: string) {
  // Check if font is already loaded
  const existingLink = document.querySelector(`link[data-font="${fontFamily}"]`);
  if (existingLink) return;

  // Convert font family to Google Fonts URL format
  const fontUrl = fontFamily.replace(/\s+/g, '+');
  
  // Use Google Fonts API v1 for maximum compatibility
  // This loads all available variants of the font
  const link = document.createElement('link');
  link.href = `https://fonts.googleapis.com/css?family=${fontUrl}:400,400i,700,700i&display=swap`;
  link.rel = 'stylesheet';
  link.setAttribute('data-font', fontFamily);
  document.head.appendChild(link);
  
  console.log(`🔤 Loading Google Font: ${fontFamily} from ${link.href}`);
}

interface DraggableItemProps {
  itemId: string;
  emoji: string;
  image: string;
  name: string;
  count: number;
  disabled: boolean;
  onItemClick?: (itemId: string) => void;
  textColor: string;
  labelFont: string;
  labelFontSize?: string;
  labelFontStyle?: string;
}

function DraggableItem({ itemId, emoji, image, name, count, disabled, onItemClick, textColor, labelFont, labelFontSize, labelFontStyle }: DraggableItemProps) {
  const isMobile = useIsMobile();
  const [{ isDragging }, drag] = useDrag(() => ({
    type: 'INVENTORY_ITEM',
    item: { itemId },
    canDrag: !disabled,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [itemId, disabled]);

  const handleClick = () => {
    if (!disabled && onItemClick) {
      onItemClick(itemId);
    }
  };

  const itemSize = isMobile ? 'w-[85px]' : 'min-w-[160px]';
  const itemHeight = image ? (isMobile ? 'h-[85px]' : 'h-[80px]') : '';

  return (
    <div
      ref={drag}
      onClick={handleClick}
      className={`${itemSize} ${itemHeight} rounded flex flex-col items-center justify-center relative group opacity-50 ${
        !disabled ? 'cursor-pointer !opacity-100' : 'cursor-not-allowed'
      } ${isDragging ? '!opacity-30' : ''}`}
    >
      {image ? (
        <>
          <ImageWithFallback 
            src={image} 
            alt={name}
            className="w-8 h-8 object-cover"
          />
          {/* Count badge for items with images */}
          {count > 1 && (
            <div 
              className={`absolute text-m ${isMobile ? 'top-1 right-1' : 'top-1 left-[calc(50%+24px)]'}`}
              style={{ 
                fontFamily: labelFont + ', serif', 
                fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal',
                fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
                color: textColor 
              }}
            >
              {count}
            </div>
          )}
        </>
      ) : (
        <div className="text-[32px] leading-none">{emoji}</div>
      )}
      {name !== '' && (
        <div 
          className={`mt-1 text-center px-1 hyphens-auto break-words ${!disabled ? 'group-hover:underline' : ''}`} 
          style={{ 
            fontFamily: labelFont + ', serif', 
            fontSize: labelFontSize || '0.7rem', 
            fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
            fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal',
            color: textColor
          }} 
          lang="de"
        >
          {name}{!image && count > 1 ? ` (${count})` : ''}
        </div>
      )}
    </div>
  );
}

interface CharacterDropZoneProps {
  character: Character | null;
  characterResponse: string | null;
  canAdvance: boolean;
  isGreeting: boolean;
  onItemDropped: (itemId: string) => void;
  onClick: () => void;
  onGiveNothing: () => void;
  textColor: string;
  textFont: string;
  labelFont: string;
  textFontSize?: string;
  textFontStyle?: string;
  labelFontSize?: string;
  labelFontStyle?: string;
}

function CharacterDropZone({ character, characterResponse, canAdvance, isGreeting, onItemDropped, onClick, onGiveNothing, textColor, textFont, labelFont, textFontSize, textFontStyle, labelFontSize, labelFontStyle }: CharacterDropZoneProps) {
  const isMobile = useIsMobile();
  const [{ isOver }, drop] = useDrop(() => ({
    accept: 'INVENTORY_ITEM',
    drop: (item: { itemId: string }) => {
      onItemDropped(item.itemId);
    },
    collect: (monitor) => ({
      isOver: monitor.isOver(),
    }),
  }), [onItemDropped]);

  const handleClick = () => {
    if (isGreeting) {
      onGiveNothing();
    } else if (canAdvance) {
      onClick();
    }
  };

  // Desktop: 0.809em, Mobile: 15% smaller (0.952em * 0.85 = 0.809em)
  const responseFontSize = isMobile ? '0.809em' : '0.809em';
  
  // Determine text alignment based on character length and device
  const responseLength = (characterResponse || '').length;
  const textAlign = isMobile 
    ? (responseLength >= 45 ? 'left' : 'center')
    : (responseLength >= 60 ? 'left' : 'center');

  return (
    <div
      ref={drop}
      onClick={handleClick}
      className={`absolute w-full h-full max-h-full overflow-y-auto flex flex-col items-center transition-all pt-4 md:pt-0 ${
        isOver ? 'bg-gray-900 bg-opacity-30' : ''
      } ${(canAdvance || isGreeting) ? 'cursor-pointer' : ''}`}
    >
      {character && (
        <>
          {character.image ? (
            <img 
              src={character.image} 
              alt={character.name}
              className={`mb-4 object-cover ${isMobile ? 'w-[84px] h-[84px]' : 'w-[100px] h-[100px]'}`}
            />
          ) : (
            <div className={`mb-4 ${isMobile ? 'text-4xl' : 'text-5xl'}`}>{character.emoji}</div>
          )}
          <div className="text-xl" style={{ maxWidth: isMobile ? 'none' : '600px', width: '100%', paddingLeft: isMobile ? '10px' : '16px', paddingRight: isMobile ? '10px' : '16px' }}>
            {character.name !== '' && (
              <div 
                style={{ 
                  fontFamily: labelFont + ', serif', 
                  fontSize: labelFontSize || (isMobile ? '13px' : '0.4em'), 
                  textTransform: 'uppercase', 
                  color: textColor, 
                  opacity: 0.75,
                  fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
                  fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal'
                }}
              >
                {character.name}
              </div>
            )}
            <div 
              className="mt-2 pb-4" 
              style={{ 
                color: textColor, 
                fontSize: textFontSize || responseFontSize, 
                fontFamily: textFont, 
                fontWeight: textFontStyle?.includes('bold') ? 'bold' : (isMobile ? 'normal' : 300), 
                fontStyle: textFontStyle?.includes('italic') ? 'italic' : 'normal',
                textAlign, 
                hyphens: 'auto' 
              }}
            >
              {characterResponse || '...'}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

interface InventoryItem {
  count: number;
  lastAdded: number;
}

function Game() {
  const [script, setScript] = useState(DEFAULT_SCRIPT);
  const [isEditorMode, setIsEditorMode] = useState(false);
  const [currentLocation, setCurrentLocation] = useState('wald');
  const [currentCharacter, setCurrentCharacter] = useState<string | null>(null);
  const [inventory, setInventory] = useState<{[itemId: string]: InventoryItem}>({});
  const [worldMemory, setWorldMemory] = useState<{[memoryId: string]: number}>({});
  const [isTelegraphSyncing, setIsTelegraphSyncing] = useState(false);
  const [characterResponse, setCharacterResponse] = useState<string | null>(null);
  const [middlePanel, setMiddlePanel] = useState<'character' | 'destinations'>('character');
  const [canAdvance, setCanAdvance] = useState(false);
  const [isGreeting, setIsGreeting] = useState(true);
  const [currentGreeting, setCurrentGreeting] = useState<GreetingOption | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [telegraphMode, setTelegraphMode] = useState<'online' | 'local'>('local');
  const [telegraphPath, setTelegraphPath] = useState<string>('');
  const [telegraphToken, setTelegraphToken] = useState<string>('');
  const [isDisconnectedLocalMode, setIsDisconnectedLocalMode] = useState(false);
  const [pendingTeleport, setPendingTeleport] = useState<string | null>(null);
  const [pendingCharacterSwitch, setPendingCharacterSwitch] = useState<string | null>(null);
  const [pendingReactionEffects, setPendingReactionEffects] = useState<ReactionOption | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [animationKey, setAnimationKey] = useState(0);
  const [isMobile, setIsMobile] = useState(false);
  const [assetBackend, setAssetBackend] = useState<{[filename: string]: string}>({});
  const [showTelegraphDialog, setShowTelegraphDialog] = useState(false);
  const [telegraphDialogName, setTelegraphDialogName] = useState('');
  const [telegraphDialogMessage, setTelegraphDialogMessage] = useState('');
  const [telegraphDialogCreated, setTelegraphDialogCreated] = useState(false);
  const [telegraphDialogCopyText, setTelegraphDialogCopyText] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isFullscreenAvailable, setIsFullscreenAvailable] = useState(false);
  const characterSystemCallExecuted = useRef<string | null>(null); // Track which character had system call executed
  const autoSkipTriggered = useRef<number>(0); // Track animation key to prevent multiple triggers
  const [shouldAutoAdvance, setShouldAutoAdvance] = useState(false);

  const gameData = useMemo(() => parseScript(script, assetBackend), [script, assetBackend]);

  // Extract theme values from debug block with defaults
  const backgroundColor = gameData.debug?.background || '#000000';
  const textColor = gameData.debug?.textColor || '#e6e6e6';
  const textFont = gameData.debug?.textFont || 'IM Fell English';
  const labelFont = gameData.debug?.labelFont || 'IM Fell English';
  const textFontSize = gameData.debug?.textFontSize;
  const textFontStyle = gameData.debug?.textFontStyle || 'italic';
  const labelFontSize = gameData.debug?.labelFontSize;
  const labelFontStyle = gameData.debug?.labelFontStyle || 'normal';
  const animationStyle = gameData.debug?.animation || 'page';

  // Load Google Fonts dynamically
  useEffect(() => {
    if (textFont && textFont !== 'IM Fell English') {
      loadGoogleFont(textFont);
    }
    if (labelFont && labelFont !== 'IM Fell English' && labelFont !== textFont) {
      loadGoogleFont(labelFont);
    }
  }, [textFont, labelFont]);

  // Auto-skip when reaction text is "." - simulate immediate click
  useEffect(() => {
    if (characterResponse === '.' && !isGreeting && canAdvance && autoSkipTriggered.current !== animationKey) {
      autoSkipTriggered.current = animationKey;
      // Use setTimeout to ensure the state has been set and animation has started
      const timer = setTimeout(() => {
        setShouldAutoAdvance(true);
      }, 50);
      
      return () => clearTimeout(timer);
    }
  }, [characterResponse, animationKey, isGreeting, canAdvance]);

  // Trigger auto-advance when shouldAutoAdvance flag is set
  useEffect(() => {
    if (shouldAutoAdvance) {
      handleMiddlePanelClick();
    }
  }, [shouldAutoAdvance]);

  // Execute start commands from debug block
  // Commands format: +item -item @+memory @-memory @%memory @% #system &location §character
  // Order: 1. inventory/memory ops, 2. systems, 3. teleport/switch
  const executeStartCommands = async (
    commandsStr: string,
    currentInventory: {[itemId: string]: InventoryItem},
    currentMemory: {[memoryId: string]: number}
  ): Promise<{
    teleportTo: string | null;
    switchToCharacter: string | null;
    telegraphUpload: boolean;
    telegraphDownload: boolean;
  }> => {
    const result = {
      teleportTo: null as string | null,
      switchToCharacter: null as string | null,
      telegraphUpload: false,
      telegraphDownload: false,
    };

    if (!commandsStr) return result;

    // 1. First pass: inventory and memory operations
    // Extract all +item operations (but not @+memory)
    // Use a simple approach: find all +word, then filter out @+word
    const allPlusMatches = [...commandsStr.matchAll(/\+(\w+)/g)];
    const memoryPlusMatches = [...commandsStr.matchAll(/@\+(\w+)/g)].map(m => m[1]);
    const addMatches = allPlusMatches.filter(match => !memoryPlusMatches.includes(match[1]));
    
    for (const match of addMatches) {
      const itemId = match[1];
      const itemIdLower = itemId.toLowerCase();
      if (!currentInventory[itemIdLower]) {
        currentInventory[itemIdLower] = { count: 0, lastAdded: Date.now() };
      }
      currentInventory[itemIdLower].count++;
      currentInventory[itemIdLower].lastAdded = Date.now();
    }

    // Extract all -item operations (but not @-memory)
    // Use a simple approach: find all -word, then filter out @-word
    const allMinusMatches = [...commandsStr.matchAll(/-(\w+)/g)];
    const memoryMinusMatches = [...commandsStr.matchAll(/@-(\w+)/g)].map(m => m[1]);
    const removeMatches = allMinusMatches.filter(match => !memoryMinusMatches.includes(match[1]));
    
    for (const match of removeMatches) {
      const itemId = match[1];
      const itemIdLower = itemId.toLowerCase();
      if (currentInventory[itemIdLower]) {
        currentInventory[itemIdLower].count--;
        if (currentInventory[itemIdLower].count <= 0) {
          delete currentInventory[itemIdLower];
        }
      }
    }

    // Extract all @+memory operations
    const memoryAddMatches = commandsStr.matchAll(/@\+(\w+)/g);
    for (const match of memoryAddMatches) {
      const memoryId = match[1];
      currentMemory[memoryId] = (currentMemory[memoryId] || 0) + 1;
    }

    // Extract all @-memory operations
    const memoryRemoveMatches = commandsStr.matchAll(/@-(\w+)/g);
    for (const match of memoryRemoveMatches) {
      const memoryId = match[1];
      if (currentMemory[memoryId]) {
        currentMemory[memoryId]--;
        if (currentMemory[memoryId] <= 0) {
          delete currentMemory[memoryId];
        }
      }
    }

    // Check for @% (clear all world memory)
    if (commandsStr.includes('@%') && !commandsStr.match(/@%\w/)) {
      // @% without any letter following means clear everything
      Object.keys(currentMemory).forEach(key => delete currentMemory[key]);
      currentMemory['empty'] = 1;
    }

    // Extract all @%memory operations (remove all instances)
    const memoryRemoveAllMatches = commandsStr.matchAll(/@%(\w+_?)/g);
    for (const match of memoryRemoveAllMatches) {
      const memoryId = match[1];
      if (memoryId.endsWith('_')) {
        // Wildcard pattern: remove all memory entries starting with this prefix
        const prefix = memoryId;
        Object.keys(currentMemory).forEach(key => {
          if (key.startsWith(prefix)) {
            delete currentMemory[key];
          }
        });
      } else {
        // Exact match: remove specific memory entry completely
        delete currentMemory[memoryId];
      }
    }

    // Extract @id_>@id2_ operations (wildcard copy suffix)
    const memoryCopyMatches = commandsStr.matchAll(/@(\w+)_>@(\w*)/g);
    for (const match of memoryCopyMatches) {
      const [, sourcePrefix, targetPrefix] = match;
      // Find all memory entries that start with sourcePrefix_
      const matchingKeys = Object.keys(currentMemory).filter(key => key.startsWith(sourcePrefix + '_'));
      if (matchingKeys.length > 0) {
        // Pick a random one
        const randomKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
        // Extract the suffix (everything after sourcePrefix_)
        const suffix = randomKey.substring((sourcePrefix + '_').length);
        // Create new entry with targetPrefix + suffix
        const newKey = targetPrefix + suffix;
        currentMemory[newKey] = (currentMemory[newKey] || 0) + 1;
      }
    }

    // 2. Second pass: system calls
    const systemMatches = commandsStr.matchAll(/#(\w+)/g);
    for (const match of systemMatches) {
      const systemId = match[1].toLowerCase();
      const system = gameData.systems[systemId];
      if (system) {
        const systemResult = await executeSystem(systemId, currentInventory, currentMemory);
        // System results override
        if (systemResult.teleportTo) {
          result.teleportTo = systemResult.teleportTo;
        }
        if (systemResult.switchToCharacter) {
          result.switchToCharacter = systemResult.switchToCharacter;
        }
        if (systemResult.telegraphUpload) {
          result.telegraphUpload = true;
        }
        if (systemResult.telegraphDownload) {
          result.telegraphDownload = true;
        }
      }
    }

    // 3. Third pass: teleport and character switch
    const teleportMatch = commandsStr.match(/&(\w+)/);
    if (teleportMatch) {
      result.teleportTo = teleportMatch[1].toLowerCase();
    }

    // Check for &% or %% to clear inventory
    if (commandsStr.includes('&%') || commandsStr.includes('%%')) {
      Object.keys(currentInventory).forEach(key => delete currentInventory[key]);
    }

    const characterSwitchMatch = commandsStr.match(/§(\w+)/);
    if (characterSwitchMatch) {
      result.switchToCharacter = characterSwitchMatch[1].toLowerCase();
    }

    // 4. Fourth pass: Telegraph sync commands - execute IMMEDIATELY
    if (commandsStr.includes('@!')) {
      console.log(`  📡 [START] Uploading world memory to Telegraph...`);
      console.log(`  📡 [START] Current memory state:`, currentMemory);
      console.log(`  📡 [START] Memory keys:`, Object.keys(currentMemory));
      console.log(`  📡 [START] Telegraph mode:`, telegraphMode);
      console.log(`  📡 [START] Telegraph path:`, telegraphPath);
      if (telegraphMode === 'online' && telegraphPath) {
        await saveWorldMemoryToTelegraph(currentMemory);
      }
      result.telegraphUpload = true;
    }
    if (commandsStr.includes('@?')) {
      console.log(`  📡 [START] Downloading world memory from Telegraph...`);
      if (telegraphMode === 'online' && telegraphPath) {
        const downloadedMemory = await loadWorldMemoryFromTelegraph(telegraphPath);
        if (downloadedMemory !== null) {
          Object.keys(currentMemory).forEach(key => delete currentMemory[key]);
          Object.assign(currentMemory, downloadedMemory);
          console.log(`  💾 [START] World memory replaced with Telegraph data`);
        }
      }
      result.telegraphDownload = true;
    }

    return result;
  };

  // Execute only inventory/memory commands from greeting (NO system calls, NO teleport/switch)
  // Called IMMEDIATELY when greeting is shown
  const executeGreetingInventoryAndMemory = (
    greeting: GreetingOption,
    currentInventory: {[itemId: string]: InventoryItem},
    currentMemory: {[memoryId: string]: number}
  ): {
    inventory: {[itemId: string]: InventoryItem};
    memory: {[memoryId: string]: number};
  } => {
    let newInventory = { ...currentInventory };
    let newMemory = { ...currentMemory };
    
    // Clear inventory if specified
    if (greeting.clearInventory) {
      newInventory = {};
    }
    
    // Add items
    greeting.adds.forEach(itemId => {
      if (!newInventory[itemId]) {
        newInventory[itemId] = { count: 0, lastAdded: Date.now() };
      }
      newInventory[itemId] = {
        count: newInventory[itemId].count + 1,
        lastAdded: Date.now()
      };
    });
    
    // Remove items (one instance)
    greeting.removes.forEach(itemId => {
      if (newInventory[itemId] && newInventory[itemId].count > 0) {
        const newCount = newInventory[itemId].count - 1;
        if (newCount === 0) {
          delete newInventory[itemId];
        } else {
          newInventory[itemId] = {
            ...newInventory[itemId],
            count: newCount
          };
        }
      }
    });
    
    // Remove all instances of items
    greeting.removesAll.forEach(itemId => {
      if (itemId.endsWith('_')) {
        const prefix = itemId;
        Object.keys(newInventory).forEach(key => {
          if (key.startsWith(prefix)) {
            delete newInventory[key];
          }
        });
      } else {
        delete newInventory[itemId];
      }
    });
    
    // Add world memory entries
    greeting.memoryAdds.forEach(memoryId => {
      newMemory[memoryId] = (newMemory[memoryId] || 0) + 1;
    });
    
    // Remove world memory entries (one instance)
    greeting.memoryRemoves.forEach(memoryId => {
      if (newMemory[memoryId] && newMemory[memoryId] > 0) {
        const newCount = newMemory[memoryId] - 1;
        if (newCount === 0) {
          delete newMemory[memoryId];
        } else {
          newMemory[memoryId] = newCount;
        }
      }
    });
    
    // Remove all instances of memory
    greeting.memoryRemovesAll.forEach(memoryId => {
      if (memoryId === '') {
        newMemory = {};
      } else if (memoryId.endsWith('_')) {
        const prefix = memoryId;
        Object.keys(newMemory).forEach(key => {
          if (key.startsWith(prefix)) {
            delete newMemory[key];
          }
        });
      } else {
        delete newMemory[memoryId];
      }
    });
    
    // Execute memory copy operations (@id_>@id2_)
    greeting.memoryCopies.forEach(({ sourcePrefix, targetPrefix }) => {
      // Find all memory entries that start with sourcePrefix_
      const matchingKeys = Object.keys(newMemory).filter(key => key.startsWith(sourcePrefix + '_'));
      if (matchingKeys.length > 0) {
        // Pick a random one
        const randomKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
        // Extract the suffix (everything after sourcePrefix_)
        const suffix = randomKey.substring((sourcePrefix + '_').length);
        // Create new entry with targetPrefix + suffix
        const newKey = targetPrefix + suffix;
        newMemory[newKey] = (newMemory[newKey] || 0) + 1;
      }
    });
    
    return { inventory: newInventory, memory: newMemory };
  };

  // Execute greeting commands (inventory, memory, system calls)
  // Returns the modified inventory and memory
  const executeGreetingCommands = async (
    greeting: GreetingOption,
    currentInventory: {[itemId: string]: InventoryItem},
    currentMemory: {[memoryId: string]: number}
  ): Promise<{
    inventory: {[itemId: string]: InventoryItem};
    memory: {[memoryId: string]: number};
    systemResult: {
      teleportTo: string | null;
      switchToCharacter: string | null;
      telegraphUpload: boolean;
      telegraphDownload: boolean;
    };
  }> => {
    let newInventory = { ...currentInventory };
    let newMemory = { ...currentMemory };
    
    // Clear inventory if specified
    if (greeting.clearInventory) {
      newInventory = {};
    }
    
    // Add items
    greeting.adds.forEach(itemId => {
      if (!newInventory[itemId]) {
        newInventory[itemId] = { count: 0, lastAdded: Date.now() };
      }
      newInventory[itemId] = {
        count: newInventory[itemId].count + 1,
        lastAdded: Date.now()
      };
    });
    
    // Remove items (one instance)
    greeting.removes.forEach(itemId => {
      if (newInventory[itemId] && newInventory[itemId].count > 0) {
        const newCount = newInventory[itemId].count - 1;
        if (newCount === 0) {
          delete newInventory[itemId];
        } else {
          newInventory[itemId] = {
            ...newInventory[itemId],
            count: newCount
          };
        }
      }
    });
    
    // Remove all instances of items
    greeting.removesAll.forEach(itemId => {
      if (itemId.endsWith('_')) {
        const prefix = itemId;
        Object.keys(newInventory).forEach(key => {
          if (key.startsWith(prefix)) {
            delete newInventory[key];
          }
        });
      } else {
        delete newInventory[itemId];
      }
    });
    
    // Add world memory entries
    greeting.memoryAdds.forEach(memoryId => {
      newMemory[memoryId] = (newMemory[memoryId] || 0) + 1;
    });
    
    // Remove world memory entries (one instance)
    greeting.memoryRemoves.forEach(memoryId => {
      if (newMemory[memoryId] && newMemory[memoryId] > 0) {
        const newCount = newMemory[memoryId] - 1;
        if (newCount === 0) {
          delete newMemory[memoryId];
        } else {
          newMemory[memoryId] = newCount;
        }
      }
    });
    
    // Remove all instances of memory
    greeting.memoryRemovesAll.forEach(memoryId => {
      if (memoryId === '') {
        newMemory = {};
      } else if (memoryId.endsWith('_')) {
        const prefix = memoryId;
        Object.keys(newMemory).forEach(key => {
          if (key.startsWith(prefix)) {
            delete newMemory[key];
          }
        });
      } else {
        delete newMemory[memoryId];
      }
    });
    
    // Execute system call if present
    let systemResult = { teleportTo: null as string | null, switchToCharacter: null as string | null, telegraphUpload: false, telegraphDownload: false };
    if (greeting.systemCall) {
      const inventoryCopy = JSON.parse(JSON.stringify(newInventory));
      const memoryCopy = JSON.parse(JSON.stringify(newMemory));
      systemResult = await executeSystem(greeting.systemCall, inventoryCopy, memoryCopy);
      newInventory = inventoryCopy;
      newMemory = memoryCopy;
    }
    
    return { inventory: newInventory, memory: newMemory, systemResult };
  };

  // Execute a system and all its recursive calls
  // Mutates currentInventory and currentMemory directly (immediate effect!)
  const executeSystem = async (
    systemId: string,
    currentInventory: {[itemId: string]: InventoryItem},
    currentMemory: {[memoryId: string]: number}
  ): Promise<{
    teleportTo: string | null;
    switchToCharacter: string | null;
    telegraphUpload: boolean;
    telegraphDownload: boolean;
  }> => {
    const result = {
      teleportTo: null as string | null,
      switchToCharacter: null as string | null,
      telegraphUpload: false,
      telegraphDownload: false,
    };

    const system = gameData.systems[systemId];
    if (!system || !system.lines || system.lines.length === 0) {
      console.log(`❌ SYSTEM #${systemId}: Not found or empty`);
      return result;
    }

    // Filter lines that meet requirements
    const inventoryCounts: {[id: string]: number} = {};
    Object.entries(currentInventory).forEach(([id, item]) => {
      inventoryCounts[id] = item.count;
    });

    const validLines = system.lines.filter(line => {
      // Check inventory requirements
      for (const req of (line.requirements || [])) {
        const count = getInventoryCount(req, currentInventory);
        if (count === 0) {
          return false;
        }
      }

      // Check NOT inventory requirements
      for (const notReq of (line.notRequirements || [])) {
        const count = getInventoryCount(notReq, currentInventory);
        if (count > 0) {
          return false;
        }
      }

      // Check memory requirements
      for (const memReq of (line.memoryRequirements || [])) {
        const count = getMemoryCount(memReq, currentMemory);
        if (count === 0) {
          return false;
        }
      }

      // Check NOT memory requirements
      for (const notMemReq of (line.memoryNotRequirements || [])) {
        const count = getMemoryCount(notMemReq, currentMemory);
        if (count > 0) {
          return false;
        }
      }

      // Check comparison requirements for items
      for (const comparison of (line.comparisons || [])) {
        const itemCount = getInventoryCount(comparison.itemId, currentInventory);
        if (comparison.operator === '<') {
          if (!(itemCount < comparison.value)) {
            return false;
          }
        } else if (comparison.operator === '>') {
          if (!(itemCount > comparison.value)) {
            return false;
          }
        }
      }

      // Check comparison requirements for memory
      for (const comparison of (line.memoryComparisons || [])) {
        const memCount = getMemoryCount(comparison.itemId, currentMemory);
        if (comparison.operator === '<') {
          if (!(memCount < comparison.value)) {
            return false;
          }
        } else if (comparison.operator === '>') {
          if (!(memCount > comparison.value)) {
            return false;
          }
        }
      }

      return true;
    });

    if (validLines.length === 0) {
      console.log(`❌ SYSTEM #${systemId}: No valid lines found (requirements not met)`);
      console.log(`   Current inventory:`, Object.keys(currentInventory));
      console.log(`   Current memory:`, Object.keys(currentMemory));
      console.log(`   Total lines in system:`, system.lines.length);
      return result;
    }

    // Pick a random valid line
    const selectedLine = validLines[Math.floor(Math.random() * validLines.length)];

    // Parse and execute commands from left to right, character by character
    const cmdStr = selectedLine.originalCommands;
    let i = 0;
    
    while (i < cmdStr.length) {
      const char = cmdStr[i];
      
      if (char === '@' && i + 1 < cmdStr.length && cmdStr[i + 1] === '%') {
        i += 2;
        let memId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          memId += cmdStr[i];
          i++;
        }
        if (memId === '') {
          const count = Object.keys(currentMemory).length;
          Object.keys(currentMemory).forEach(key => delete currentMemory[key]);
          currentMemory['empty'] = 1;
          console.log(`✅ @% Cleared ALL memory (${count} entries)`);

        } else {
          if (memId.endsWith('_')) {
            const prefix = memId;
            Object.keys(currentMemory).forEach(key => {
              if (key.startsWith(prefix)) delete currentMemory[key];
            });
          } else {
            delete currentMemory[memId];
          }
        }
        continue;
      }
      
      if (char === '@' && i + 1 < cmdStr.length && cmdStr[i + 1] === '?') {
        i += 2;
        if (telegraphMode === 'online' && telegraphPath) {
          const downloadedMemory = await loadWorldMemoryFromTelegraph(telegraphPath);
          if (downloadedMemory !== null) {
            Object.keys(currentMemory).forEach(key => delete currentMemory[key]);
            Object.assign(currentMemory, downloadedMemory);
          }
        }
        result.telegraphDownload = true;
        continue;
      }
      
      if (char === '@' && i + 1 < cmdStr.length && cmdStr[i + 1] === '!') {
        i += 2;
        await saveWorldMemoryToTelegraph(currentMemory);
        result.telegraphUpload = true;
        continue;
      }
      
      if (char === '@' && i + 1 < cmdStr.length && cmdStr[i + 1] === '+') {
        i += 2;
        let memId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          memId += cmdStr[i];
          i++;
        }
        if (memId) {
          const oldCount = currentMemory[memId] || 0;
          currentMemory[memId] = oldCount + 1;
        }
        continue;
      }
      
      if (char === '@' && i + 1 < cmdStr.length && cmdStr[i + 1] === '-') {
        i += 2;
        let memId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          memId += cmdStr[i];
          i++;
        }
        if (memId && currentMemory[memId]) {
          currentMemory[memId]--;
          if (currentMemory[memId] <= 0) {
            delete currentMemory[memId];
          }
        }
        continue;
      }
      
      // Handle @id_>@id2_ (wildcard copy suffix)
      if (char === '@' && i + 1 < cmdStr.length && /\w/.test(cmdStr[i + 1])) {
        // Look ahead for pattern: @id_>@id2_
        let lookahead = i + 1;
        let sourcePrefix = '';
        while (lookahead < cmdStr.length && /\w/.test(cmdStr[lookahead])) {
          sourcePrefix += cmdStr[lookahead];
          lookahead++;
        }
        if (lookahead < cmdStr.length && cmdStr[lookahead] === '_' && lookahead + 2 < cmdStr.length && cmdStr[lookahead + 1] === '>' && cmdStr[lookahead + 2] === '@') {
          // This is @id_>@ pattern
          lookahead++; // skip '_'
          lookahead++; // skip '>'
          lookahead++; // skip '@'
          let targetPrefix = '';
          while (lookahead < cmdStr.length && /\w/.test(cmdStr[lookahead])) {
            targetPrefix += cmdStr[lookahead];
            lookahead++;
          }
          // Execute the wildcard copy
          const matchingKeys = Object.keys(currentMemory).filter(key => key.startsWith(sourcePrefix + '_'));
          if (matchingKeys.length > 0) {
            const randomKey = matchingKeys[Math.floor(Math.random() * matchingKeys.length)];
            const suffix = randomKey.substring((sourcePrefix + '_').length);
            const newKey = targetPrefix + suffix;
            currentMemory[newKey] = (currentMemory[newKey] || 0) + 1;
          }
          i = lookahead;
          continue;
        }
      }
      
      if (char === '&' && i + 1 < cmdStr.length && cmdStr[i + 1] === '%') {
        i += 2;
        Object.keys(currentInventory).forEach(key => delete currentInventory[key]);
        continue;
      }
      
      if (char === '&' && i + 1 < cmdStr.length && /\w/.test(cmdStr[i + 1])) {
        i += 1;
        let locId = '';
        while (i < cmdStr.length && /\w/.test(cmdStr[i])) {
          locId += cmdStr[i];
          i++;
        }
        if (locId) {
          result.teleportTo = locId.toLowerCase();
        }
        continue;
      }
      
      if (char === '§') {
        i += 1;
        let charId = '';
        while (i < cmdStr.length && /\w/.test(cmdStr[i])) {
          charId += cmdStr[i];
          i++;
        }
        if (charId) {
          result.switchToCharacter = charId.toLowerCase();
        }
        continue;
      }
      
      if (char === '#') {
        i += 1;
        let sysId = '';
        while (i < cmdStr.length && /\w/.test(cmdStr[i])) {
          sysId += cmdStr[i];
          i++;
        }
        if (sysId) {
          const recursiveResult = await executeSystem(sysId.toLowerCase(), currentInventory, currentMemory);
          if (recursiveResult.teleportTo) {
            result.teleportTo = recursiveResult.teleportTo;
          }
          if (recursiveResult.switchToCharacter) {
            result.switchToCharacter = recursiveResult.switchToCharacter;
          }
          if (recursiveResult.telegraphUpload) {
            result.telegraphUpload = true;
          }
          if (recursiveResult.telegraphDownload) {
            result.telegraphDownload = true;
          }
        }
        continue;
      }
      
      if (char === '%') {
        i += 1;
        let itemId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          itemId += cmdStr[i];
          i++;
        }
        if (itemId) {
          const itemIdLower = itemId.toLowerCase();
          if (itemIdLower.endsWith('_')) {
            const prefix = itemIdLower;
            Object.keys(currentInventory).forEach(key => {
              if (key.startsWith(prefix)) delete currentInventory[key];
            });
          } else {
            delete currentInventory[itemIdLower];
          }
        }
        continue;
      }
      
      if (char === '+') {
        i += 1;
        let itemId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          itemId += cmdStr[i];
          i++;
        }
        if (itemId) {
          const itemIdLower = itemId.toLowerCase();
          if (!currentInventory[itemIdLower]) {
            currentInventory[itemIdLower] = { count: 0, lastAdded: Date.now() };
          }
          currentInventory[itemIdLower].count++;
          currentInventory[itemIdLower].lastAdded = Date.now();
        }
        continue;
      }
      
      if (char === '-') {
        i += 1;
        let itemId = '';
        while (i < cmdStr.length && /[\w_]/.test(cmdStr[i])) {
          itemId += cmdStr[i];
          i++;
        }
        if (itemId) {
          const itemIdLower = itemId.toLowerCase();
          if (currentInventory[itemIdLower]) {
            currentInventory[itemIdLower].count--;
            if (currentInventory[itemIdLower].count <= 0) {
              delete currentInventory[itemIdLower];
            }
          }
        }
        continue;
      }
      
      i++;
    }



    return result;
  };

  // Detect mobile device
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth <= 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Check if fullscreen API is available (not available on iOS Safari)
  useEffect(() => {
    setIsFullscreenAvailable(
      document.documentElement.requestFullscreen !== undefined ||
      (document.documentElement as any).webkitRequestFullscreen !== undefined
    );
  }, []);

  // Helper function to remove comments /* */ and // from text
  const removeComments = (text: string): string => {
    // First remove multi-line comments /* */
    let result = text.replace(/\/\*[\s\S]*?\*\//g, '');
    // Then remove single-line comments //
    result = result.replace(/\/\/.*$/gm, '');
    return result;
  };

  // Helper function to process uploaded files (ZIP or directory)
  const processUploadedFiles = async (files: FileList | File) => {
    const newAssets: {[filename: string]: string} = {};
    const textFiles: {filename: string, content: string}[] = [];
    
    // Convert to array
    const fileArray = files instanceof FileList ? Array.from(files) : [files];
    
    // Check if it's a single ZIP file
    const isSingleZip = fileArray.length === 1 && fileArray[0].name.endsWith('.zip');
    
    if (isSingleZip) {
      // Process ZIP file
      const zip = new JSZip();
      const zipContent = await zip.loadAsync(fileArray[0]);
      
      // Process all files in ZIP
      for (const [path, zipEntry] of Object.entries(zipContent.files)) {
        // Skip __MACOSX folder
        if (path.includes('__MACOSX/')) continue;
        
        // Skip directories
        if (zipEntry.dir) continue;
        
        const filename = path.split('/').pop() || '';
        if (!filename) continue;
        
        // Process text files
        if (filename.endsWith('.txt')) {
          const content = await zipEntry.async('text');
          textFiles.push({ filename, content });
        }
        // Process image files
        else if (filename.match(/\.(png|jpg|jpeg)$/i)) {
          const blob = await zipEntry.async('blob');
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
          newAssets[filename] = dataUrl;
        }
      }
    } else {
      // Process directory (multiple files from webkitdirectory)
      for (const file of fileArray) {
        // Skip __MACOSX files
        if (file.webkitRelativePath && file.webkitRelativePath.includes('__MACOSX/')) continue;
        
        const filename = file.name;
        
        // Process text files
        if (filename.endsWith('.txt')) {
          const content = await file.text();
          textFiles.push({ filename, content });
        }
        // Process image files
        else if (filename.match(/\.(png|jpg|jpeg)$/i)) {
          const dataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(file);
          });
          newAssets[filename] = dataUrl;
        }
      }
    }
    
    // Sort text files: debug.txt first, then alphabetically
    textFiles.sort((a, b) => {
      if (a.filename.toLowerCase() === 'debug.txt') return -1;
      if (b.filename.toLowerCase() === 'debug.txt') return 1;
      return a.filename.localeCompare(b.filename);
    });
    
    // Combine all text files into SCRIPT.txt
    let combinedScript = '';
    for (const txtFile of textFiles) {
      const contentWithoutComments = removeComments(txtFile.content);
      combinedScript += contentWithoutComments + '\n\n';
    }
    
    // Update asset backend
    setAssetBackend(newAssets);
    
    // Update script and reinitialize game
    setScript(combinedScript.trim());
    setIsInitialized(false);
    
    // Parse the new script and initialize from debug
    const parsedData = parseScript(combinedScript.trim(), newAssets);
    await initializeFromDebug(parsedData);
    setIsInitialized(true);
  };

  // Helper function to initialize game from DEBUG block and trigger greeting
  const initializeFromDebug = async (parsedData: any) => {
    if (parsedData.debug) {
      console.log('Initializing from debug:', parsedData.debug);
      
      // 1. Clear inventory
      setInventory({});
      
      // 1.5. Initialize Telegraph if configured and load existing world memory
      // Only try to connect if BOTH "welt:" AND "token:" values are provided and we're not in disconnected local mode
      let telegraphMemory: {[memoryId: string]: number} = {};
      if (!isDisconnectedLocalMode && 'telegraphPath' in parsedData.debug && 'telegraphToken' in parsedData.debug) {
        const path = parsedData.debug.telegraphPath?.trim() || '';
        const token = parsedData.debug.telegraphToken?.trim() || '';
        
        console.log('🔍 [DEBUG PARSE] Telegraph path from debug:', path);
        console.log('🔍 [DEBUG PARSE] Telegraph token from debug:', token ? '***' + token.slice(-4) : 'empty');
        
        if (path && token) {
          // Both path and token provided, try to connect with loading screen
          setIsLoading(true);
          telegraphMemory = await initializeTelegraph(path, token);
          setIsLoading(false);
        } else {
          // Missing path or token, stay in local mode
          setTelegraphMode('local');
          setWorldMemory({});
          console.log('Missing welt: or token: value - starting in local mode');
        }
      } else {
        // No "welt:" or "token:" line or in disconnected local mode, start in local mode
        setTelegraphMode('local');
        setWorldMemory({});
        if (isDisconnectedLocalMode) {
          console.log('In disconnected local mode - not attempting Telegraph connection');
        }
      }
      
      // 2. Set inventory from debug and execute start commands
      // Start with the world memory loaded from Telegraph (if any)
      console.log('🟣 [INIT] Telegraph memory to be merged into local worldMemory:', telegraphMemory);
      let newInventory: {[itemId: string]: InventoryItem} = {};
      let newMemory: {[memoryId: string]: number} = { ...telegraphMemory };
      console.log('🟣 [INIT] Initial newMemory (after copying Telegraph data):', newMemory);
      let startLocation = parsedData.debug.location || '';
      let startCharacter = parsedData.debug.character || '';
      
      if (parsedData.debug.inventory && parsedData.debug.inventory.length > 0) {
        parsedData.debug.inventory.forEach((itemId: string, index: number) => {
          if (newInventory[itemId]) {
            newInventory[itemId].count++;
          } else {
            newInventory[itemId] = { count: 1, lastAdded: Date.now() + index };
          }
        });
      }
      
      // 2.5. Execute start commands if present
      if (parsedData.debug.startCommands) {
        console.log('Executing start commands:', parsedData.debug.startCommands);
        const startResult = await executeStartCommands(parsedData.debug.startCommands, newInventory, newMemory);
        
        // Note: Telegraph sync already handled inside executeStartCommands
        
        // Override location/character if start commands specify them
        if (startResult.teleportTo) {
          startLocation = startResult.teleportTo;
        }
        if (startResult.switchToCharacter) {
          startCharacter = startResult.switchToCharacter;
        }
      }
      
      // Store the final start values in debug for reset functionality
      parsedData.debug.startLocation = startLocation;
      parsedData.debug.startCharacter = startCharacter || null;
      parsedData.debug.startInventory = { ...newInventory };
      
      // Apply final inventory and memory
      console.log('🟣 [INIT] Setting final worldMemory in state:', newMemory);
      setInventory(newInventory);
      setWorldMemory(newMemory);
      
      // 3. Set location from debug (or from start commands)
      if (startLocation) {
        console.log('Setting location to:', startLocation);
        setCurrentLocation(startLocation);
      }
      
      // 4. Set character from debug (or from start commands)
      if (startCharacter) {
        console.log('Setting character to:', startCharacter);
        setCurrentCharacter(startCharacter);
        
        // 5. Play greeting from debug character (without executing commands yet)
        const character = parsedData.characters[startCharacter];
        if (character && character.greetings.length > 0) {
          // Filter greetings based on requirements
          const inventoryCounts: {[itemId: string]: number} = {};
          Object.keys(newInventory).forEach(itemId => {
            inventoryCounts[itemId] = newInventory[itemId].count;
          });
          
          const validGreetings = character.greetings.filter(greeting => {
            // Check inventory requirements
            for (const req of (greeting.requirements || [])) {
              const count = getInventoryCount(req, newInventory);
              if (count === 0) {
                return false;
              }
            }
            
            // Check NOT inventory requirements
            for (const notReq of (greeting.notRequirements || [])) {
              const count = getInventoryCount(notReq, newInventory);
              if (count > 0) {
                return false;
              }
            }
            
            // Check memory requirements
            for (const memReq of (greeting.memoryRequirements || [])) {
              const count = getMemoryCount(memReq, newMemory);
              if (count === 0) {
                return false;
              }
            }
            
            // Check NOT memory requirements
            for (const notMemReq of (greeting.memoryNotRequirements || [])) {
              const count = getMemoryCount(notMemReq, newMemory);
              if (count > 0) {
                return false;
              }
            }
            
            // Check comparison requirements for items
            for (const comparison of (greeting.comparisons || [])) {
              const itemCount = getInventoryCount(comparison.itemId, newInventory);
              if (comparison.operator === '<') {
                if (!(itemCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(itemCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            // Check comparison requirements for memory
            for (const comparison of (greeting.memoryComparisons || [])) {
              const memCount = getMemoryCount(comparison.itemId, newMemory);
              if (comparison.operator === '<') {
                if (!(memCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(memCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            return true;
          });
          
          const greetingsToUse = validGreetings.length > 0 ? validGreetings : character.greetings;
          const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
          setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, newMemory));
          setCurrentGreeting(randomGreeting);
          setIsGreeting(true);
          setMiddlePanel('character');
          
          // Set canAdvance to true so the greeting can be clicked
          setCanAdvance(true);
        } else {
          // If no greetings available, still set up the UI properly
          setCharacterResponse(null);
          setCurrentGreeting(null);
          setIsGreeting(true);
          setMiddlePanel('character');
          setCanAdvance(false);
        }
      }
    }
  };

  // Telegraph helper functions for world memory persistence
  const saveWorldMemoryToTelegraph = async (memory: {[memoryId: string]: number}) => {
    // Don't save if in local mode, disconnected local mode, or missing credentials
    if (telegraphMode === 'local' || isDisconnectedLocalMode || !telegraphPath || !telegraphToken) {
      return;
    }
    
    setIsTelegraphSyncing(true);
    
    try {
      // Convert world memory to line-separated text
      const entries: string[] = [];
      for (const [memoryId, count] of Object.entries(memory)) {
        for (let i = 0; i < count; i++) {
          entries.push(memoryId);
        }
      }
      // Use special marker for empty memory
      const text = entries.length === 0 ? 'EMPTY_MEMORY' : entries.join('\n');
      
      await Telegraph.editPage(telegraphPath, telegraphToken, 'World Memory', text);
      console.log(`✅ @! Memory uploaded to Telegraph (${Object.keys(memory).length} unique entries)`);
    } catch (error) {
      console.error('❌ @! Failed to upload memory to Telegraph:', error);
      setTelegraphMode('local');
    } finally {
      setIsTelegraphSyncing(false);
    }
  };

  const loadWorldMemoryFromTelegraph = async (path: string): Promise<{[memoryId: string]: number} | null> => {
    try {
      console.log('🔵 [TELEGRAPH LOAD] Reading Telegraph file:', path);
      const { content } = await Telegraph.getPage(path);
      console.log('🔵 [TELEGRAPH LOAD] Raw content from Telegraph:', content);
      
      // Check for empty memory marker
      if (content.trim() === 'EMPTY_MEMORY') {
        console.log('🔵 [TELEGRAPH LOAD] Found EMPTY_MEMORY marker - returning empty memory');
        return {};
      }
      
      // Convert line-separated text to world memory
      const memory: {[memoryId: string]: number} = {};
      // Filter out empty strings and the placeholder "—"
      // IMPORTANT: Keep original case for memory IDs (case-sensitive)
      const lines = content.split('\n').map(s => s.trim()).filter(s => s && s !== '—');
      console.log('🔵 [TELEGRAPH LOAD] Parsed lines (after filtering):', lines);
      
      for (const memoryId of lines) {
        memory[memoryId] = (memory[memoryId] || 0) + 1;
      }
      
      console.log('🔵 [TELEGRAPH LOAD] Final worldMemory object:', memory);
      return memory;
    } catch (error) {
      console.error('🔴 [TELEGRAPH LOAD] Failed to load world memory from Telegraph:', error);
      return null;
    } finally {
      setIsTelegraphSyncing(false);
    }
  };

  const initializeTelegraph = async (path: string, token: string): Promise<{[memoryId: string]: number}> => {
    if (!path) {
      setTelegraphMode('local');
      return {};
    }
    
    setTelegraphPath(path);
    setTelegraphToken(token);
    
    try {
      // Try to load existing page with 5 second timeout
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000);
      });
      
      const memory = await Promise.race([
        loadWorldMemoryFromTelegraph(path),
        timeoutPromise
      ]);
      
      if (memory !== null) {
        // Page exists, return the world memory without setting it yet
        // (it will be set by initializeFromDebug to avoid triggering auto-save too early)
        setTelegraphMode('online');
        console.log('🟢 [TELEGRAPH INIT] Successfully connected. Returning worldMemory to be merged:', memory);
        return memory;
      } else {
        // Page doesn't exist, timeout, or failed to load - use local mode
        console.log('Telegraph page not found or timeout, using local mode');
        setTelegraphMode('local');
        return {};
      }
    } catch (error) {
      console.error('Telegraph initialization failed:', error);
      setTelegraphMode('local');
      return {};
    }
  };

  // Load script from URL if key parameter is provided
  useEffect(() => {
    const loadScriptFromURL = async () => {
      // Get URL search parameters (e.g., "?key=4yispl.txt")
      const urlParams = new URLSearchParams(window.location.search);
      let key = urlParams.get('key');
      
      // Special case: if key is "1", use the default Muriels Wald ZIP
      if (key === '1') {
        key = 'https://www.musicamemo.com/uploads/1/0/5/3/105387887/muriels_wald.zip';
      }
      
      // Special case: if key is "garten", use the Garten ZIP
      if (key === 'garten') {
        key = 'https://www.musicamemo.com/uploads/1/0/5/3/105387887/garten.zip';
      }
      
      // If there's a key parameter in the URL
      if (key) {
        // Reset initialization state before loading new script
        setIsInitialized(false);
        // Show loading screen
        setIsLoading(true);
        setLoadingProgress(1); // Start with 1 star
        
        // Check if key is a full URL or just a slug
        const isFullURL = key.startsWith('http://') || key.startsWith('https://');
        const targetURL = isFullURL ? key : `https://files.catbox.moe/${key}`;
        
        // Check if the key is a ZIP file
        const isZipFile = key.toLowerCase().endsWith('.zip');
        
        if (isZipFile) {
          // Handle ZIP file loading
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetURL)}`,
            `https://corsproxy.io/?${encodeURIComponent(targetURL)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetURL)}`,
          ];
          
          const totalAttempts = 1 + proxies.length;
          let currentAttempt = 0;
          
          // Try direct fetch first
          currentAttempt++;
          setLoadingProgress(Math.floor((currentAttempt / totalAttempts) * 10) || 1);
          
          try {
            const response = await fetch(targetURL, {
              method: 'GET',
              mode: 'cors',
            });
            if (response.ok) {
              setLoadingProgress(10); // Full progress
              const blob = await response.blob();
              
              // Create a File object from the blob
              const file = new File([blob], key, { type: 'application/zip' });
              
              // Process the ZIP file using the existing function
              await processUploadedFiles(file);
              
              setIsLoading(false);
              return;
            }
          } catch (error) {
            console.log('Direct fetch failed, trying proxies...');
          }
          
          // Try each proxy
          for (let i = 0; i < proxies.length; i++) {
            currentAttempt++;
            setLoadingProgress(Math.floor((currentAttempt / totalAttempts) * 10) || 1);
            
            try {
              const response = await fetch(proxies[i]);
              if (response.ok) {
                setLoadingProgress(10); // Full progress
                const blob = await response.blob();
                
                // Create a File object from the blob
                const file = new File([blob], key, { type: 'application/zip' });
                
                // Process the ZIP file using the existing function
                await processUploadedFiles(file);
                
                console.log('ZIP loaded successfully via proxy');
                setIsLoading(false);
                return;
              }
            } catch (error) {
              console.log('Proxy attempt failed, trying next...');
            }
          }
          
          console.error('All attempts to load ZIP failed');
          setIsLoading(false);
        } else {
          // Handle text file loading (existing logic)
          // List of CORS proxies to try
          const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent(targetURL)}`,
            `https://corsproxy.io/?${encodeURIComponent(targetURL)}`,
            `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(targetURL)}`,
          ];
          
          const totalAttempts = 1 + proxies.length; // Direct + proxies
          let currentAttempt = 0;
          
          // Try direct fetch first
          currentAttempt++;
          setLoadingProgress(Math.floor((currentAttempt / totalAttempts) * 10) || 1);
          
          try {
            const response = await fetch(targetURL, {
              method: 'GET',
              mode: 'cors',
            });
            if (response.ok) {
              setLoadingProgress(10); // Full progress
              const loadedScript = await response.text();
              setScript(loadedScript);
              
              // Initialize game from DEBUG block
              const parsedData = parseScript(loadedScript, assetBackend);
              await initializeFromDebug(parsedData);
              setIsInitialized(true);
              
              setIsLoading(false);
              return;
            }
          } catch (error) {
            console.log('Direct fetch failed, trying proxies...');
          }
          
          // Try each proxy
          for (let i = 0; i < proxies.length; i++) {
            currentAttempt++;
            setLoadingProgress(Math.floor((currentAttempt / totalAttempts) * 10) || 1);
            
            try {
              const response = await fetch(proxies[i]);
              if (response.ok) {
                setLoadingProgress(10); // Full progress
                const loadedScript = await response.text();
                setScript(loadedScript);
                console.log('Script loaded successfully via proxy');
                
                // Initialize game from DEBUG block
                const parsedData = parseScript(loadedScript, assetBackend);
                await initializeFromDebug(parsedData);
                setIsInitialized(true);
                
                setIsLoading(false);
                return;
              }
            } catch (error) {
              console.log('Proxy attempt failed, trying next...');
            }
          }
          
          console.error('All attempts to load script failed');
          // Even if loading fails, hide loading screen and use default script
          setIsLoading(false);
        }
      }
    };

    loadScriptFromURL();
  }, []);

  // Hide mobile browser UI on mount
  useEffect(() => {
    // Set viewport meta tag for better mobile support
    const metaViewport = document.querySelector('meta[name="viewport"]');
    if (metaViewport) {
      metaViewport.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover');
    }

    const hideBrowserUI = () => {
      // Scroll to top to trigger browser UI hide
      window.scrollTo(0, 1);
      setTimeout(() => window.scrollTo(0, 0), 0);
    };

    // Execute on mount with slight delay to ensure page is loaded
    setTimeout(hideBrowserUI, 100);

    // Also execute on orientation change and resize
    window.addEventListener('orientationchange', hideBrowserUI);
    window.addEventListener('resize', hideBrowserUI);
    
    return () => {
      window.removeEventListener('orientationchange', hideBrowserUI);
      window.removeEventListener('resize', hideBrowserUI);
    };
  }, []);

  // World memory is now only synced via @! (upload) and @? (download) commands

  // Initialize from debug values on first mount
  useEffect(() => {
    if (!isInitialized && gameData.debug) {
      (async () => {
        await initializeFromDebug(gameData);
        setIsInitialized(true);
      })();
    }
  }, [gameData.debug, isInitialized]);

  // Debug state reset with Shift+Backspace key and Telegraph reconnect with Control+Backspace
  useEffect(() => {
    const handleKeyPress = async (e: KeyboardEvent) => {
      // Check if debug mode is enabled
      const isDebugMode = gameData.debug?.debugMode || false;
      
      // Reset with Shift+Backspace - only in debug mode
      if (e.key === 'Backspace' && e.shiftKey && !e.ctrlKey && gameData.debug) {
        if (!isDebugMode) return;
        e.preventDefault();
        // Reset to debug state and play greeting
        await initializeFromDebug(gameData);
        // Note: Telegraph world memory is NOT cleared on manual disconnect
      }
      
      // Reconnect to Telegraph with Control+Backspace - only in debug mode
      if (e.key === 'Backspace' && e.ctrlKey && !e.shiftKey && gameData.debug) {
        if (!isDebugMode) return;
        e.preventDefault();
        
        if (gameData.debug.telegraphPath) {
          console.log('Attempting to reconnect to Telegraph...');
          try {
            // Try to load world memory from Telegraph
            const memory = await loadWorldMemoryFromTelegraph(gameData.debug.telegraphPath);
            
            if (memory !== null) {
              // Success! Switch to online mode and adopt Telegraph's world memory
              setWorldMemory(memory);
              setTelegraphPath(gameData.debug.telegraphPath);
              setTelegraphToken(gameData.debug.telegraphToken || '');
              setTelegraphMode('online');
              setIsDisconnectedLocalMode(false);
              console.log('Telegraph reconnected successfully - local memory adopted from Telegraph');
            } else {
              console.error('Failed to reconnect to Telegraph');
              setTelegraphMode('local');
            }
          } catch (error) {
            console.error('Telegraph reconnection failed:', error);
            setTelegraphMode('local');
          }
        } else {
          console.log('No Telegraph path configured in debug block');
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [gameData, telegraphMode, telegraphPath, telegraphToken]);

  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      // Check if debug mode is enabled for restricted shortcuts
      const isDebugMode = gameData.debug?.debugMode || false;
      
      if (e.key === 'Escape' && e.shiftKey) {
        // Shift+Escape: Only works in debug mode
        if (!isDebugMode) return;
        setIsEditorMode(prev => !prev);
      } else if (e.key === 'Enter' && e.shiftKey) {
        // Open file dialog
        fileInputRef.current?.click();
      } else if (e.key === '+' && e.ctrlKey) {
        // Ctrl+Plus: Open dialog to create new Telegraph document
        e.preventDefault();
        setShowTelegraphDialog(true);
        setTelegraphDialogName('');
        setTelegraphDialogMessage('');
        setTelegraphDialogCreated(false);
        setTelegraphDialogCopyText('');
      } else if (e.key === 'Backspace' && e.shiftKey) {
        // Shift+Backspace: Only works in debug mode
        if (!isDebugMode) return;
        e.preventDefault();
        setTelegraphMode('local');
        setIsDisconnectedLocalMode(true);
        console.log('Switched to disconnected local mode (offline)');
      } else if (e.key === 'Backspace' && e.ctrlKey) {
        // Ctrl+Backspace: Only works in debug mode
        if (!isDebugMode) return;
        e.preventDefault();
        if (gameData.debug.telegraphPath) {
          console.log('Reconnecting to Telegraph and resetting...');
          try {
            const memory = await loadWorldMemoryFromTelegraph(gameData.debug.telegraphPath);
            
            if (memory !== null) {
              // Successfully loaded Telegraph memory
              // Now reconnect to Telegraph mode
              setTelegraphPath(gameData.debug.telegraphPath);
              setTelegraphToken(gameData.debug.telegraphToken || '');
              setTelegraphMode('online');
              setIsDisconnectedLocalMode(false);
              
              // Reset to debug state and play greeting (same as Shift+Backspace)
              await initializeFromDebug(gameData);
              
              console.log('Telegraph reconnected and game reset - memory loaded from Telegraph');
            } else {
              console.error('Failed to reconnect to Telegraph');
            }
          } catch (error) {
            console.error('Telegraph reconnection failed:', error);
          }
        } else {
          console.log('No Telegraph path configured in debug block');
        }
      } else if (e.key === '0' && e.ctrlKey) {
        // Ctrl+0: Only works in debug mode
        if (!isDebugMode) return;
        e.preventDefault();
        if (telegraphMode === 'online' && telegraphPath && telegraphToken) {
          console.log('Clearing Telegraph document...');
          try {
            await saveWorldMemoryToTelegraph(telegraphPath, telegraphToken, {});
            setWorldMemory({});
            console.log('Telegraph document cleared');
          } catch (error) {
            console.error('Failed to clear Telegraph document:', error);
          }
        } else {
          console.log('Not in online mode or missing Telegraph credentials');
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameData, telegraphMode, telegraphPath, telegraphToken]);

  useEffect(() => {
    if (isInitialized && middlePanel === 'character' && currentLocation && !currentCharacter) {
      console.log('Auto-selecting character. isInitialized:', isInitialized, 'currentCharacter:', currentCharacter);
      const location = gameData.locations[currentLocation];
      if (location && location.inhabitants.length > 0) {
        // Check inhabitants (use local world memory - sync via @! and @? commands)
        const checkInhabitants = async () => {
          const currentWorldMemory = worldMemory; // Use current local state
          
          // Filter inhabitants based on requirements
          const validInhabitants = location.inhabitants.filter(inhabitant => {
          // Check if character exists
          if (!gameData.characters[inhabitant.id]) {
            return false;
          }
          
          // Count how many of each item we have in inventory
          const inventoryCounts: { [itemId: string]: number } = {};
          Object.entries(inventory || {}).forEach(([itemId, item]) => {
            inventoryCounts[itemId] = item.count;
          });
          
          // Check NOT-requirements first (items that must NOT be in inventory)
          for (const itemId of inhabitant.notRequirements) {
            if (inventoryCounts[itemId] && inventoryCounts[itemId] > 0) {
              return false; // This item must not be in inventory
            }
          }
          
          // Check memory NOT-requirements (memories that must NOT exist)
          for (const memoryId of inhabitant.memoryNotRequirements) {
            if (currentWorldMemory[memoryId] && currentWorldMemory[memoryId] > 0) {
              return false; // This memory must not exist
            }
          }
          
          // Check memory requirements (memories that must exist)
          for (const memoryId of inhabitant.memoryRequirements) {
            if (!currentWorldMemory[memoryId] || currentWorldMemory[memoryId] === 0) {
              return false; // This memory must exist
            }
          }
          
          // Check comparison requirements for items
          for (const comparison of (inhabitant.comparisons || [])) {
            const itemCount = inventoryCounts[comparison.itemId] || 0;
            if (comparison.operator === '<') {
              if (!(itemCount < comparison.value)) {
                return false;
              }
            } else if (comparison.operator === '>') {
              if (!(itemCount > comparison.value)) {
                return false;
              }
            }
          }
          
          // Check comparison requirements for memory
          for (const comparison of (inhabitant.memoryComparisons || [])) {
            const memoryCount = currentWorldMemory[comparison.itemId] || 0;
            if (comparison.operator === '<') {
              if (!(memoryCount < comparison.value)) {
                return false;
              }
            } else if (comparison.operator === '>') {
              if (!(memoryCount > comparison.value)) {
                return false;
              }
            }
          }
          
          // If no positive item requirements, only NOT-requirements and memory requirements matter
          if (inhabitant.requirements.length === 0) {
            return true;
          }
          
          // Count how many of each item is required
          const requiredCounts: { [itemId: string]: number } = {};
          inhabitant.requirements.forEach(itemId => {
            requiredCounts[itemId] = (requiredCounts[itemId] || 0) + 1;
          });
          
          // Check if we have enough of each required item
          for (const itemId in requiredCounts) {
            if ((inventoryCounts[itemId] || 0) < requiredCounts[itemId]) {
              return false;
            }
          }
          
          return true;
        });
        
        if (validInhabitants.length > 0) {
          const randomInhabitant = validInhabitants[Math.floor(Math.random() * validInhabitants.length)];
          
          // Execute character system call if present (BEFORE setting character or showing greeting)
          const character = gameData.characters[randomInhabitant.id];
          if (character && character.systemCall) {
            (async () => {
              const inventoryCopy = JSON.parse(JSON.stringify(inventory));
              const memoryCopy = JSON.parse(JSON.stringify(currentWorldMemory));
              const systemResult = await executeSystem(character.systemCall, inventoryCopy, memoryCopy);
              
              // Apply inventory and memory changes from system
              setInventory(inventoryCopy);
              setWorldMemory(memoryCopy);
              
              // After system execution, set the character and show greeting
              setCurrentCharacter(randomInhabitant.id);
              setCurrentGreeting(null);
              
              // Now show the greeting
              if (character.greetings.length > 0) {
                // Filter greetings based on requirements
                const greetingInventoryCounts: {[itemId: string]: number} = {};
                Object.entries(inventoryCopy || {}).forEach(([itemId, item]) => {
                  greetingInventoryCounts[itemId] = item.count;
                });
                
                const validGreetings = character.greetings.filter(greeting => {
                  // Check inventory requirements
                  for (const req of (greeting.requirements || [])) {
                    const count = getInventoryCount(req, inventoryCopy);
                    if (count === 0) {
                      return false;
                    }
                  }
                  
                  // Check NOT inventory requirements
                  for (const notReq of (greeting.notRequirements || [])) {
                    const count = getInventoryCount(notReq, inventoryCopy);
                    if (count > 0) {
                      return false;
                    }
                  }
                  
                  // Check memory requirements
                  for (const memReq of (greeting.memoryRequirements || [])) {
                    const count = getMemoryCount(memReq, memoryCopy);
                    if (count === 0) {
                      return false;
                    }
                  }
                  
                  // Check NOT memory requirements
                  for (const notMemReq of (greeting.memoryNotRequirements || [])) {
                    const count = getMemoryCount(notMemReq, memoryCopy);
                    if (count > 0) {
                      return false;
                    }
                  }
                  
                  // Check comparison requirements for items
                  for (const comparison of (greeting.comparisons || [])) {
                    const itemCount = getInventoryCount(comparison.itemId, inventoryCopy);
                    if (comparison.operator === '<') {
                      if (!(itemCount < comparison.value)) {
                        return false;
                      }
                    } else if (comparison.operator === '>') {
                      if (!(itemCount > comparison.value)) {
                        return false;
                      }
                    }
                  }
                  
                  // Check comparison requirements for memory
                  for (const comparison of (greeting.memoryComparisons || [])) {
                    const memCount = getMemoryCount(comparison.itemId, memoryCopy);
                    if (comparison.operator === '<') {
                      if (!(memCount < comparison.value)) {
                        return false;
                      }
                    } else if (comparison.operator === '>') {
                      if (!(memCount > comparison.value)) {
                        return false;
                      }
                    }
                  }
                  
                  return true;
                });
                
                // Select a random greeting from valid options, fallback to all if none match
                const greetingsToUse = validGreetings.length > 0 ? validGreetings : character.greetings;
                const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
                setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, memoryCopy));
                setCurrentGreeting(randomGreeting);
                setIsGreeting(true);
                
                // Check if character has no reactions and greeting has no redirects
                const hasReactions = Object.values(character.reactions).some(arr => arr.length > 0);
                const hasRedirect = randomGreeting.teleportTo || randomGreeting.switchToCharacter;
                const hasSystemCall = randomGreeting.systemCall;
                // Allow advance if: no reactions AND (has redirect OR has system call)
                setCanAdvance(!hasReactions && (hasRedirect || hasSystemCall));
                
                // Execute ONLY inventory/memory commands IMMEDIATELY when greeting appears
                const greetingResult = executeGreetingInventoryAndMemory(randomGreeting, inventoryCopy, memoryCopy);
                
                // Apply inventory and memory changes
                setInventory(greetingResult.inventory);
                setWorldMemory(greetingResult.memory);
              }
            })();
            return; // Exit and let async function handle character setup
          }
          
          setCurrentCharacter(randomInhabitant.id);
          setCurrentGreeting(null); // Reset greeting before selecting new one
          if (character && character.greetings.length > 0) {
            // Filter greetings based on requirements
            // Re-create inventoryCounts for greeting filter scope
            const greetingInventoryCounts: {[itemId: string]: number} = {};
            Object.entries(inventory || {}).forEach(([itemId, item]) => {
              greetingInventoryCounts[itemId] = item.count;
            });
            
            const validGreetings = character.greetings.filter(greeting => {
              // Check inventory requirements
              for (const req of (greeting.requirements || [])) {
                const count = getInventoryCount(req, inventory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT inventory requirements
              for (const notReq of (greeting.notRequirements || [])) {
                const count = getInventoryCount(notReq, inventory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check memory requirements
              for (const memReq of (greeting.memoryRequirements || [])) {
                const count = getMemoryCount(memReq, currentWorldMemory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT memory requirements
              for (const notMemReq of (greeting.memoryNotRequirements || [])) {
                const count = getMemoryCount(notMemReq, currentWorldMemory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check comparison requirements for items
              for (const comparison of (greeting.comparisons || [])) {
                const itemCount = getInventoryCount(comparison.itemId, inventory);
                if (comparison.operator === '<') {
                  if (!(itemCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(itemCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              // Check comparison requirements for memory
              for (const comparison of (greeting.memoryComparisons || [])) {
                const memCount = getMemoryCount(comparison.itemId, currentWorldMemory);
                if (comparison.operator === '<') {
                  if (!(memCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(memCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              return true;
            });
            
            // Select a random greeting from valid options, fallback to all if none match
            const greetingsToUse = validGreetings.length > 0 ? validGreetings : character.greetings;
            const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
            setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, currentWorldMemory));
            setCurrentGreeting(randomGreeting);
            setIsGreeting(true);
            
            // NOTE: System call (#) in greeting is NOT executed here
            // It will be executed when user clicks on the greeting
            
            // Check if character has no reactions and greeting has no redirects
            const hasReactions = Object.values(character.reactions).some(arr => arr.length > 0);
            const hasRedirect = randomGreeting.teleportTo || randomGreeting.switchToCharacter;
            const hasSystemCall = randomGreeting.systemCall;
            // Allow advance if: no reactions AND (has redirect OR has system call)
            setCanAdvance(!hasReactions && (hasRedirect || hasSystemCall));
            
            // Execute ONLY inventory/memory commands IMMEDIATELY when greeting appears
            // System calls (#), teleport (&), and character switch (§) are executed later in handleGiveNothing
            const greetingResult = executeGreetingInventoryAndMemory(randomGreeting, inventory, currentWorldMemory);
            
            // Apply inventory and memory changes
            setInventory(greetingResult.inventory);
            setWorldMemory(greetingResult.memory);
          }
        }
        };
        
        checkInhabitants();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, currentLocation, middlePanel, currentCharacter]);

  // Handle greeting when character is directly set (e.g., via § command)
  useEffect(() => {
    if (isInitialized && currentCharacter && middlePanel === 'character' && !isGreeting && !characterResponse) {
      const character = gameData.characters[currentCharacter];
      if (character && character.greetings.length > 0) {
        // Filter greetings based on requirements
        const greetingInventoryCounts: {[itemId: string]: number} = {};
        Object.entries(inventory || {}).forEach(([itemId, item]) => {
          greetingInventoryCounts[itemId] = item.count;
        });
        
        const validGreetings = character.greetings.filter(greeting => {
          // Check inventory requirements
          for (const req of (greeting.requirements || [])) {
            const count = getInventoryCount(req, inventory);
            if (count === 0) {
              return false;
            }
          }
          
          // Check NOT inventory requirements
          for (const notReq of (greeting.notRequirements || [])) {
            const count = getInventoryCount(notReq, inventory);
            if (count > 0) {
              return false;
            }
          }
          
          // Check memory requirements
          for (const memReq of (greeting.memoryRequirements || [])) {
            const count = getMemoryCount(memReq, worldMemory);
            if (count === 0) {
              return false;
            }
          }
          
          // Check NOT memory requirements
          for (const notMemReq of (greeting.memoryNotRequirements || [])) {
            const count = getMemoryCount(notMemReq, worldMemory);
            if (count > 0) {
              return false;
            }
          }
          
          // Check comparison requirements for items
          for (const comparison of (greeting.comparisons || [])) {
            const itemCount = getInventoryCount(comparison.itemId, inventory);
            if (comparison.operator === '<') {
              if (!(itemCount < comparison.value)) {
                return false;
              }
            } else if (comparison.operator === '>') {
              if (!(itemCount > comparison.value)) {
                return false;
              }
            }
          }
          
          // Check comparison requirements for memory
          for (const comparison of (greeting.memoryComparisons || [])) {
            const memCount = getMemoryCount(comparison.itemId, worldMemory);
            if (comparison.operator === '<') {
              if (!(memCount < comparison.value)) {
                return false;
              }
            } else if (comparison.operator === '>') {
              if (!(memCount > comparison.value)) {
                return false;
              }
            }
          }
          
          return true;
        });
        
        // Select a random greeting from valid options, fallback to all if none match
        const greetingsToUse = validGreetings.length > 0 ? validGreetings : character.greetings;
        const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
        setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, worldMemory));
        setCurrentGreeting(randomGreeting);
        setIsGreeting(true);
        
        // Execute ONLY inventory/memory commands IMMEDIATELY when greeting appears
        // System calls (#), teleport (&), and character switch (§) are executed later in handleGiveNothing
        const greetingResult = executeGreetingInventoryAndMemory(randomGreeting, inventory, worldMemory);
        setInventory(greetingResult.inventory);
        setWorldMemory(greetingResult.memory);
        
        // Check if character has no reactions and greeting has no redirects
        const hasReactions = Object.values(character.reactions).some(arr => arr.length > 0);
        const hasRedirect = randomGreeting.teleportTo || randomGreeting.switchToCharacter;
        const hasSystemCall = randomGreeting.systemCall;
        // Allow advance if: no reactions AND (has redirect OR has system call)
        setCanAdvance(!hasReactions && (hasRedirect || hasSystemCall));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized, currentCharacter, middlePanel, isGreeting, characterResponse]);

  const copyToClipboard = async (text: string): Promise<boolean> => {
    // Try modern Clipboard API first
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (error) {
      console.log('Clipboard API failed, trying fallback method:', error);
    }
    
    // Fallback method using textarea
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.style.position = 'fixed';
      textarea.style.left = '-999999px';
      textarea.style.top = '-999999px';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      return successful;
    } catch (error) {
      console.error('Fallback copy failed:', error);
      return false;
    }
  };

  const handleCreateTelegraphDocument = async () => {
    if (!telegraphDialogName.trim()) {
      setTelegraphDialogMessage('Bitte gib einen Namen ein.');
      return;
    }

    setTelegraphDialogMessage('Erstelle Dokument...');

    try {
      // Create a new Telegraph page with the given title
      // Telegraph automatically generates a unique path, so we don't need to check if it exists
      const doc = await Telegraph.createPage(telegraphDialogName, '');
      const newPath = doc.path;
      const newToken = doc.access_token || '';
      
      // Prepare copy text
      const copyText = `welt: ${newPath}\ntoken: ${newToken}`;
      setTelegraphDialogCopyText(copyText);
      setTelegraphDialogCreated(true);
      
      // Show the access token
      setTelegraphDialogMessage(`Dokument erstellt!\n\nCode: ${newPath}\nToken: ${newToken}\n\nFüge diese Zeilen in deinen #DEBUG Block ein:\nwelt: ${newPath}\ntoken: ${newToken}`);
    } catch (error) {
      console.error('Failed to create Telegraph document:', error);
      setTelegraphDialogMessage('Fehler beim Erstellen des Dokuments. Bitte versuche es erneut.');
    }
  };

  const handleItemGiven = (itemId: string) => {
    if (isTelegraphSyncing) return; // Block interaction during Telegraph sync
    if (!currentCharacter) return;

    const character = gameData.characters[currentCharacter];
    if (!character) return;

    // Find matching reaction - either exact match or wildcard pattern match
    let reactions: any[] = [];
    
    // First try exact match
    if (character.reactions[itemId]) {
      reactions = character.reactions[itemId];
    } else {
      // Try wildcard pattern match - check if any reaction key ends with _ and matches as prefix
      for (const reactionKey of Object.keys(character.reactions)) {
        if (reactionKey.endsWith('_') && itemId.startsWith(reactionKey)) {
          reactions = character.reactions[reactionKey];
          break;
        }
      }
    }
    
    if (reactions && reactions.length > 0) {
      // Filter reactions based on requirements
      const reactionInventoryCounts: {[itemId: string]: number} = {};
      Object.entries(inventory || {}).forEach(([id, item]) => {
        reactionInventoryCounts[id] = item.count;
      });
      
      const validReactions = reactions.filter(reaction => {
        // Check inventory requirements
        for (const req of (reaction.requirements || [])) {
          const count = getInventoryCount(req, inventory);
          if (count === 0) {
            return false;
          }
        }
        
        // Check NOT inventory requirements
        for (const notReq of (reaction.notRequirements || [])) {
          const count = getInventoryCount(notReq, inventory);
          if (count > 0) {
            return false;
          }
        }
        
        // Check memory requirements
        for (const memReq of (reaction.memoryRequirements || [])) {
          const count = getMemoryCount(memReq, worldMemory);
          if (count === 0) {
            return false;
          }
        }
        
        // Check NOT memory requirements
        for (const notMemReq of (reaction.memoryNotRequirements || [])) {
          const count = getMemoryCount(notMemReq, worldMemory);
          if (count > 0) {
            return false;
          }
        }
        
        // Check comparison requirements for items
        for (const comparison of (reaction.comparisons || [])) {
          const itemCount = getInventoryCount(comparison.itemId, inventory);
          if (comparison.operator === '<') {
            if (!(itemCount < comparison.value)) {
              return false;
            }
          } else if (comparison.operator === '>') {
            if (!(itemCount > comparison.value)) {
              return false;
            }
          }
        }
        
        // Check comparison requirements for memory
        for (const comparison of (reaction.memoryComparisons || [])) {
          const memCount = getMemoryCount(comparison.itemId, worldMemory);
          if (comparison.operator === '<') {
            if (!(memCount < comparison.value)) {
              return false;
            }
          } else if (comparison.operator === '>') {
            if (!(memCount > comparison.value)) {
              return false;
            }
          }
        }
        
        return true;
      });
      
      // Use valid reactions, or all reactions as fallback if none match
      const reactionsToUse = validReactions.length > 0 ? validReactions : reactions;
      
      // Select a random reaction from the available options
      const reaction = reactionsToUse[Math.floor(Math.random() * reactionsToUse.length)];
      
      setCharacterResponse(replaceMemoryPlaceholders(reaction.text, worldMemory));
      setIsGreeting(false);

      // Remove the given item from inventory (unless it's "nichts")
      if (itemId !== 'nichts') {
        setInventory(prev => {
          if (prev[itemId] && prev[itemId].count > 0) {
            const newCount = prev[itemId].count - 1;
            if (newCount === 0) {
              const { [itemId]: removed, ...rest } = prev;
              return rest;
            }
            return {
              ...prev,
              [itemId]: {
                ...prev[itemId],
                count: newCount
              }
            };
          }
          return prev;
        });
      }

      // Store the reaction effects to be applied later when the user clicks to advance
      setPendingReactionEffects(reaction);

      // Trigger page flip animation
      setAnimationKey(prev => prev + 1);

      // Enable advancing (teleport/switch/destinations will be determined in handleMiddlePanelClick)
      setCanAdvance(true);
    }
  };

  const handleGiveNothing = async () => {
    if (isTelegraphSyncing) return; // Block interaction during Telegraph sync
    // When clicking on a greeting, execute system calls and teleport/switch commands
    if (isGreeting && currentGreeting) {
      // Execute system call if present (inventory/memory were already executed when greeting appeared)
      let finalTeleportTo = currentGreeting.teleportTo;
      let finalSwitchToCharacter = currentGreeting.switchToCharacter;
      let telegraphUpload = false;
      let telegraphDownload = false;
      
      if (currentGreeting.systemCall) {
        // Execute system call with current inventory/memory state
        const inventoryCopy = JSON.parse(JSON.stringify(inventory));
        const memoryCopy = JSON.parse(JSON.stringify(worldMemory));
        const systemResult = await executeSystem(currentGreeting.systemCall, inventoryCopy, memoryCopy);
        
        // Apply inventory/memory changes from system call
        setInventory(inventoryCopy);
        setWorldMemory(memoryCopy);
        
        // Use teleport/switch from system call if present (overrides greeting's direct commands)
        if (systemResult.teleportTo) {
          finalTeleportTo = systemResult.teleportTo;
        }
        if (systemResult.switchToCharacter) {
          finalSwitchToCharacter = systemResult.switchToCharacter;
        }
        telegraphUpload = systemResult.telegraphUpload;
        telegraphDownload = systemResult.telegraphDownload;
        
        // Note: Telegraph sync already handled inside executeSystem
      }
      
      // Check if we have teleport or character switch commands (from greeting or system call)
      const hasTeleportCommand = finalTeleportTo || finalSwitchToCharacter;
      
      if (hasTeleportCommand) {
        // Greeting has teleport/switch commands
        // Note: Inventory/memory operations are handled by handleMiddlePanelClick
        // to prevent double execution
        
        // Trigger page flip animation
        setAnimationKey(prev => prev + 1);
        
        // Now handle teleport and character switch
        if (finalTeleportTo && finalSwitchToCharacter) {
          // Both teleport and character switch
          setCurrentLocation(finalTeleportTo);
          setCurrentCharacter(finalSwitchToCharacter);
          setCurrentGreeting(null); // Reset greeting before selecting new one
          setIsGreeting(true);
          
          // Play greeting from new character at new location (after teleport+switch)
          const newCharacter = gameData.characters[finalSwitchToCharacter];
          if (newCharacter && newCharacter.greetings.length > 0) {
            // Filter greetings based on requirements
            const inventoryCounts: {[itemId: string]: number} = {};
            Object.keys(inventory).forEach(itemId => {
              inventoryCounts[itemId] = inventory[itemId].count;
            });
            
            const validGreetings = newCharacter.greetings.filter(greeting => {
              // Check inventory requirements
              for (const req of (greeting.requirements || [])) {
                const count = getInventoryCount(req, inventory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT inventory requirements
              for (const notReq of (greeting.notRequirements || [])) {
                const count = getInventoryCount(notReq, inventory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check memory requirements
              for (const memReq of (greeting.memoryRequirements || [])) {
                const count = getMemoryCount(memReq, worldMemory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT memory requirements
              for (const notMemReq of (greeting.memoryNotRequirements || [])) {
                const count = getMemoryCount(notMemReq, worldMemory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check comparison requirements for items
              for (const comparison of (greeting.comparisons || [])) {
                const itemCount = getInventoryCount(comparison.itemId, inventory);
                if (comparison.operator === '<') {
                  if (!(itemCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(itemCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              // Check comparison requirements for memory
              for (const comparison of (greeting.memoryComparisons || [])) {
                const memCount = getMemoryCount(comparison.itemId, worldMemory);
                if (comparison.operator === '<') {
                  if (!(memCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(memCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              return true;
            });
            
            const greetingsToUse = validGreetings.length > 0 ? validGreetings : newCharacter.greetings;
            const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
            setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, worldMemory));
            setCurrentGreeting(randomGreeting);
            
            // Check if character has reactions and if so, whether it has an empty reaction
            const hasReactions = Object.values(newCharacter.reactions).some(arr => arr.length > 0);
            const hasEmptyReaction = newCharacter.reactions[''] && newCharacter.reactions[''].length > 0;
            const shouldAllowAdvance = !hasReactions || hasEmptyReaction;
            setCanAdvance(shouldAllowAdvance);
            
            // Execute inventory operations from the NEW character's greeting immediately
            randomGreeting.adds.forEach(itemId => {
              setInventory(prev => ({
                ...(prev || {}),
                [itemId]: {
                  count: ((prev || {})[itemId]?.count || 0) + 1,
                  lastAdded: Date.now()
                }
              }));
            });
            
            randomGreeting.removes.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (newInventory[itemId] && newInventory[itemId].count > 0) {
                  newInventory[itemId] = {
                    ...newInventory[itemId],
                    count: newInventory[itemId].count - 1
                  };
                  if (newInventory[itemId].count === 0) {
                    delete newInventory[itemId];
                  }
                }
                return newInventory;
              });
            });
            
            randomGreeting.removesAll.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (itemId.endsWith('_')) {
                  // Wildcard pattern: remove all items starting with this prefix
                  const prefix = itemId;
                  Object.keys(newInventory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newInventory[key];
                    }
                  });
                } else {
                  // Exact match: remove specific item
                  delete newInventory[itemId];
                }
                return newInventory;
              });
            });
            
            randomGreeting.memoryAdds.forEach(memoryId => {
              setWorldMemory(prev => ({
                ...(prev || {}),
                [memoryId]: ((prev || {})[memoryId] || 0) + 1
              }));
            });
            
            randomGreeting.memoryRemoves.forEach(memoryId => {
              setWorldMemory(prev => {
                const newMemory = { ...prev };
                if (newMemory[memoryId] && newMemory[memoryId] > 0) {
                  newMemory[memoryId] = newMemory[memoryId] - 1;
                  if (newMemory[memoryId] === 0) {
                    delete newMemory[memoryId];
                  }
                }
                return newMemory;
              });
            });
            
            randomGreeting.memoryRemovesAll.forEach(memoryId => {
              setWorldMemory(prev => {
                if (memoryId === '') {
                  // @% without ID: clear all world memory
                  return { 'empty': 1 };
                } else if (memoryId.endsWith('_')) {
                  // Wildcard pattern: remove all memory entries starting with this prefix
                  const prefix = memoryId;
                  const newMemory = { ...prev };
                  Object.keys(newMemory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newMemory[key];
                    }
                  });
                  return newMemory;
                } else {
                  // Exact match: remove specific memory entry
                  const { [memoryId]: removed, ...rest } = prev;
                  return rest;
                }
              });
            });
          } else {
            setCharacterResponse(null);
            setCurrentGreeting(null);
            setCanAdvance(false);
          }
        } else if (finalTeleportTo) {
          // Only teleport, no character switch
          setCurrentLocation(finalTeleportTo);
          setCurrentCharacter(null);
          setCharacterResponse(null);
          setCurrentGreeting(null);
          setIsGreeting(false);
          setMiddlePanel('character');
          setCanAdvance(false);
        } else if (finalSwitchToCharacter) {
          // Only character switch, no teleport
          
          // Execute character system call if present (BEFORE showing greeting)
          const newCharacter = gameData.characters[finalSwitchToCharacter];
          if (newCharacter && newCharacter.systemCall) {
            const inventoryCopy = JSON.parse(JSON.stringify(inventory));
            const memoryCopy = JSON.parse(JSON.stringify(worldMemory));
            const characterSystemResult = await executeSystem(newCharacter.systemCall, inventoryCopy, memoryCopy);
            
            // Apply inventory and memory changes from character system
            setInventory(inventoryCopy);
            setWorldMemory(memoryCopy);
            
            // If character system triggers teleport or character switch, handle it
            if (characterSystemResult.teleportTo || characterSystemResult.switchToCharacter) {
              setAnimationKey(prev => prev + 1);
              if (characterSystemResult.teleportTo) {
                setCurrentLocation(characterSystemResult.teleportTo);
              }
              if (characterSystemResult.switchToCharacter) {
                finalSwitchToCharacter = characterSystemResult.switchToCharacter;
              }
            }
          }
          
          setCurrentCharacter(finalSwitchToCharacter);
          setCurrentGreeting(null); // Reset greeting before selecting new one
          setIsGreeting(true);
          
          // Play greeting from new character
          const character = gameData.characters[finalSwitchToCharacter];
          if (character && character.greetings.length > 0) {
            // Filter greetings based on requirements
            const inventoryCounts: {[itemId: string]: number} = {};
            Object.keys(inventory).forEach(itemId => {
              inventoryCounts[itemId] = inventory[itemId].count;
            });
            
            const validGreetings = character.greetings.filter(greeting => {
              // Check inventory requirements
              for (const req of (greeting.requirements || [])) {
                const count = getInventoryCount(req, inventory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT inventory requirements
              for (const notReq of (greeting.notRequirements || [])) {
                const count = getInventoryCount(notReq, inventory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check memory requirements
              for (const memReq of (greeting.memoryRequirements || [])) {
                const count = getMemoryCount(memReq, worldMemory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT memory requirements
              for (const notMemReq of (greeting.memoryNotRequirements || [])) {
                const count = getMemoryCount(notMemReq, worldMemory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check comparison requirements for items
              for (const comparison of (greeting.comparisons || [])) {
                const itemCount = getInventoryCount(comparison.itemId, inventory);
                if (comparison.operator === '<') {
                  if (!(itemCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(itemCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              // Check comparison requirements for memory
              for (const comparison of (greeting.memoryComparisons || [])) {
                const memCount = getMemoryCount(comparison.itemId, worldMemory);
                if (comparison.operator === '<') {
                  if (!(memCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(memCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              return true;
            });
            
            const greetingsToUse = validGreetings.length > 0 ? validGreetings : character.greetings;
            const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
            setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, worldMemory));
            setCurrentGreeting(randomGreeting);
            
            // Check if character has reactions and if so, whether it has an empty reaction
            const hasReactions = Object.values(character.reactions).some(arr => arr.length > 0);
            const hasEmptyReaction = character.reactions[''] && character.reactions[''].length > 0;
            const shouldAllowAdvance = !hasReactions || hasEmptyReaction;
            setCanAdvance(shouldAllowAdvance);
            
            // Execute inventory operations from the NEW character's greeting immediately
            randomGreeting.adds.forEach(itemId => {
              setInventory(prev => ({
                ...(prev || {}),
                [itemId]: {
                  count: ((prev || {})[itemId]?.count || 0) + 1,
                  lastAdded: Date.now()
                }
              }));
            });
            
            randomGreeting.removes.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (newInventory[itemId] && newInventory[itemId].count > 0) {
                  newInventory[itemId] = {
                    ...newInventory[itemId],
                    count: newInventory[itemId].count - 1
                  };
                  if (newInventory[itemId].count === 0) {
                    delete newInventory[itemId];
                  }
                }
                return newInventory;
              });
            });
            
            randomGreeting.removesAll.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (itemId.endsWith('_')) {
                  // Wildcard pattern: remove all items starting with this prefix
                  const prefix = itemId;
                  Object.keys(newInventory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newInventory[key];
                    }
                  });
                } else {
                  // Exact match: remove specific item
                  delete newInventory[itemId];
                }
                return newInventory;
              });
            });
            
            randomGreeting.memoryAdds.forEach(memoryId => {
              setWorldMemory(prev => ({
                ...(prev || {}),
                [memoryId]: ((prev || {})[memoryId] || 0) + 1
              }));
            });
            
            randomGreeting.memoryRemoves.forEach(memoryId => {
              setWorldMemory(prev => {
                const newMemory = { ...prev };
                if (newMemory[memoryId] && newMemory[memoryId] > 0) {
                  newMemory[memoryId] = newMemory[memoryId] - 1;
                  if (newMemory[memoryId] === 0) {
                    delete newMemory[memoryId];
                  }
                }
                return newMemory;
              });
            });
            
            randomGreeting.memoryRemovesAll.forEach(memoryId => {
              setWorldMemory(prev => {
                if (memoryId === '') {
                  // @% without ID: clear all world memory
                  return { 'empty': 1 };
                } else if (memoryId.endsWith('_')) {
                  // Wildcard pattern: remove all memory entries starting with this prefix
                  const prefix = memoryId;
                  const newMemory = { ...prev };
                  Object.keys(newMemory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newMemory[key];
                    }
                  });
                  return newMemory;
                } else {
                  // Exact match: remove specific memory entry
                  const { [memoryId]: removed, ...rest } = prev;
                  return rest;
                }
              });
            });
          } else {
            setCharacterResponse(null);
            setCurrentGreeting(null);
            setCanAdvance(false);
          }
        }
      } else {
        // No teleport/switch - check if character has reactions
        const character = currentCharacter ? gameData.characters[currentCharacter] : null;
        const hasReactions = character ? Object.values(character.reactions).some(arr => arr.length > 0) : false;
        
        if (hasReactions) {
          // Character has reactions - trigger "nichts" reaction
          setIsGreeting(false);
          setCurrentGreeting(null);
          handleItemGiven('nichts');
        } else {
          // No reactions - go to destination selection
          setIsGreeting(false);
          setCharacterResponse(null);
          setCurrentGreeting(null);
          setCurrentCharacter(null);
          
          // Check if there's only one available destination
          const location = currentLocation ? gameData.locations[currentLocation] : null;
          if (location) {
            const availableDestinations = location.destinations.filter(destination => {
              // Check requirements
              const meetsRequirements = destination.requirements.every(req => inventory[req] && inventory[req].count > 0);
              const meetsNotRequirements = destination.notRequirements.every(req => !inventory[req] || inventory[req].count === 0);
              const meetsMemoryRequirements = destination.memoryRequirements.every(req => worldMemory[req] && worldMemory[req] > 0);
              const meetsMemoryNotRequirements = destination.memoryNotRequirements.every(req => !worldMemory[req] || worldMemory[req] === 0);
              
              // Check comparison requirements for items
              const meetsComparisons = (destination.comparisons || []).every(comp => {
                const itemCount = (inventory[comp.itemId]?.count || 0);
                if (comp.operator === '<') return itemCount < comp.value;
                if (comp.operator === '>') return itemCount > comp.value;
                return true;
              });
              
              // Check comparison requirements for memory
              const meetsMemoryComparisons = (destination.memoryComparisons || []).every(comp => {
                const memoryCount = (worldMemory[comp.itemId] || 0);
                if (comp.operator === '<') return memoryCount < comp.value;
                if (comp.operator === '>') return memoryCount > comp.value;
                return true;
              });
              
              return meetsRequirements && meetsNotRequirements && meetsMemoryRequirements && meetsMemoryNotRequirements && meetsComparisons && meetsMemoryComparisons;
            });
            
            if (availableDestinations.length === 1) {
              // Only one destination - go there automatically
              setAnimationKey(prev => prev + 1);
              setCurrentLocation(availableDestinations[0].id);
              setCurrentCharacter(null);
              setCurrentGreeting(null);
              setCharacterResponse(null);
              setMiddlePanel('character');
            } else {
              // Multiple or no destinations - show destination panel
              setAnimationKey(prev => prev + 1);
              setMiddlePanel('destinations');
            }
          } else {
            setAnimationKey(prev => prev + 1);
            setMiddlePanel('destinations');
          }
        }
      }
    } else {
      // Fallback: try nichts reaction
      handleItemGiven('nichts');
    }
  };

  const handleMiddlePanelClick = async () => {
    if (isTelegraphSyncing) return; // Block interaction during Telegraph sync
    
    // Reset auto-advance flag if it was set
    if (shouldAutoAdvance) {
      setShouldAutoAdvance(false);
    }
    
    if (canAdvance && middlePanel === 'character') {
      // Determine what actions to take using local variables
      let nextTeleportTo: string | null = null;
      let nextCharacterSwitch: string | null = null;
      
      // Apply pending reaction effects if they exist (from a previous reaction)
      if (pendingReactionEffects) {
        // STEP 1: Execute inventory/memory operations FIRST
        // Build new inventory state synchronously
        let newInventory = { ...inventory };
        
        // Check if inventory should be cleared
        if (pendingReactionEffects.clearInventory) {
          newInventory = {};
        } else {
          // Add all items specified in reaction
          pendingReactionEffects.adds.forEach(addItemId => {
            if (!newInventory[addItemId]) {
              newInventory[addItemId] = { count: 0, lastAdded: Date.now() };
            }
            newInventory[addItemId] = {
              count: newInventory[addItemId].count + 1,
              lastAdded: Date.now()
            };
          });

          // Remove all items specified in reaction
          pendingReactionEffects.removes.forEach(removeItemId => {
            if (newInventory[removeItemId] && newInventory[removeItemId].count > 0) {
              const newCount = newInventory[removeItemId].count - 1;
              if (newCount === 0) {
                delete newInventory[removeItemId];
              } else {
                newInventory[removeItemId] = {
                  ...newInventory[removeItemId],
                  count: newCount
                };
              }
            }
          });
          
          // Remove all instances of items specified with %
          pendingReactionEffects.removesAll.forEach(removeItemId => {
            if (removeItemId.endsWith('_')) {
              // Wildcard pattern: remove all items starting with this prefix
              const prefix = removeItemId;
              Object.keys(newInventory).forEach(key => {
                if (key.startsWith(prefix)) {
                  delete newInventory[key];
                }
              });
            } else {
              // Exact match: remove specific item
              delete newInventory[removeItemId];
            }
          });
        }
        
        // Apply inventory changes synchronously
        setInventory(newInventory);
        
        // Build final memory state locally
        let reactionFinalMemory = { ...worldMemory };
        
        // Handle world memory additions
        pendingReactionEffects.memoryAdds.forEach(memoryId => {
          reactionFinalMemory[memoryId] = (reactionFinalMemory[memoryId] || 0) + 1;
        });
        
        // Handle world memory removals
        pendingReactionEffects.memoryRemoves.forEach(memoryId => {
          if (reactionFinalMemory[memoryId] && reactionFinalMemory[memoryId] > 0) {
            reactionFinalMemory[memoryId]--;
            if (reactionFinalMemory[memoryId] <= 0) {
              delete reactionFinalMemory[memoryId];
            }
          }
        });
        
        // Handle removing all instances of memory
        pendingReactionEffects.memoryRemovesAll.forEach(memoryId => {
          if (memoryId === '') {
            // @% without ID: clear all world memory
            reactionFinalMemory = { 'empty': 1 };
          } else if (memoryId.endsWith('_')) {
            // Wildcard pattern: remove all memory entries starting with this prefix
            const prefix = memoryId;
            Object.keys(reactionFinalMemory).forEach(key => {
              if (key.startsWith(prefix)) {
                delete reactionFinalMemory[key];
              }
            });
          } else {
            // Exact match: remove specific memory entry
            delete reactionFinalMemory[memoryId];
          }
        });
        
        // Handle memory state and Telegraph sync ONLY if there's NO system call
        // (if there's a system call, it will handle everything)
        if (!pendingReactionEffects.systemCall) {
          // Set the final memory state
          setWorldMemory(reactionFinalMemory);
          
          if ((pendingReactionEffects.telegraphUpload || pendingReactionEffects.telegraphDownload) && telegraphMode === 'online' && telegraphPath) {
            setIsTelegraphSyncing(true);
          }
          if (pendingReactionEffects.telegraphUpload && telegraphMode === 'online' && telegraphPath) {
            await saveWorldMemoryToTelegraph(reactionFinalMemory);
          }
          if (pendingReactionEffects.telegraphDownload && telegraphMode === 'online' && telegraphPath) {
            const downloadedMemory = await loadWorldMemoryFromTelegraph(telegraphPath);
            if (downloadedMemory !== null) {
              reactionFinalMemory = downloadedMemory;
              setWorldMemory(downloadedMemory);
            }
          }
        }
        
        // STEP 2: Execute system call AFTER inventory/memory operations
        let reactionSystemResult = { teleportTo: null as string | null, switchToCharacter: null as string | null, telegraphUpload: false, telegraphDownload: false };
        
        if (pendingReactionEffects.systemCall) {
          // Create deep copies for system to mutate - use NEW inventory/memory state
          const inventoryCopy = JSON.parse(JSON.stringify(newInventory));
          const memoryCopy = JSON.parse(JSON.stringify(reactionFinalMemory));
          reactionSystemResult = await executeSystem(pendingReactionEffects.systemCall, inventoryCopy, memoryCopy);
          
          // Apply mutated copies to state
          setInventory(inventoryCopy);
          setWorldMemory(memoryCopy);
          
          // Note: Telegraph sync already handled inside executeSystem
          
          // Execute system teleport/switch IMMEDIATELY
          if (reactionSystemResult.teleportTo || reactionSystemResult.switchToCharacter) {
            setAnimationKey(prev => prev + 1);
            if (reactionSystemResult.teleportTo) {
              setCurrentLocation(reactionSystemResult.teleportTo);
              setCurrentCharacter(null); // Clear character when teleporting
            }
            if (reactionSystemResult.switchToCharacter) {
              setCurrentCharacter(reactionSystemResult.switchToCharacter);
            }
            // Clear greeting state - useEffect will trigger new greeting
            setIsGreeting(false);
            setCurrentGreeting(null);
            setCharacterResponse(null);
            setMiddlePanel('character');
            setPendingReactionEffects(null);
            return; // Stop processing
          }
        }
        
        // STEP 3: Set local variables for teleport/character switch from the reaction (only if system didn't handle it)
        if (pendingReactionEffects.teleportTo || pendingReactionEffects.switchToCharacter) {
          nextTeleportTo = pendingReactionEffects.teleportTo || null;
          nextCharacterSwitch = pendingReactionEffects.switchToCharacter || null;
        }
        
        // Clear the pending reaction effects
        setPendingReactionEffects(null);
      }
      
      // Trigger page flip animation
      setAnimationKey(prev => prev + 1);
      
      // If this is a greeting, execute its commands first
      if (isGreeting && currentGreeting) {
        // STEP 1: Execute inventory/memory operations FIRST
        // Build new inventory state synchronously
        let newInventory = { ...inventory };
        
        // Clear inventory if specified
        if (currentGreeting.clearInventory) {
          newInventory = {};
        }
        
        // Add items
        currentGreeting.adds.forEach(itemId => {
          if (!newInventory[itemId]) {
            newInventory[itemId] = { count: 0, lastAdded: Date.now() };
          }
          newInventory[itemId] = {
            count: newInventory[itemId].count + 1,
            lastAdded: Date.now()
          };
        });
        
        // Remove items (one instance)
        currentGreeting.removes.forEach(itemId => {
          if (newInventory[itemId] && newInventory[itemId].count > 0) {
            const newCount = newInventory[itemId].count - 1;
            if (newCount === 0) {
              delete newInventory[itemId];
            } else {
              newInventory[itemId] = {
                ...newInventory[itemId],
                count: newCount
              };
            }
          }
        });
        
        // Remove all instances of items
        currentGreeting.removesAll.forEach(itemId => {
          if (itemId.endsWith('_')) {
            // Wildcard pattern: remove all items starting with this prefix
            const prefix = itemId;
            Object.keys(newInventory).forEach(key => {
              if (key.startsWith(prefix)) {
                delete newInventory[key];
              }
            });
          } else {
            // Exact match: remove specific item
            delete newInventory[itemId];
          }
        });
        
        // Apply inventory changes synchronously
        setInventory(newInventory);
        
        // Build final memory state locally
        let finalMemory = { ...worldMemory };
        
        // Add world memories
        currentGreeting.memoryAdds.forEach(memoryId => {
          finalMemory[memoryId] = (finalMemory[memoryId] || 0) + 1;
        });
        
        // Remove world memories (one instance)
        currentGreeting.memoryRemoves.forEach(memoryId => {
          if (finalMemory[memoryId] && finalMemory[memoryId] > 0) {
            finalMemory[memoryId]--;
            if (finalMemory[memoryId] <= 0) {
              delete finalMemory[memoryId];
            }
          }
        });
        
        // Remove all instances of memory
        currentGreeting.memoryRemovesAll.forEach(memoryId => {
          if (memoryId === '') {
            // @% without ID: clear all world memory
            finalMemory = { 'empty': 1 };
          } else if (memoryId.endsWith('_')) {
            // Wildcard pattern: remove all memory entries starting with this prefix
            const prefix = memoryId;
            Object.keys(finalMemory).forEach(key => {
              if (key.startsWith(prefix)) {
                delete finalMemory[key];
              }
            });
          } else {
            // Exact match: remove specific memory entry
            delete finalMemory[memoryId];
          }
        });
        
        // Set the inventory state (even if no system call)
        setInventory(newInventory);
        
        // Handle memory state and Telegraph sync ONLY if there's NO system call
        // (if there's a system call, it will handle everything)
        if (!currentGreeting.systemCall) {
          // Set the final memory state
          setWorldMemory(finalMemory);
          
          if ((currentGreeting.telegraphUpload || currentGreeting.telegraphDownload) && telegraphMode === 'online' && telegraphPath) {
            setIsTelegraphSyncing(true);
          }
          if (currentGreeting.telegraphUpload && telegraphMode === 'online' && telegraphPath) {
            await saveWorldMemoryToTelegraph(finalMemory);
          }
          if (currentGreeting.telegraphDownload && telegraphMode === 'online' && telegraphPath) {
            const downloadedMemory = await loadWorldMemoryFromTelegraph(telegraphPath);
            if (downloadedMemory !== null) {
              finalMemory = downloadedMemory;
              setWorldMemory(downloadedMemory);
            }
          }
        }
        
        // STEP 2: Execute system call AFTER inventory/memory operations
        let greetingSystemResult = { teleportTo: null as string | null, switchToCharacter: null as string | null, telegraphUpload: false, telegraphDownload: false };
        
        if (currentGreeting.systemCall) {
          // Create deep copies for system to mutate - use NEW inventory/memory state
          const inventoryCopy = JSON.parse(JSON.stringify(newInventory));
          const memoryCopy = JSON.parse(JSON.stringify(finalMemory));
          greetingSystemResult = await executeSystem(currentGreeting.systemCall, inventoryCopy, memoryCopy);
          
          // Apply mutated copies to state
          setInventory(inventoryCopy);
          setWorldMemory(memoryCopy);
          
          // Note: Telegraph sync already handled inside executeSystem
          
          // Execute system teleport/switch IMMEDIATELY
          if (greetingSystemResult.teleportTo || greetingSystemResult.switchToCharacter) {
            if (greetingSystemResult.teleportTo) {
              setCurrentLocation(greetingSystemResult.teleportTo);
              setCurrentCharacter(null); // Clear character when teleporting
            }
            if (greetingSystemResult.switchToCharacter) {
              setCurrentCharacter(greetingSystemResult.switchToCharacter);
            }
            // Clear greeting state - useEffect will trigger new greeting
            setIsGreeting(false);
            setCurrentGreeting(null);
            setCharacterResponse(null);
            setMiddlePanel('character');
            return; // Stop processing
          }
        }
        
        // STEP 3: Check for teleport/character switch in the greeting (only if system didn't handle it)
        if (currentGreeting.teleportTo || currentGreeting.switchToCharacter) {
          // Override local variables with greeting's teleport/switch
          nextTeleportTo = currentGreeting.teleportTo || null;
          nextCharacterSwitch = currentGreeting.switchToCharacter || null;
        }
      }
      
      // Update the state with determined values
      setPendingTeleport(nextTeleportTo);
      setPendingCharacterSwitch(nextCharacterSwitch);
      
      // Priority: 1. Teleport first (if present), 2. Then character switch (if present), 3. Otherwise go to destinations
      
      // Check if there's a teleport (with or without character switch)
      if (nextTeleportTo) {
        // Execute the teleport
        setCurrentLocation(nextTeleportTo);
        setPendingTeleport(null);
        
        // If there's also a character switch, keep it pending for the new location
        if (nextCharacterSwitch) {
          // Character switch will happen at the new location
          setCurrentCharacter(nextCharacterSwitch);
          setCurrentGreeting(null); // Reset greeting before selecting new one
          setPendingCharacterSwitch(null);
          setIsGreeting(true);
          
          // Play greeting from new character at new location
          const newCharacter = gameData.characters[nextCharacterSwitch];
          if (newCharacter && newCharacter.greetings.length > 0) {
            // Filter greetings based on requirements
            const inventoryCounts: {[itemId: string]: number} = {};
            Object.keys(inventory).forEach(itemId => {
              inventoryCounts[itemId] = inventory[itemId].count;
            });
            
            const validGreetings = newCharacter.greetings.filter(greeting => {
              // Check inventory requirements
              for (const req of (greeting.requirements || [])) {
                const count = getInventoryCount(req, inventory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT inventory requirements
              for (const notReq of (greeting.notRequirements || [])) {
                const count = getInventoryCount(notReq, inventory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check memory requirements
              for (const memReq of (greeting.memoryRequirements || [])) {
                const count = getMemoryCount(memReq, worldMemory);
                if (count === 0) {
                  return false;
                }
              }
              
              // Check NOT memory requirements
              for (const notMemReq of (greeting.memoryNotRequirements || [])) {
                const count = getMemoryCount(notMemReq, worldMemory);
                if (count > 0) {
                  return false;
                }
              }
              
              // Check comparison requirements for items
              for (const comparison of (greeting.comparisons || [])) {
                const itemCount = getInventoryCount(comparison.itemId, inventory);
                if (comparison.operator === '<') {
                  if (!(itemCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(itemCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              // Check comparison requirements for memory
              for (const comparison of (greeting.memoryComparisons || [])) {
                const memCount = getMemoryCount(comparison.itemId, worldMemory);
                if (comparison.operator === '<') {
                  if (!(memCount < comparison.value)) {
                    return false;
                  }
                } else if (comparison.operator === '>') {
                  if (!(memCount > comparison.value)) {
                    return false;
                  }
                }
              }
              
              return true;
            });
            
            const greetingsToUse = validGreetings.length > 0 ? validGreetings : newCharacter.greetings;
            const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
            setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, worldMemory));
            setCurrentGreeting(randomGreeting);
            
            // Check if character has reactions and if so, whether it has an empty reaction
            const hasReactions = Object.values(newCharacter.reactions).some(arr => arr.length > 0);
            const hasEmptyReaction = newCharacter.reactions[''] && newCharacter.reactions[''].length > 0;
            const shouldAllowAdvance = !hasReactions || hasEmptyReaction;
            setCanAdvance(shouldAllowAdvance);
            
            // Execute inventory operations from the NEW character's greeting immediately
            randomGreeting.adds.forEach(itemId => {
              setInventory(prev => ({
                ...(prev || {}),
                [itemId]: {
                  count: ((prev || {})[itemId]?.count || 0) + 1,
                  lastAdded: Date.now()
                }
              }));
            });
            
            randomGreeting.removes.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (newInventory[itemId] && newInventory[itemId].count > 0) {
                  newInventory[itemId] = {
                    ...newInventory[itemId],
                    count: newInventory[itemId].count - 1
                  };
                  if (newInventory[itemId].count === 0) {
                    delete newInventory[itemId];
                  }
                }
                return newInventory;
              });
            });
            
            randomGreeting.removesAll.forEach(itemId => {
              setInventory(prev => {
                const newInventory = { ...prev };
                if (itemId.endsWith('_')) {
                  // Wildcard pattern: remove all items starting with this prefix
                  const prefix = itemId;
                  Object.keys(newInventory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newInventory[key];
                    }
                  });
                } else {
                  // Exact match: remove specific item
                  delete newInventory[itemId];
                }
                return newInventory;
              });
            });
            
            randomGreeting.memoryAdds.forEach(memoryId => {
              setWorldMemory(prev => ({
                ...(prev || {}),
                [memoryId]: ((prev || {})[memoryId] || 0) + 1
              }));
            });
            
            randomGreeting.memoryRemoves.forEach(memoryId => {
              setWorldMemory(prev => {
                const newMemory = { ...prev };
                if (newMemory[memoryId] && newMemory[memoryId] > 0) {
                  newMemory[memoryId] = newMemory[memoryId] - 1;
                  if (newMemory[memoryId] === 0) {
                    delete newMemory[memoryId];
                  }
                }
                return newMemory;
              });
            });
            
            randomGreeting.memoryRemovesAll.forEach(memoryId => {
              setWorldMemory(prev => {
                if (memoryId === '') {
                  // @% without ID: clear all world memory
                  return { 'empty': 1 };
                } else if (memoryId.endsWith('_')) {
                  // Wildcard pattern: remove all memory entries starting with this prefix
                  const prefix = memoryId;
                  const newMemory = { ...prev };
                  Object.keys(newMemory).forEach(key => {
                    if (key.startsWith(prefix)) {
                      delete newMemory[key];
                    }
                  });
                  return newMemory;
                } else {
                  // Exact match: remove specific memory entry
                  const { [memoryId]: removed, ...rest } = prev;
                  return rest;
                }
              });
            });
          } else {
            setCharacterResponse(null);
            setCurrentGreeting(null);
            setCanAdvance(false);
          }
        } else {
          // No character switch, just teleported to new location
          setCurrentCharacter(null);
          setCharacterResponse(null);
          setMiddlePanel('character');
          setCanAdvance(false);
          setIsGreeting(true);
        }
      }
      // Check if there's only a character switch (no teleport)
      else if (nextCharacterSwitch) {
        // Execute the character switch (stay at same location)
        const newCharacterId = nextCharacterSwitch;
        setCurrentCharacter(newCharacterId);
        setCurrentGreeting(null); // Reset greeting before selecting new one
        setPendingCharacterSwitch(null);
        setIsGreeting(true);
        
        // Play greeting from new character
        const newCharacter = gameData.characters[newCharacterId];
        if (newCharacter && newCharacter.greetings.length > 0) {
          // Filter greetings based on requirements
          const inventoryCounts: {[itemId: string]: number} = {};
          Object.keys(inventory).forEach(itemId => {
            inventoryCounts[itemId] = inventory[itemId].count;
          });
          
          const validGreetings = newCharacter.greetings.filter(greeting => {
            // Check inventory requirements
            for (const req of (greeting.requirements || [])) {
              const count = getInventoryCount(req, inventory);
              if (count === 0) {
                return false;
              }
            }
            
            // Check NOT inventory requirements
            for (const notReq of (greeting.notRequirements || [])) {
              const count = getInventoryCount(notReq, inventory);
              if (count > 0) {
                return false;
              }
            }
            
            // Check memory requirements
            for (const memReq of (greeting.memoryRequirements || [])) {
              const count = getMemoryCount(memReq, worldMemory);
              if (count === 0) {
                return false;
              }
            }
            
            // Check NOT memory requirements
            for (const notMemReq of (greeting.memoryNotRequirements || [])) {
              const count = getMemoryCount(notMemReq, worldMemory);
              if (count > 0) {
                return false;
              }
            }
            
            // Check comparison requirements for items
            for (const comparison of (greeting.comparisons || [])) {
              const itemCount = getInventoryCount(comparison.itemId, inventory);
              if (comparison.operator === '<') {
                if (!(itemCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(itemCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            // Check comparison requirements for memory
            for (const comparison of (greeting.memoryComparisons || [])) {
              const memCount = getMemoryCount(comparison.itemId, worldMemory);
              if (comparison.operator === '<') {
                if (!(memCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(memCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            return true;
          });
          
          const greetingsToUse = validGreetings.length > 0 ? validGreetings : newCharacter.greetings;
          const randomGreeting = greetingsToUse[Math.floor(Math.random() * greetingsToUse.length)];
          setCharacterResponse(replaceMemoryPlaceholders(randomGreeting.text, worldMemory));
          setCurrentGreeting(randomGreeting);
          
          // Check if character has reactions and if so, whether it has an empty reaction
          const hasReactions = Object.values(newCharacter.reactions).some(arr => arr.length > 0);
          const hasEmptyReaction = newCharacter.reactions[''] && newCharacter.reactions[''].length > 0;
          const shouldAllowAdvance = !hasReactions || hasEmptyReaction;
          setCanAdvance(shouldAllowAdvance);
          
          // Execute inventory operations from the NEW character's greeting immediately
          randomGreeting.adds.forEach(itemId => {
            setInventory(prev => ({
              ...(prev || {}),
              [itemId]: {
                count: ((prev || {})[itemId]?.count || 0) + 1,
                lastAdded: Date.now()
              }
            }));
          });
          
          randomGreeting.removes.forEach(itemId => {
            setInventory(prev => {
              const newInventory = { ...prev };
              if (newInventory[itemId] && newInventory[itemId].count > 0) {
                newInventory[itemId] = {
                  ...newInventory[itemId],
                  count: newInventory[itemId].count - 1
                };
                if (newInventory[itemId].count === 0) {
                  delete newInventory[itemId];
                }
              }
              return newInventory;
            });
          });
          
          randomGreeting.removesAll.forEach(itemId => {
            setInventory(prev => {
              const newInventory = { ...prev };
              if (itemId.endsWith('_')) {
                // Wildcard pattern: remove all items starting with this prefix
                const prefix = itemId;
                Object.keys(newInventory).forEach(key => {
                  if (key.startsWith(prefix)) {
                    delete newInventory[key];
                  }
                });
              } else {
                // Exact match: remove specific item
                delete newInventory[itemId];
              }
              return newInventory;
            });
          });
          
          randomGreeting.memoryAdds.forEach(memoryId => {
            setWorldMemory(prev => ({
              ...(prev || {}),
              [memoryId]: ((prev || {})[memoryId] || 0) + 1
            }));
          });
          
          randomGreeting.memoryRemoves.forEach(memoryId => {
            setWorldMemory(prev => {
              const newMemory = { ...prev };
              if (newMemory[memoryId] && newMemory[memoryId] > 0) {
                newMemory[memoryId] = newMemory[memoryId] - 1;
                if (newMemory[memoryId] === 0) {
                  delete newMemory[memoryId];
                }
              }
              return newMemory;
            });
          });
          
          randomGreeting.memoryRemovesAll.forEach(memoryId => {
            setWorldMemory(prev => {
              if (memoryId === '') {
                // @% without ID: clear all world memory
                return { 'empty': 1 };
              } else if (memoryId.endsWith('_')) {
                // Wildcard pattern: remove all memory entries starting with this prefix
                const prefix = memoryId;
                const newMemory = { ...prev };
                Object.keys(newMemory).forEach(key => {
                  if (key.startsWith(prefix)) {
                    delete newMemory[key];
                  }
                });
                return newMemory;
              } else {
                // Exact match: remove specific memory entry
                const { [memoryId]: removed, ...rest } = prev;
                return rest;
              }
            });
          });
        } else {
          setCharacterResponse(null);
          setCurrentGreeting(null);
          setCanAdvance(false);
        }
      } else {
        // No teleport or character switch - check available destinations
        const location = gameData.locations[currentLocation];
        
        // Reset state before proceeding
        setIsGreeting(false);
        setCanAdvance(false);
        
        // Use current world memory for destination filtering
        let currentWorldMemory = worldMemory;
        
        if (location && location.destinations) {
          // Filter destinations based on requirements
          const availableDestinations = location.destinations.filter(destination => {
            const playerCounts = new Map<string, number>();
            Object.entries(inventory || {}).forEach(([itemId, item]) => {
              playerCounts.set(itemId, item.count);
            });
            
            // Check NOT-requirements first (items that must NOT be in inventory)
            for (const itemId of destination.notRequirements) {
              const playerCount = playerCounts.get(itemId) || 0;
              if (playerCount > 0) {
                return false; // This item must not be in inventory
              }
            }
            
            // Check memory NOT-requirements (memories that must NOT exist)
            for (const memoryId of destination.memoryNotRequirements) {
              if (currentWorldMemory[memoryId] && currentWorldMemory[memoryId] > 0) {
                return false; // This memory must not exist
              }
            }
            
            // Check memory requirements (memories that must exist)
            for (const memoryId of destination.memoryRequirements) {
              if (!currentWorldMemory[memoryId] || currentWorldMemory[memoryId] === 0) {
                return false; // This memory must exist
              }
            }
            
            // Check comparison requirements for items
            for (const comparison of (destination.comparisons || [])) {
              const itemCount = playerCounts.get(comparison.itemId) || 0;
              if (comparison.operator === '<') {
                if (!(itemCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(itemCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            // Check comparison requirements for memory
            for (const comparison of (destination.memoryComparisons || [])) {
              const memoryCount = currentWorldMemory[comparison.itemId] || 0;
              if (comparison.operator === '<') {
                if (!(memoryCount < comparison.value)) {
                  return false;
                }
              } else if (comparison.operator === '>') {
                if (!(memoryCount > comparison.value)) {
                  return false;
                }
              }
            }
            
            // Check if player has all required items
            const requiredCounts = new Map<string, number>();
            destination.requirements.forEach(item => {
              requiredCounts.set(item, (requiredCounts.get(item) || 0) + 1);
            });
            
            for (const [item, requiredCount] of requiredCounts) {
              const playerCount = playerCounts.get(item) || 0;
              if (playerCount < requiredCount) {
                return false;
              }
            }
            
            return true;
          });
          
          console.log('[DEBUG] Available destinations:', availableDestinations.map(d => d.id));
          console.log('[DEBUG] Available destinations count:', availableDestinations.length);
          
          // If only one destination is available, go there automatically
          if (availableDestinations.length === 1) {
            console.log('[DEBUG] Auto-advancing to:', availableDestinations[0].id);
            handleDestinationSelected(availableDestinations[0].id);
          } else {
            // Multiple or no destinations - show destinations panel
            console.log('[DEBUG] Showing destinations panel');
            setAnimationKey(prev => prev + 1);
            setMiddlePanel('destinations');
          }
        } else {
          // No destinations defined - show destinations panel (will be empty)
          setAnimationKey(prev => prev + 1);
          setMiddlePanel('destinations');
        }
      }
    }
  };

  const handleDestinationSelected = async (locationId: string) => {
    // Trigger page flip animation
    setAnimationKey(prev => prev + 1);
    
    // Check if location has a system call
    const location = gameData.locations[locationId];
    if (location && location.systemCall) {
      // Execute location system before entering
      const inventoryCopy = JSON.parse(JSON.stringify(inventory));
      const memoryCopy = JSON.parse(JSON.stringify(worldMemory));
      const systemResult = await executeSystem(location.systemCall, inventoryCopy, memoryCopy);
      
      // Apply inventory and memory changes from system
      setInventory(inventoryCopy);
      setWorldMemory(memoryCopy);
      
      // Handle system result (teleport or character switch)
      if (systemResult.teleportTo) {
        locationId = systemResult.teleportTo;
      }
    }
    
    setCurrentLocation(locationId);
    setCurrentCharacter(null);
    setCharacterResponse(null);
    setCurrentGreeting(null);
    setMiddlePanel('character');
    setCanAdvance(false);
    setIsGreeting(true);
  };

  // Show loading screen while loading script from URL
  if (isLoading) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          multiple
          webkitdirectory=""
          style={{ display: 'none' }}
          onChange={async (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              await processUploadedFiles(files);
            }
            // Reset input
            e.target.value = '';
          }}
        />
        <div className="h-[100dvh] bg-black flex items-center justify-center" style={{ fontFamily: 'Garamond, Georgia, serif', color: '#eaeaea' }}>
          <div className="flex flex-col items-center gap-2">
            {loadingProgress === 0 ? (
              <div className="text-2xl">Loading...</div>
            ) : (
              <>
                <div className="text-2xl">Loading</div>
                <div className="text-xl">{'*'.repeat(loadingProgress)}</div>
              </>
            )}
          </div>
        </div>
      </>
    );
  }

  if (isEditorMode) {
    return (
      <>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          multiple
          webkitdirectory=""
          style={{ display: 'none' }}
          onChange={async (e) => {
            const files = e.target.files;
            if (files && files.length > 0) {
              await processUploadedFiles(files);
            }
            // Reset input
            e.target.value = '';
          }}
        />
        <div className="min-h-screen bg-gray-900 p-8" style={{ color: '#eaeaea' }}>
          <div className="max-w-7xl mx-auto">
            <div className="mb-4">
              <h1 className="text-2xl font-mono">Script Editor</h1>
            </div>
            <div className="flex gap-4">
              <textarea
                value={script}
                onChange={(e) => setScript(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'a') {
                    e.preventDefault();
                    e.currentTarget.select();
                  }
                }}
                className="bg-gray-800 p-4 rounded font-mono"
                style={{ color: '#eaeaea', fontSize: '0.6rem', height: '80vh', width: '66.666%' }}
                spellCheck={false}
              />
              <textarea
                value={Object.entries(worldMemory)
                  .filter(([key]) => key !== 'empty')
                  .sort(([a], [b]) => a.localeCompare(b))
                  .map(([key, value]) => `${key}: ${value}`)
                  .join('\n')}
                readOnly
                className="bg-gray-800 p-4 rounded font-mono"
                style={{ color: '#eaeaea', fontSize: '0.6rem', height: '80vh', width: '33.333%' }}
                spellCheck={false}
                placeholder="Weltgedächtnis leer"
              />
            </div>
          </div>
        </div>
      </>
    );
  }

  const location = gameData.locations[currentLocation];
  const character = currentCharacter ? gameData.characters[currentCharacter] : null;

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        multiple
        webkitdirectory=""
        style={{ display: 'none' }}
        onChange={async (e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            await processUploadedFiles(files);
          }
          // Reset input
          e.target.value = '';
        }}
      />
      <div className="h-[100dvh] flex flex-col items-center overflow-hidden relative" style={{ fontFamily: 'Garamond, Georgia, serif', color: '#eaeaea', touchAction: 'none', backgroundColor }}>
        {/* Telegraph Mode Indicator */}
        <div 
          className={`absolute top-2 right-2 w-2 h-2 rounded-full z-50 ${
            telegraphMode === 'online' && !isDisconnectedLocalMode
              ? isTelegraphSyncing 
                ? 'bg-green-500 opacity-80 animate-pulse' 
                : 'bg-green-500 opacity-80'
              : 'border border-white/50 opacity-50'
          }`}
          title={
            telegraphMode === 'online' && !isDisconnectedLocalMode
              ? isTelegraphSyncing
                ? 'Synchronisiert mit Telegraph...'
                : 'Online Mode - Weltgedächtnis wird auf Telegraph gespeichert' 
              : 'Offline Mode - Weltgedächtnis wird nur lokal gespeichert (Ctrl+Backspace zum Verbinden)'
          }
        />
        
        {/* Fullscreen Button (Mobile Only, if API is available) */}
        {isMobile && isFullscreenAvailable && (
          <button
            className="absolute top-2 left-2 w-8 h-8 rounded flex items-center justify-center z-50 bg-white/10 hover:bg-white/20 active:bg-white/30 transition-colors"
            onClick={() => {
              const docEl = document.documentElement as any;
              if (!document.fullscreenElement) {
                // Try standard API first, then webkit
                if (docEl.requestFullscreen) {
                  docEl.requestFullscreen().catch((err: any) => {
                    console.log('Fullscreen error:', err);
                  });
                } else if (docEl.webkitRequestFullscreen) {
                  docEl.webkitRequestFullscreen();
                }
              } else {
                if (document.exitFullscreen) {
                  document.exitFullscreen();
                } else if ((document as any).webkitExitFullscreen) {
                  (document as any).webkitExitFullscreen();
                }
              }
            }}
            title="Fullscreen"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
            </svg>
          </button>
        )}
        
        <div className="w-full max-w-2xl h-full flex flex-col pt-4 md:pt-0 gap-2 md:gap-0" style={{ touchAction: 'none' }}>
        
        {/* Page Flip Container - Upper + Middle Panels */}
        <div className="perspective-container relative" style={{ height: isMobile ? 'calc(85dvh - 12px)' : 'calc(70dvh - 12px)', touchAction: 'none' }}>
          <AnimatePresence initial={false}>
            <motion.div
              key={animationKey}
              initial={
                animationStyle === 'slide' 
                  ? { x: 0, opacity: 1 }
                  : animationStyle === 'none'
                  ? { opacity: 1 }
                  : { rotateY: 0, opacity: 1 }
              }
              animate={
                animationStyle === 'slide' 
                  ? { x: 0, opacity: 1 }
                  : animationStyle === 'none'
                  ? { opacity: 1 }
                  : { rotateY: 0, opacity: 1 }
              }
              exit={
                animationStyle === 'slide' 
                  ? { x: isMobile ? 'calc(-100% - 50px)' : '-100%', opacity: 0 }
                  : animationStyle === 'none'
                  ? { opacity: 1 }
                  : { rotateY: -90, opacity: 1 }
              }
              transition={
                characterResponse === '.'
                  ? { duration: 0 }
                  : animationStyle === 'slide'
                  ? {
                      x: { 
                        duration: isMobile ? 2.4 : 3.6,
                        ease: [0.16, 1, 0.3, 1]
                      },
                      opacity: {
                        duration: 0.5,
                        delay: 0.7,
                        ease: 'easeOut'
                      }
                    }
                  : animationStyle === 'none'
                  ? { duration: 0 }
                  : {
                      duration: isMobile ? 2.0 : 4.0,
                      ease: [0.16, 1, 0.3, 1]
                    }
              }
              style={{
                transformStyle: animationStyle === 'page' ? 'preserve-3d' : undefined,
                transformOrigin: animationStyle === 'page' ? 'left center' : undefined,
                backfaceVisibility: animationStyle === 'page' ? 'hidden' : undefined,
                position: 'absolute',
                width: '100%',
                height: '100%',
                zIndex: 1000 - animationKey,
                backgroundColor,
                touchAction: 'none',
                display: 'flex',
                flexDirection: 'column'
              }}
            >
              {/* Upper Panel - Location */}
              <div className="text-center h-auto min-h-[120px] md:h-[30dvh] w-full flex flex-col items-center md:justify-end flex-shrink-0 overflow-y-auto md:pt-6">
                <div className="w-[300px] md:w-[400px] mx-auto md:mb-0 flex flex-col items-center justify-center gap-2">
                  {location?.image ? (
                    <>
                      {/* Location Name above image */}
                      <p 
                        className="text-center uppercase tracking-[0.65px]" 
                        style={{ 
                          fontFamily: labelFont + ', serif', 
                          fontSize: labelFontSize || '13px',
                          letterSpacing: '0.65px',
                          color: textColor,
                          opacity: 0.75,
                          fontVariant: 'small-caps',
                          fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
                          fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal'
                        }}
                      >
                        {location.name}
                      </p>
                      <ImageWithFallback 
                        src={location.image} 
                        alt={location.name}
                        className="w-full md:w-auto md:mx-auto object-cover"
                        style={isMobile ? { aspectRatio: '2 / 1', objectFit: 'cover' } : { height: 'calc(30dvh - 24px)', width: 'calc(2 * (30dvh - 24px))', maxWidth: '300px', maxHeight: '150px', objectFit: 'cover' }}
                      />
                    </>
                  ) : (
                    <>
                      {location?.name !== '' && (
                        <p 
                          className="text-center uppercase tracking-[0.65px]" 
                          style={{ 
                            fontFamily: labelFont + ', serif', 
                            fontSize: labelFontSize || '13px',
                            letterSpacing: '0.65px',
                            color: textColor,
                            opacity: 0.75,
                            fontVariant: 'small-caps',
                            fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
                            fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal'
                          }}
                        >
                          {location?.name || 'Unbekannter Ort'}
                        </p>
                      )}
                      <div className="text-[48px] sm:text-4xl md:text-5xl">{location?.emoji}</div>
                    </>
                  )}
                </div>
              </div>

              {/* Middle Panel - Character Response or Destinations */}
              <div className="flex-1 md:h-[40dvh] flex text-center overflow-hidden relative md:mt-6">
                  {middlePanel === 'character' ? (
                    <div className="absolute w-full h-full flex">
                      <CharacterDropZone
                        character={character}
                        characterResponse={characterResponse}
                        canAdvance={canAdvance}
                        isGreeting={isGreeting}
                        onItemDropped={handleItemGiven}
                        onClick={handleMiddlePanelClick}
                        onGiveNothing={handleGiveNothing}
                        textColor={textColor}
                        textFont={textFont}
                        labelFont={labelFont}
                        textFontSize={textFontSize}
                        textFontStyle={textFontStyle}
                        labelFontSize={labelFontSize}
                        labelFontStyle={labelFontStyle}
                      />
                    </div>
                  ) : (
                    <div className="absolute w-full h-full overflow-y-auto flex flex-col items-center pt-0">
                      <div className="flex flex-col gap-2 w-full max-w-md pb-8 mx-auto items-center justify-center flex-1">
                  {location?.destinations.map((destination, index) => {
                    const dest = gameData.locations[destination.id];
                    if (!dest) return null;
                    
                    const playerCounts = new Map<string, number>();
                    Object.entries(inventory || {}).forEach(([itemId, item]) => {
                      playerCounts.set(itemId, item.count);
                    });
                    
                    // Check NOT-requirements first (items that must NOT be in inventory)
                    for (const itemId of destination.notRequirements) {
                      const playerCount = playerCounts.get(itemId) || 0;
                      if (playerCount > 0) {
                        return null; // This item must not be in inventory
                      }
                    }
                    
                    // Check memory NOT-requirements (memories that must NOT exist)
                    for (const memoryId of destination.memoryNotRequirements) {
                      if (worldMemory[memoryId] && worldMemory[memoryId] > 0) {
                        return null; // This memory must not exist
                      }
                    }
                    
                    // Check memory requirements (memories that must exist)
                    for (const memoryId of destination.memoryRequirements) {
                      if (!worldMemory[memoryId] || worldMemory[memoryId] === 0) {
                        return null; // This memory must exist
                      }
                    }
                    
                    // Check comparison requirements for items
                    for (const comparison of (destination.comparisons || [])) {
                      const itemCount = playerCounts.get(comparison.itemId) || 0;
                      if (comparison.operator === '<') {
                        if (!(itemCount < comparison.value)) {
                          return null;
                        }
                      } else if (comparison.operator === '>') {
                        if (!(itemCount > comparison.value)) {
                          return null;
                        }
                      }
                    }
                    
                    // Check comparison requirements for memory
                    for (const comparison of (destination.memoryComparisons || [])) {
                      const memoryCount = worldMemory[comparison.itemId] || 0;
                      if (comparison.operator === '<') {
                        if (!(memoryCount < comparison.value)) {
                          return null;
                        }
                      } else if (comparison.operator === '>') {
                        if (!(memoryCount > comparison.value)) {
                          return null;
                        }
                      }
                    }
                    
                    // Check if player has all required items
                    const requiredCounts = new Map<string, number>();
                    destination.requirements.forEach(item => {
                      requiredCounts.set(item, (requiredCounts.get(item) || 0) + 1);
                    });
                    
                    let hasRequiredItems = true;
                    for (const [item, requiredCount] of requiredCounts) {
                      const playerCount = playerCounts.get(item) || 0;
                      if (playerCount < requiredCount) {
                        hasRequiredItems = false;
                        break;
                      }
                    }
                    
                    if (!hasRequiredItems) return null;
                    
                    return (
                      <button
                        key={`${destination.id}-${index}`}
                        onClick={() => handleDestinationSelected(destination.id)}
                        className="group px-2 py-0 bg-[rgba(30,30,30,0)] rounded transition-colors text-xl text-center"
                      >
                        <span 
                          className="group-hover:underline" 
                          style={{ 
                            fontFamily: labelFont + ', serif', 
                            fontSize: labelFontSize || '0.67em', 
                            color: textColor,
                            opacity: 1,
                            fontStyle: labelFontStyle?.includes('italic') ? 'italic' : 'normal',
                            fontWeight: labelFontStyle?.includes('bold') ? 'bold' : 'normal'
                          }}
                        >
                          {destination.displayName || dest.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
        </div>
      </motion.div>
    </AnimatePresence>
  </div>

        {/* Lower Panel - Inventory */}
        <div className="h-[25dvh] md:h-[30dvh] flex flex-col flex-shrink-0 overflow-hidden pt-0 md:pt-6" style={{ touchAction: 'none' }}>
          <div className="overflow-y-auto flex-1 px-2 md:px-0 pb-4 md:py-8">
            <div className="grid grid-cols-3 md:flex md:flex-wrap gap-3 md:gap-5 w-full max-w-4xl md:justify-center mx-auto">
              {(() => {
                // Sort items by lastAdded timestamp (descending)
                const sortedItems = Object.entries(inventory || {})
                  .sort(([, a], [, b]) => b.lastAdded - a.lastAdded);
                
                // Display items sorted by lastAdded
                return sortedItems.map(([itemId, inventoryItem]) => {
                  const item = gameData.items[itemId];
                  if (!item) return null;
                  
                  // Hide items with empty names
                  if (!item.name || item.name.trim() === '') return null;
                  
                  // Check if current character has a reaction for this item
                  let characterHasReaction = false;
                  if (currentCharacter) {
                    const character = gameData.characters[currentCharacter];
                    if (character) {
                      // Find matching reaction - either exact match or wildcard pattern match
                      let reactions: any[] = [];
                      
                      // First try exact match
                      if (character.reactions[itemId]) {
                        reactions = character.reactions[itemId];
                      } else {
                        // Try wildcard pattern match - check if any reaction key ends with _ and matches as prefix
                        for (const reactionKey of Object.keys(character.reactions)) {
                          if (reactionKey.endsWith('_') && itemId.startsWith(reactionKey)) {
                            reactions = character.reactions[reactionKey];
                            break;
                          }
                        }
                      }
                      
                      if (reactions && reactions.length > 0) {
                        // Check if there are any valid reactions based on requirements
                        const reactionInventoryCounts: {[itemId: string]: number} = {};
                        Object.entries(inventory || {}).forEach(([id, item]) => {
                          reactionInventoryCounts[id] = item.count;
                        });
                        
                        const validReactions = reactions.filter(reaction => {
                          // Check inventory requirements
                          for (const req of (reaction.requirements || [])) {
                            const count = getInventoryCount(req, inventory);
                            if (count === 0) {
                              return false;
                            }
                          }
                          
                          // Check NOT inventory requirements
                          for (const notReq of (reaction.notRequirements || [])) {
                            const count = getInventoryCount(notReq, inventory);
                            if (count > 0) {
                              return false;
                            }
                          }
                          
                          // Check memory requirements
                          for (const memReq of (reaction.memoryRequirements || [])) {
                            const count = getMemoryCount(memReq, worldMemory);
                            if (count === 0) {
                              return false;
                            }
                          }
                          
                          // Check NOT memory requirements
                          for (const notMemReq of (reaction.memoryNotRequirements || [])) {
                            const count = getMemoryCount(notMemReq, worldMemory);
                            if (count > 0) {
                              return false;
                            }
                          }
                          
                          // Check comparison requirements for items
                          for (const comparison of (reaction.comparisons || [])) {
                            const itemCount = getInventoryCount(comparison.itemId, inventory);
                            if (comparison.operator === '<') {
                              if (!(itemCount < comparison.value)) {
                                return false;
                              }
                            } else if (comparison.operator === '>') {
                              if (!(itemCount > comparison.value)) {
                                return false;
                              }
                            }
                          }
                          
                          // Check comparison requirements for memory
                          for (const comparison of (reaction.memoryComparisons || [])) {
                            const memCount = getMemoryCount(comparison.itemId, worldMemory);
                            if (comparison.operator === '<') {
                              if (!(memCount < comparison.value)) {
                                return false;
                              }
                            } else if (comparison.operator === '>') {
                              if (!(memCount > comparison.value)) {
                                return false;
                              }
                            }
                          }
                          
                          return true;
                        });
                        
                        // Consider it as having a reaction if there are valid reactions, or use all as fallback
                        characterHasReaction = validReactions.length > 0 || reactions.length > 0;
                      }
                    }
                  }
                  
                  // Item is disabled if:
                  // 1. We're in destinations panel
                  // 2. Character already reacted and can advance
                  // 3. We're greeting but character hasn't loaded yet
                  // 4. Current character exists and has no reaction for this item
                  // 5. Telegraph sync in progress
                  const isDisabled = middlePanel === 'destinations' 
                    || (!isGreeting && canAdvance)
                    || (isGreeting && !currentCharacter)
                    || (currentCharacter && !characterHasReaction)
                    || isTelegraphSyncing;
                  
                  return (
                    <DraggableItem
                      key={itemId}
                      itemId={itemId}
                      emoji={item.emoji}
                      image={item.image}
                      name={item.name}
                      count={inventoryItem.count}
                      disabled={isDisabled}
                      onItemClick={handleItemGiven}
                      textColor={textColor}
                      labelFont={labelFont}
                      labelFontSize={labelFontSize}
                      labelFontStyle={labelFontStyle}
                    />
                  );
                });
              })()}
            </div>
          </div>
        </div>
        </div>
      </div>

      {/* Telegraph Creation Dialog */}
      {showTelegraphDialog && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setShowTelegraphDialog(false)}
        >
          <div 
            className="bg-black border border-[#eaeaea] rounded-lg p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-xl mb-4" style={{ fontFamily: 'IM Fell English, serif', color: '#eaeaea' }}>
              Neues Telegraph-Dokument erstellen
            </h2>
            <input
              type="text"
              value={telegraphDialogName}
              onChange={(e) => setTelegraphDialogName(e.target.value)}
              placeholder="Dokumentenname"
              className="w-full bg-[#1a1a1a] border border-[#333] rounded px-3 py-2 mb-4 text-[#eaeaea]"
              style={{ fontFamily: 'IM Fell English, serif' }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleCreateTelegraphDocument();
                }
              }}
            />
            {telegraphDialogMessage && (
              <div 
                className="mb-4 p-3 bg-[#1a1a1a] border border-[#333] rounded whitespace-pre-wrap select-text cursor-text"
                style={{ fontFamily: 'IM Fell English, serif', color: '#eaeaea', fontSize: '0.9em', userSelect: 'text' }}
              >
                {telegraphDialogMessage}
              </div>
            )}
            <div className="flex gap-2">
              {telegraphDialogCreated ? (
                <button
                  onClick={async () => {
                    const success = await copyToClipboard(telegraphDialogCopyText);
                    if (success) {
                      setTelegraphDialogMessage('In Zwischenablage kopiert!');
                    } else {
                      setTelegraphDialogMessage('Fehler beim Kopieren. Bitte manuell kopieren.');
                    }
                  }}
                  className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#444] rounded px-4 py-2 transition-colors"
                  style={{ fontFamily: 'IM Fell English, serif', color: '#eaeaea' }}
                >
                  Kopieren
                </button>
              ) : (
                <button
                  onClick={handleCreateTelegraphDocument}
                  className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#444] rounded px-4 py-2 transition-colors"
                  style={{ fontFamily: 'IM Fell English, serif', color: '#eaeaea' }}
                >
                  Erstellen
                </button>
              )}
              <button
                onClick={() => setShowTelegraphDialog(false)}
                className="flex-1 bg-[#2a2a2a] hover:bg-[#3a3a3a] border border-[#444] rounded px-4 py-2 transition-colors"
                style={{ fontFamily: 'IM Fell English, serif', color: '#eaeaea' }}
              >
                Schließen
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default function App() {
  return (
    <DndProvider backend={HTML5Backend}>
      <Game />
    </DndProvider>
  );
}