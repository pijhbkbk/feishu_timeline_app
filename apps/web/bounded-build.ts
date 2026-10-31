import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import path from 'node:path';

type Environment = Readonly<Record<string, string | undefined>>;
type SharedBuild = { tracingRoot: string; uiRoot: string; receiptDirectory: string };

function canonicalDirectory(value: string) {
  if (!path.isAbsolute(value) || path.normalize(value) !== value || realpathSync(value) !== value || !lstatSync(value).isDirectory()) {
    throw new Error('Bounded build paths must be canonical absolute directories.');
  }
  return value;
}

function inside(parent: string, child: string) {
  const relative = path.relative(parent, child);
  return relative !== '' && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

/** Opt-in compiler input layout only. The invoking build must separately pin
 * its exact source/dependency closure, budget and output inventory. */
export function sharedDependencyBuild(workspaceRoot: string, environment: Environment): SharedBuild | null {
  const root = environment.TIMELINE_BUILD_TRACING_ROOT;
  const ui = environment.TIMELINE_BUILD_UI_ROOT;
  const receipts = environment.TIMELINE_BUILD_RECEIPTS;
  if (root === undefined && ui === undefined && receipts === undefined) return null;
  if (!root || !ui || !receipts || environment.NODE_ENV !== 'production' || environment.CI !== '1' || environment.TIMELINE_BUILD_CACHE !== 'disabled') {
    throw new Error('Shared dependency builds require production, CI, disabled disk cache and all three paths.');
  }
  const source = canonicalDirectory(workspaceRoot);
  const tracingRoot = canonicalDirectory(root);
  const uiRoot = canonicalDirectory(ui);
  const receiptDirectory = canonicalDirectory(receipts);
  if (tracingRoot === path.parse(tracingRoot).root || !inside(tracingRoot, source)
      || !inside(source, uiRoot) || !uiRoot.endsWith(`${path.sep}node_modules${path.sep}@univerjs${path.sep}ui`)
      || !inside(path.dirname(source), receiptDirectory) || receiptDirectory === source || inside(source, receiptDirectory)) {
    throw new Error('Shared dependency build paths escape their source or exclusive output.');
  }
  return { tracingRoot, uiRoot, receiptDirectory };
}

type ModuleResource = { resource?: string };
type Compiler = {
  name?: string;
  hooks: { thisCompilation: { tap(name: string, callback: (compilation: {
    errors: Error[];
    hooks: { finishModules: { tap(name: string, callback: (modules: Iterable<ModuleResource>) => void): void } };
  }) => void): void } };
};

/** Proves which physical UI input each production compiler consumed. It rejects
 * any old/shared UI copy instead of silently accepting mixed patched inputs. */
export class BoundedUiInputPlugin {
  constructor(private readonly build: SharedBuild) {}
  apply(compiler: Compiler) {
    compiler.hooks.thisCompilation.tap('BoundedUiInputPlugin', compilation => {
      // Webpack assigns compiler.name after plugin.apply, before compilation.
      const name = compiler.name;
      if (!name || !['client', 'server', 'edge-server'].includes(name)) throw new Error('Unexpected bounded build compiler.');
      compilation.hooks.finishModules.tap('BoundedUiInputPlugin', modules => {
        const files = new Map<string, string>();
        try {
          for (const module of modules) {
            const resource = module.resource?.split(/[?#]/)[0];
            if (!resource?.includes(`${path.sep}node_modules${path.sep}@univerjs${path.sep}ui${path.sep}`)) continue;
            const actual = realpathSync(resource);
            if (!inside(this.build.uiRoot, actual) || !lstatSync(actual).isFile()) throw new Error('Unexpected UI input outside the patched package.');
            if (lstatSync(actual).size > 16 * 1024 * 1024 || files.size >= 512 && !files.has(actual)) throw new Error('UI input receipt exceeds its bound.');
            files.set(actual, createHash('sha256').update(readFileSync(actual)).digest('hex'));
          }
          writeFileSync(path.join(this.build.receiptDirectory, `${name}.json`), `${JSON.stringify({
            compiler: name, uiRoot: this.build.uiRoot,
            files: [...files].sort(([a], [b]) => a.localeCompare(b)).map(([file, sha256]) => ({ file, sha256 })),
          }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        } catch (error) {
          compilation.errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      });
    });
  }
}
