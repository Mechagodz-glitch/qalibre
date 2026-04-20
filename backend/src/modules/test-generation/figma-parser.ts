import { env } from '../../config/env.js';

type FigmaUrlContext = {
  fileKey: string;
  nodeId: string | null;
  url: string;
};

type FigmaNode = {
  id?: string;
  name?: string;
  type?: string;
  visible?: boolean;
  characters?: string;
  children?: FigmaNode[];
};

type ParsedFigmaSource = {
  parseStatus: 'parsed' | 'reference-only';
  contentText: string;
  imageDataUrl?: string;
  mimeType?: string;
};

const figmaNodeTypesForOutline = new Set(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE', 'SECTION', 'COMPONENT_SET']);
const figmaPatternMatchers = [
  { pattern: /button|cta|action/i, label: 'button or call to action' },
  { pattern: /input|field|form|textarea/i, label: 'form input' },
  { pattern: /search/i, label: 'search control' },
  { pattern: /filter|dropdown|select/i, label: 'filter or select control' },
  { pattern: /table|grid|list/i, label: 'table or list' },
  { pattern: /tab/i, label: 'tabbed navigation' },
  { pattern: /card/i, label: 'content card' },
  { pattern: /chart|graph/i, label: 'chart or visualization' },
  { pattern: /modal|dialog|drawer/i, label: 'modal or drawer' },
  { pattern: /nav|menu|sidebar|header|footer/i, label: 'navigation region' },
];

function normalizeWhitespace(value: string, maxLength = 180) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength);
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function parseFigmaUrl(url: string): FigmaUrlContext | null {
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('figma.com')) {
      return null;
    }

    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length < 2) {
      return null;
    }

    const fileKey = parts[1];
    if (!fileKey) {
      return null;
    }
    const rawNodeId = parsed.searchParams.get('node-id') ?? parsed.searchParams.get('starting-point-node-id');
    const normalizedNodeId = rawNodeId ? decodeURIComponent(rawNodeId).replace(/-/g, ':') : null;

    return {
      fileKey,
      nodeId: normalizedNodeId,
      url,
    };
  } catch {
    return null;
  }
}

