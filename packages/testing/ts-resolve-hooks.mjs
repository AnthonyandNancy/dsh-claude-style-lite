/**
 * ts-resolve-hooks.mjs — resolve repository TypeScript from the Node test lane.
 *
 * The workspace packages expose `.ts` sources through their `exports` maps.
 * Node strips types natively, but refuses to do so under any `node_modules`;
 * this hook maps the workspace scope back into `packages/` and supplies the
 * `.ts` extension the TypeScript resolver adds for the browser bundle.
 */
import { fileURLToPath, pathToFileURL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const SCOPE = '@dsh-claude-style/'

/** The file a source path names, with the extension the TypeScript importer omits. */
function sourceFile(base) {
  const candidates = [base, `${base}.ts`, path.join(base, 'index.ts')]
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile())
}

export async function resolve(specifier, context, next) {
  if (specifier.startsWith(SCOPE)) {
    const [name, ...rest] = specifier.slice(SCOPE.length).split('/')
    const file = sourceFile(path.join(ROOT, 'packages', name, 'src', ...rest))
    if (file !== undefined) return { url: pathToFileURL(file).href, shortCircuit: true }
  }
  if (specifier.startsWith('.') && context.parentURL?.startsWith(pathToFileURL(ROOT).href)) {
    const file = sourceFile(path.resolve(path.dirname(fileURLToPath(context.parentURL)), specifier))
    if (file !== undefined && file.endsWith('.ts')) return { url: pathToFileURL(file).href, shortCircuit: true }
  }
  return next(specifier, context)
}
