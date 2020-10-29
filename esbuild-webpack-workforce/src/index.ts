import { build, Metadata } from 'esbuild'
import AddAssetHtmlPlugin from 'add-asset-html-webpack-plugin'
import path from 'path'
import fs from 'fs'
import { Compiler, Resolve, Configuration } from 'webpack'
import { traverseWithEsbuild } from './traverseEsbuild'
import slash from 'slash'
import { invert } from 'lodash'
import { isRelative } from './support'

import resolve from 'resolve'

// get entries form webpack, use these as entrypoints for the esbuild imports analyzer, find all the dependencies imported files
// in the webpack externals function resolve every path (if not relative) and check if esbuild has a bundle for that path, if yes then replace it with the associated global object
// TODO how to use the webpack logic for resolution?
export async function esbuildWorkforce({
    config,
    auto,
    packages,
}: {
    config: Configuration
    auto?: boolean
    packages?: string[]
}) {
    // TODO this will duplicate dependencies, i have to compile all dependencies or it will not work
    let entryPoints: string[] = packages || [] // TODO resolve packages to absolute path or maybe keep them as is and check only against request, this way i could have version mismatches

    if (auto) {
        let entries = Array.isArray(config.entry)
            ? config.entry
            : typeof config.entry === 'string'
            ? [config.entry]
            : Object.values(config.entry)
        entries = entries.map((x) => path.resolve(x)) // TODO resolve from the webpack root?
        const res = await traverseWithEsbuild({
            // TODO only get the node_modules stuff, stop traversing at non relative and non node_modules
            entryPoints: entries,
        })

        entryPoints = res.map((x) => x.resolvedImportPath)
    }

    const { mapEntryToBundle, mapEntryToName } = await bundle({
        destLoc: './bundled',
        entryPoints,
    })

    config.plugins.push(
        new AddAssetHtmlPlugin(
            Object.values(mapEntryToBundle).map((filepath) => {
                return {
                    filepath,
                    typeOfAsset: 'js',
                    attributes: {
                        type: 'module',
                    },
                    // files can add asset only to certain files
                }
            }),
        ),
    )

    const externals = (context, request, cb) => {
        // console.log({ context, request });
        if (isRelative(request)) {
            return cb(null)
        }
        // TODO use webpack to resolve stuff
        const resolved = resolve.sync(request, {
            basedir: context,
        })
        if (mapEntryToName[resolved]) {
            const name = mapEntryToName[resolved]
            return cb(null, name)
        }
        cb(null)
    }

    return {
        externals, // TODO augment externals instead of replacing
        ...config,
    }
}

// returns a map from entry to output
async function bundle({ entryPoints, minify = false, destLoc }) {
    const metafile = path.join(destLoc, './meta.json')
    // TODO for every entry create a unique global name here
    const mapEntryToName = {}
    await build({
        splitting: true, // needed to dedupe modules
        // external: externalPackages,
        minifyIdentifiers: Boolean(minify),
        minifySyntax: Boolean(minify),
        // loader: {
        //     js: 'jsx',
        // },
        minifyWhitespace: Boolean(minify),
        mainFields: ['browser:module', 'module', 'browser', 'main'].filter(
            Boolean,
        ),
        // sourcemap: 'inline', // TODO sourcemaps panics and gives a lot of CPU load
        define: {
            'process.env.NODE_ENV': JSON.stringify('dev'),
            global: 'window',
            // ...generateEnvReplacements(env),
        },
        // TODO inject polyfills for runtime globals like process, ...etc
        // TODO allow importing from node builtins when using allowNodeImports
        // TODO add plugin for pnp resolution
        bundle: true,
        format: 'esm',
        write: true,
        entryPoints, // TODO replace entrypoints with virtual entries that inject stuff in window with specified name
        outdir: destLoc,
        minify: Boolean(minify),
        logLevel: 'info',
        metafile,
    })
    const meta = JSON.parse(
        await (await fs.promises.readFile(metafile)).toString(),
    )

    const mapEntryToBundle = metafileToImportMap({
        installEntrypoints: Object.assign(
            {},
            entryPoints.map((k) => ({ [k]: k })),
        ),
        meta,
        destLoc: destLoc,
    })
    return { mapEntryToBundle, mapEntryToName }
}

function metafileToImportMap(_options: {
    installEntrypoints: Record<string, string>
    meta: Metadata
    destLoc: string
}): Record<string, string> {
    const {
        destLoc: destLoc,
        installEntrypoints: installEntrypoints,
        meta,
    } = _options
    const inputFiles = Object.values(installEntrypoints).map((x) =>
        path.resolve(x),
    ) // TODO replace resolve with join in cwd
    const inputFilesToSpecifiers = invert(installEntrypoints)

    const importMaps: Record<string, string>[] = Object.keys(meta.outputs).map(
        (output) => {
            // chunks cannot be entrypoints
            if (path.basename(output).startsWith('chunk.')) {
                return {}
            }
            const inputs = Object.keys(meta.outputs[output].inputs).map((x) =>
                path.resolve(x),
            ) // TODO will this resolve work with pnp?
            const input = inputs.find((x) => inputFiles.includes(x))
            if (!input) {
                return {}
            }
            const specifier = inputFilesToSpecifiers[input]
            return {
                [specifier]: path.resolve(output),
                // './' + slash(path.normalize(path.relative(destLoc, output))),
            }
        },
    )
    const importMap = Object.assign({}, ...importMaps)
    return importMap
}