function countNodeTypes(root: FigmaNode) {
  const counts = new Map<string, number>();
  const queue: FigmaNode[] = [root];

  while (queue.length) {
    const node = queue.shift()!;
    const type = node.type ?? 'UNKNOWN';
    counts.set(type, (counts.get(type) ?? 0) + 1);
    for (const child of node.children ?? []) {
      queue.push(child);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([type, count]) => `${type}: ${count}`);
}

function collectVisibleText(root: FigmaNode) {
  const texts: string[] = [];
  const queue: FigmaNode[] = [root];

  while (queue.length) {
    const node = queue.shift()!;
    if (node.visible === false) {
      continue;
    }

    if (node.type === 'TEXT' && node.characters) {
      texts.push(node.characters);
    }

    for (const child of node.children ?? []) {
      queue.push(child);
    }
  }

  return dedupe(texts).slice(0, 18);
}

function collectOutline(root: FigmaNode) {
  const outline: string[] = [];

  for (const child of root.children ?? []) {
    if (child.visible === false) {
      continue;
    }

    const type = child.type ?? 'UNKNOWN';
    const name = normalizeWhitespace(child.name ?? '');
    if (figmaNodeTypesForOutline.has(type) || name) {
      outline.push(`${name || 'Unnamed'} [${type}]`);
    }
  }

  return dedupe(outline).slice(0, 12);
}

function inferUiPatterns(root: FigmaNode) {
  const matches: string[] = [];
  const queue: FigmaNode[] = [root];

  while (queue.length) {
    const node = queue.shift()!;
    const name = normalizeWhitespace(node.name ?? '');

    for (const matcher of figmaPatternMatchers) {
      if (matcher.pattern.test(name)) {
        matches.push(`${matcher.label}: ${name}`);
      }
    }

    for (const child of node.children ?? []) {
      queue.push(child);
    }
  }

  return dedupe(matches).slice(0, 12);
}

function buildFigmaContentSummary(input: {
  fileName: string;
  nodeId: string | null;
  rootNode: FigmaNode;
  sourceUrl: string;
}) {
  const rootName = normalizeWhitespace(input.rootNode.name ?? input.fileName);
  const rootType = input.rootNode.type ?? 'UNKNOWN';
  const outline = collectOutline(input.rootNode);
  const visibleText = collectVisibleText(input.rootNode);
  const nodeTypes = countNodeTypes(input.rootNode);
  const inferredPatterns = inferUiPatterns(input.rootNode);

  return [
    `Figma file: ${input.fileName}`,
    `Source URL: ${input.sourceUrl}`,
    `Focused node: ${rootName} [${rootType}]${input.nodeId ? ` (${input.nodeId})` : ''}`,
    outline.length ? `Primary visible sections:\n- ${outline.join('\n- ')}` : null,
    visibleText.length ? `Visible text labels:\n- ${visibleText.join('\n- ')}` : null,
    inferredPatterns.length ? `Likely UI patterns inferred from layer names:\n- ${inferredPatterns.join('\n- ')}` : null,
    nodeTypes.length ? `Node type mix:\n- ${nodeTypes.join('\n- ')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');
}

async function fetchJson<T>(url: string) {
  const response = await fetch(url, {
    headers: {
      'X-Figma-Token': env.FIGMA_ACCESS_TOKEN!,
    },
  });

  if (!response.ok) {
    throw new Error(`Figma request failed with ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

async function fetchImageDataUrl(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    return undefined;
  }

  const mimeType = response.headers.get('content-type') ?? 'image/png';
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.byteLength > 4_500_000) {
    return undefined;
  }

  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}

async function fetchFigmaNode(context: FigmaUrlContext) {
  if (context.nodeId) {
    const result = await fetchJson<{
      name?: string;
      nodes?: Record<string, { document?: FigmaNode } | undefined>;
    }>(
      `${env.FIGMA_API_BASE_URL}/v1/files/${context.fileKey}/nodes?ids=${encodeURIComponent(context.nodeId)}&depth=${env.FIGMA_NODE_DEPTH}`,
    );

    const rootNode = result.nodes?.[context.nodeId]?.document;
    if (!rootNode) {
      throw new Error('Requested Figma node could not be resolved.');
    }

    return {
      fileName: normalizeWhitespace(result.name ?? 'Untitled Figma file'),
      rootNode,
    };
  }

  const result = await fetchJson<{
    name?: string;
    document?: FigmaNode;
  }>(`${env.FIGMA_API_BASE_URL}/v1/files/${context.fileKey}?depth=${env.FIGMA_NODE_DEPTH}`);

  if (!result.document) {
    throw new Error('Figma file content could not be resolved.');
  }

  return {
    fileName: normalizeWhitespace(result.name ?? 'Untitled Figma file'),
    rootNode: result.document,
  };
}

async function fetchFigmaRenderedImage(context: FigmaUrlContext) {
  if (!context.nodeId) {
    return undefined;
  }

  const result = await fetchJson<{
    images?: Record<string, string | null>;
  }>(
    `${env.FIGMA_API_BASE_URL}/v1/images/${context.fileKey}?ids=${encodeURIComponent(context.nodeId)}&format=png&scale=${env.FIGMA_IMAGE_SCALE}`,
  );

  const imageUrl = result.images?.[context.nodeId];
  if (!imageUrl) {
    return undefined;
  }

  return fetchImageDataUrl(imageUrl);
}

export function isFigmaUrl(url?: string) {
  return Boolean(url && parseFigmaUrl(url));
}

export async function parseFigmaSource(url: string): Promise<ParsedFigmaSource> {
  const context = parseFigmaUrl(url);
  if (!context || !env.FIGMA_ACCESS_TOKEN) {
    return {
      parseStatus: 'reference-only',
      contentText: '',
    };
  }

  const { fileName, rootNode } = await fetchFigmaNode(context);
  const [contentText, imageDataUrl] = await Promise.all([
    Promise.resolve(
      buildFigmaContentSummary({
        fileName,
        nodeId: context.nodeId,
        rootNode,
        sourceUrl: url,
      }),
    ),
    fetchFigmaRenderedImage(context),
  ]);

  return {
    parseStatus: contentText || imageDataUrl ? 'parsed' : 'reference-only',
    contentText,
    imageDataUrl,
    mimeType: imageDataUrl ? 'image/png' : undefined,
  };
}
