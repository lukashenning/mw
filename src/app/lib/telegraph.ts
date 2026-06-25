// Telegraph API Integration for World Memory Persistence

const TELEGRAPH_API = 'https://api.telegra.ph';
const CORS_PROXY = 'https://corsproxy.io/?';

export interface TelegraphDocument {
  path: string;
  url: string;
  access_token?: string;
  lastModified: number;
  title: string;
}

export interface TelegraphNode {
  tag?: string;
  children?: (string | TelegraphNode)[];
  attrs?: Record<string, string>;
}

// LocalStorage keys
const STORAGE_KEY_DOCUMENTS = 'telegraph_documents';
const STORAGE_KEY_CURRENT = 'current_telegraph_path';

/**
 * Get all stored Telegraph documents from localStorage
 */
export function getSavedDocuments(): TelegraphDocument[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY_DOCUMENTS);
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error('Failed to load Telegraph documents:', error);
    return [];
  }
}

/**
 * Save a Telegraph document to localStorage
 */
export function saveDocument(doc: TelegraphDocument): void {
  try {
    const documents = getSavedDocuments();
    const existingIndex = documents.findIndex(d => d.path === doc.path);
    
    if (existingIndex >= 0) {
      documents[existingIndex] = doc;
    } else {
      documents.push(doc);
    }
    
    localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(documents));
  } catch (error) {
    console.error('Failed to save Telegraph document:', error);
  }
}

/**
 * Get the currently active Telegraph document path
 */
export function getCurrentDocumentPath(): string | null {
  return localStorage.getItem(STORAGE_KEY_CURRENT);
}

/**
 * Set the currently active Telegraph document path
 */
export function setCurrentDocumentPath(path: string | null): void {
  if (path) {
    localStorage.setItem(STORAGE_KEY_CURRENT, path);
  } else {
    localStorage.removeItem(STORAGE_KEY_CURRENT);
  }
}

/**
 * Find a saved document by path
 */
export function findDocumentByPath(path: string): TelegraphDocument | null {
  const documents = getSavedDocuments();
  return documents.find(d => d.path === path) || null;
}

/**
 * Convert text to Telegraph content format (array of paragraph nodes)
 */
export function textToTelegraphContent(text: string): TelegraphNode[] {
  const lines = text.split('\n');
  const nodes: TelegraphNode[] = [];
  
  for (const line of lines) {
    if (line.trim()) {
      nodes.push({
        tag: 'p',
        children: [line]
      });
    }
  }
  
  // If no nodes but text exists (e.g., "EMPTY_MEMORY"), keep it
  if (nodes.length === 0 && text.trim()) {
    nodes.push({
      tag: 'p',
      children: [text.trim()]
    });
  }
  
  // If completely empty, add placeholder
  if (nodes.length === 0) {
    nodes.push({
      tag: 'p',
      children: ['—']
    });
  }
  
  return nodes;
}

/**
 * Convert Telegraph content nodes to plain text
 */
export function telegraphContentToText(content: TelegraphNode[]): string {
  const lines: string[] = [];
  
  function extractText(node: TelegraphNode | string): string {
    if (typeof node === 'string') {
      return node;
    }
    
    if (node.children) {
      return node.children.map(extractText).join('');
    }
    
    return '';
  }
  
  for (const node of content) {
    const text = extractText(node);
    if (text) {
      lines.push(text);
    }
  }
  
  return lines.join('\n');
}

/**
 * Create a new Telegraph account
 * Returns access_token for future edits
 */
