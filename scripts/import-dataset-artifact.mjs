#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const supportedItemTypes = new Set([
  'componentCatalogue',
  'rulePack',
  'featureType',
  'testTaxonomy',
  'scenarioTemplate',
  'priorityMapping',
  'severityMapping',
  'synonymAlias',
]);

function stableSort(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => stableSort(entry));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entryValue]) => [key, stableSort(entryValue)]),
    );
  }

  return value;
}

function usage() {
  console.error(
    'Usage: node scripts/import-dataset-artifact.mjs <itemType> <filePath> [apiBaseUrl] [--dry-run]',
  );
  process.exit(1);
}

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const positionalArgs = args.filter((value) => value !== '--dry-run');
const [itemType, filePathArg, apiBaseUrlArg] = positionalArgs;

if (!itemType || !filePathArg || !supportedItemTypes.has(itemType)) {
  usage();
}

const apiBaseUrl = (apiBaseUrlArg ?? 'http://localhost:3000/api').replace(/\/+$/, '');
const filePath = path.resolve(process.cwd(), filePathArg);
const jsonText = await readFile(filePath, 'utf8');
const payload = JSON.parse(jsonText);

if (!Array.isArray(payload)) {
  throw new Error(`Expected a JSON array in ${filePath}`);
}

const response = await fetch(`${apiBaseUrl}/import/datasets/${itemType}`, {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    jsonText: JSON.stringify(stableSort(payload), null, 2),
    dryRun,
  }),
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(errorText);
  process.exit(1);
}

const result = await response.json();
console.log(JSON.stringify(result.summary, null, 2));
