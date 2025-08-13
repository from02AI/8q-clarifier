import fs from 'node:fs'; import path from 'node:path';

export function ensureDir(dir: string) {
  fs.mkdirSync(dir, { recursive: true });
}

export function saveJSON(dir: string, name: string, obj: any) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(obj, null, 2), 'utf-8');
}