async function createAccount(): Promise<string> {
  const url = `${CORS_PROXY}${encodeURIComponent(TELEGRAPH_API + '/createAccount')}`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      short_name: 'Game Memory',
      author_name: 'Adventure Game'
    })
  });
  
  if (!response.ok) {
    throw new Error(`Failed to create Telegraph account: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.ok) {
    throw new Error('Telegraph API returned error: ' + JSON.stringify(data));
  }
  
  return data.result.access_token;
}

/**
 * Create a new Telegraph page with content
 */
export async function createPage(title: string, content: string): Promise<TelegraphDocument> {
  try {
    // Step 1: Create account
    const accessToken = await createAccount();
    
    // Step 2: Create page
    const contentNodes = textToTelegraphContent(content);
    
    const url = `${CORS_PROXY}${encodeURIComponent(TELEGRAPH_API + '/createPage')}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
        title: title,
        content: contentNodes,
        return_content: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to create Telegraph page: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error('Telegraph API returned error: ' + JSON.stringify(data));
    }
    
    const doc: TelegraphDocument = {
      path: data.result.path,
      url: data.result.url,
      access_token: accessToken,
      lastModified: Date.now(),
      title: title
    };
    
    // Save to localStorage
    saveDocument(doc);
    setCurrentDocumentPath(doc.path);
    
    return doc;
  } catch (error) {
    console.error('Failed to create Telegraph page:', error);
    throw error;
  }
}

/**
 * Load a Telegraph page by path
 */
export async function getPage(path: string): Promise<{ title: string; content: string }> {
  try {
    // Telegraph API supports CORS, so try direct access first
    const url = `${TELEGRAPH_API}/getPage/${path}?return_content=true`;
    
    const response = await fetch(url, {
      method: 'GET',
    });
    
    if (!response.ok) {
      throw new Error(`Failed to load Telegraph page: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error('Telegraph API returned error: ' + JSON.stringify(data));
    }
    
    const title = data.result.title;
    const content = telegraphContentToText(data.result.content);
    
    return { title, content };
  } catch (error) {
    console.error('Failed to load Telegraph page:', error);
    throw error;
  }
}

/**
 * Edit an existing Telegraph page (requires access_token)
 */
export async function editPage(path: string, accessToken: string, title: string, content: string): Promise<void> {
  try {
    const contentNodes = textToTelegraphContent(content);
    
    const url = `${CORS_PROXY}${encodeURIComponent(TELEGRAPH_API + '/editPage/' + path)}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        access_token: accessToken,
        title: title,
        content: contentNodes,
        return_content: true
      })
    });
    
    if (!response.ok) {
      throw new Error(`Failed to edit Telegraph page: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.ok) {
      throw new Error('Telegraph API returned error: ' + JSON.stringify(data));
    }
    
    // Update lastModified in localStorage
    const doc = findDocumentByPath(path);
    if (doc) {
      doc.lastModified = Date.now();
      doc.title = title;
      saveDocument(doc);
    }
  } catch (error) {
    console.error('Failed to edit Telegraph page:', error);
    throw error;
  }
}

/**
 * Check if a document is editable (has access token)
 */
export function isDocumentEditable(path: string): boolean {
  const doc = findDocumentByPath(path);
  return doc !== null && doc.access_token !== undefined;
}

/**
 * Delete a document from localStorage (does NOT delete from Telegraph)
 */
export function deleteLocalDocument(path: string): void {
  try {
    const documents = getSavedDocuments();
    const filtered = documents.filter(d => d.path !== path);
    localStorage.setItem(STORAGE_KEY_DOCUMENTS, JSON.stringify(filtered));
    
    // If this was the current document, clear current
    if (getCurrentDocumentPath() === path) {
      setCurrentDocumentPath(null);
    }
  } catch (error) {
    console.error('Failed to delete local Telegraph document:', error);
  }
}

/**
 * Convert world memory object to text format for Telegraph
 */
export function worldMemoryToText(worldMemory: {[memoryId: string]: number}): string {
  const entries: string[] = [];
  
  for (const [memoryId, count] of Object.entries(worldMemory)) {
    for (let i = 0; i < count; i++) {
      entries.push(memoryId);
    }
  }
  
  return entries.join(', ');
}

/**
 * Parse text from Telegraph back to world memory object
 */
export function textToWorldMemory(text: string): {[memoryId: string]: number} {
  const worldMemory: {[memoryId: string]: number} = {};
  
  if (!text.trim()) {
    return worldMemory;
  }
  
  const entries = text.split(',').map(s => s.trim().toLowerCase()).filter(s => s);
  
  for (const memoryId of entries) {
    worldMemory[memoryId] = (worldMemory[memoryId] || 0) + 1;
  }
  
  return worldMemory;
}