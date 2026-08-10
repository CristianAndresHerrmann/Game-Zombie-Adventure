import path from "node:path";
import { pathToFileURL } from "node:url";

const root = path.resolve(import.meta.dirname, "..");

// Resuelve el alias "@/..." de tsconfig y agrega la extensión .ts que el
// bundler infiere pero Node exige.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith("@/")) {
    const target = path.join(root, specifier.slice(2));
    const withExt = path.extname(target) ? target : `${target}.ts`;
    return nextResolve(pathToFileURL(withExt).href, context);
  }
  return nextResolve(specifier, context);
}
