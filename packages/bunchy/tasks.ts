import {broadcast, settings} from './index.ts'
import {Task} from './task.ts'
import fs from 'fs-extra'
import {$, Glob} from 'bun'
import path from 'node:path'
import template from 'lodash.template'
import {throttle} from '@garage44/common/lib/utils'
import {watch} from 'node:fs'
import {bundle} from 'lightningcss'
import type {MessageData} from '@garage44/common/lib/ws-server'

const debounce = {options: {trailing: true}, wait: 1000}

/**
 * Normalizes sourcemap paths to be relative to the public directory
 * @param map - The sourcemap buffer from Lightning CSS
 * @param sourceFileDir - The directory of the source entry file
 * @param publicDir - The public output directory
 * @returns Normalized sourcemap as a string
 */
function normalizeSourceMap(map: Uint8Array, sourceFileDir: string, publicDir: string): string {
    const sourceMapObj = JSON.parse(Buffer.from(map).toString())

    // Normalize source paths to be relative to public directory
    if (sourceMapObj.sources) {
        sourceMapObj.sources = sourceMapObj.sources.map((source: string): string => {
            /*
             * Source paths from Lightning CSS are relative to the input file or absolute without leading /
             * Resolve them to absolute paths first, then make relative to public dir
             */
            let absolutePath = ''
            if (path.isAbsolute(source)) {
                absolutePath = source
            } else if (source.startsWith('home/')) {
                // Missing leading slash
                absolutePath = '/' + source
            } else {
                // Relative path - resolve from the source file location
                absolutePath = path.resolve(sourceFileDir, source)
            }
            return path.relative(publicDir, absolutePath)
        })
    }

    return JSON.stringify(sourceMapObj, null, 2)
}

const runner = {
    assets: throttle(async(): Promise<void> => {
        const result = await tasks.assets.start()
        if (settings.reload_ignore.includes('/tasks/assets')) {
            return
        }
        broadcast('/tasks/assets', (result || {}) as MessageData, 'POST')
    }, debounce.wait, debounce.options),
    code_bunchy: throttle(async(): Promise<void> => {
        const result = await tasks.code_bunchy.start({minify: false, sourcemap: true})
        if (settings.reload_ignore.includes('/tasks/code_bunchy')) {
            return
        }
        if (result && typeof result === 'object' && 'filename' in result && 'size' in result) {
            broadcast('/tasks/code_bunchy', {
                filename: (result as {filename: string; size: number}).filename,
                publicPath: path.relative(settings.dir.workspace, settings.dir.public),
                size: (result as {filename: string; size: number}).size,
            }, 'POST')
        }
    }, debounce.wait, debounce.options),
    hmr: throttle(async(filePath: string): Promise<void> => {
        // Rebuild the frontend code
        await tasks.code_frontend.start({minify: false, sourcemap: true})
        if (settings.reload_ignore.includes('/tasks/hmr')) {
            return
        }
        // Broadcast HMR update with workspace-relative file path
        const workspaceRelativePath = `src/${filePath}`
        broadcast('/tasks/hmr', {
            filePath: workspaceRelativePath,
            timestamp: Date.now(),
        }, 'POST')
    }, debounce.wait, debounce.options),
    html: throttle(async(): Promise<void> => {
        const result = await tasks.html.start({minify: false})
        if (settings.reload_ignore.includes('/tasks/html')) {
            return
        }
        if (result && typeof result === 'object' && 'filename' in result && 'size' in result) {
            broadcast('/tasks/html', {
                filename: (result as {filename: string; size: number}).filename,
                publicPath: path.relative(settings.dir.workspace, settings.dir.public),
                size: (result as {filename: string; size: number}).size,
            }, 'POST')
        }
    }, debounce.wait, debounce.options),
    styles: {
        app: throttle(async(): Promise<void> => {
            const [appResult, componentsResult] = await Promise.all([
                tasks.stylesApp.start({minify: false, sourcemap: true}),
                tasks.stylesComponents.start({minify: false, sourcemap: true}),
            ])

            // Broadcast both messages since both stylesheets were rebuilt
            if (!settings.reload_ignore.includes('/tasks/styles/app') && appResult && typeof appResult === 'object' && 'filename' in appResult && 'size' in appResult) {
                broadcast('/tasks/styles/app', {
                    filename: (appResult as {filename: string; size: number}).filename,
                    publicPath: path.relative(settings.dir.workspace, settings.dir.public),
                    size: (appResult as {filename: string; size: number}).size,
                }, 'POST')
            }

            if (!settings.reload_ignore.includes('/tasks/styles/components') && componentsResult && typeof componentsResult === 'object' && 'filename' in componentsResult && 'size' in componentsResult) {
                broadcast('/tasks/styles/components', {
                    filename: (componentsResult as {filename: string; size: number}).filename,
                    publicPath: path.relative(settings.dir.workspace, settings.dir.public),
                    size: (componentsResult as {filename: string; size: number}).size,
                }, 'POST')
            }
        }, debounce.wait, debounce.options),
        components: throttle(async(): Promise<void> => {
            const result = await tasks.stylesComponents.start({minify: false, sourcemap: true})
            if (settings.reload_ignore.includes('/tasks/styles/components')) {
                return
            }
            if (result && typeof result === 'object' && 'filename' in result && 'size' in result) {
                broadcast('/tasks/styles/components', {
                    filename: (result as {filename: string; size: number}).filename,
                    publicPath: path.relative(settings.dir.workspace, settings.dir.public),
                    size: (result as {filename: string; size: number}).size,
                }, 'POST')
            }
        }, debounce.wait, debounce.options),
    },
}

// Add this interface before the tasks declaration
interface Tasks {
    [key: string]: Task
    assets: Task
    build: Task
    clean: Task
    code_bunchy: Task
    code_frontend: Task
    dev: Task
    html: Task
    styles: Task
    stylesApp: Task
    stylesComponents: Task
}

// Update the tasks declaration
const tasks: Tasks = {} as Tasks


tasks.assets = new Task('assets', async function taskAssets(): Promise<void> {
    await fs.ensureDir(path.join(settings.dir.public, 'fonts'))
    await fs.ensureDir(path.join(settings.dir.public, 'img'))

    const copyOperations = [
        // Copy fonts from common package (shared across all projects)
        {
            from: path.join(settings.dir.common, 'fonts'),
            to: path.join(settings.dir.public, 'fonts'),
        },
        // Copy images from common package (shared placeholder avatars)
        {
            from: path.join(settings.dir.common, 'assets', 'img'),
            to: path.join(settings.dir.public, 'img'),
        },
        // Copy local assets if they exist (app-specific images)
        {
            from: path.join(settings.dir.assets, 'img'),
            to: path.join(settings.dir.public, 'img'),
        },
    ]

    // Handle separate assets config if provided (e.g., service worker files)
    if (settings.separateAssets) {
        for (const assetFile of settings.separateAssets) {
            copyOperations.push({
                from: path.join(settings.dir.assets, assetFile),
                to: path.join(settings.dir.public, assetFile),
            })
        }
    }

    // Execute copy operations, skipping if source doesn't exist
    await Promise.all(copyOperations.map(async(operation): Promise<void> => {
        try {
            await fs.copy(operation.from, operation.to)
        } catch(error) {
            // Skip if source directory doesn't exist
            const errorCode = (error as {code?: string}).code
            // eslint-disable-next-line no-console
            console.log('ERROR', error)
            if (errorCode !== 'ENOENT') {
                throw error
            }
        }
    }))
})


tasks.build = new Task('build', async function taskBuild({minify = false, sourcemap = false} = {}): Promise<void> {
    await tasks.clean.start()
    await Promise.all([
        tasks.assets.start(),
        tasks.html.start({minify}),
        tasks.code_frontend.start({minify, sourcemap}),
        tasks.code_bunchy.start({minify, sourcemap}),
        tasks.styles.start({minify, sourcemap}),
    ])
})


tasks.clean = new Task('clean', async function taskClean(): Promise<void> {
    await fs.rm(settings.dir.public, {force: true, recursive: true})
    await fs.mkdirp(settings.dir.public)
})


tasks.code_frontend = new Task('code:frontend', async function taskCodeFrontend({minify = false, sourcemap = false} = {}): Promise<{filename: string; size: number} | undefined> {
    try {
        // Get git commit hash
        let commitHash = process.env.APP_COMMIT_HASH || ''
        if (!commitHash) {
            try {
                const result = await $`git rev-parse --short HEAD`.cwd(settings.dir.workspace).quiet().nothrow()
                if (result.exitCode === 0) {
                    commitHash = result.stdout.toString().trim()
                }
            } catch {
                // If git command fails, leave empty
                commitHash = ''
            }
        }

        // Get version from package.json if not set via env
        let version = process.env.APP_VERSION || ''
        if (!version) {
            try {
                const packageJsonPath = path.join(settings.dir.workspace, 'package.json')
                const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'))
                version = packageJson.version || '0.0.0'
            } catch {
                version = '0.0.0'
            }
        }

        const result = await Bun.build({
            define: {
                'process.env.APP_COMMIT_HASH': `'${commitHash}'`,
                'process.env.APP_VERSION': `'${version}'`,
                'process.env.NODE_ENV': `'${process.env.NODE_ENV}'`,
            },
            entrypoints: ['src/app.ts'],
            format: 'esm',
            jsx: {
                factory: 'h',
                importSource: 'preact',
                runtime: 'classic',
            },
            minify: {
                identifiers: false,
                syntax: minify,
                whitespace: minify,
            },
            naming: `[dir]/[name].${settings.buildId}.[ext]`,
            outdir: settings.dir.public,
            sourcemap: process.env.NODE_ENV === 'production' ? 'none' : 'linked',
        })

        if (!result.success) {
            // Broadcast error to client
            broadcast('/tasks/error', {
                details: result.logs,
                error: 'Build failed',
                task: 'code:frontend',
                timestamp: new Date().toISOString(),
            }, 'POST')
            return
        }
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error(error)
        // Broadcast error to client
        broadcast('/tasks/error', {
            details: (error as Error).stack || String(error),
            error: (error as Error).message || 'Unknown build error',
            task: 'code:frontend',
            timestamp: new Date().toISOString(),
        }, 'POST')
        return
    }

    const filename = `app.${settings.buildId}.js`
    const fileContent = await fs.readFile(path.join(settings.dir.public, filename))
    return {
        filename,
        size: fileContent.length,
    }
})

tasks.code_bunchy = new Task('code:bunchy', async function taskCodeBunchy({minify = false, sourcemap = false} = {}): Promise<{filename: string; size: number} | undefined> {
    try {
        const nodeEnv = process.env.NODE_ENV || 'development'
        const result = await Bun.build({
            define: {
                'process.env.NODE_ENV': `'${nodeEnv}'`,
            },
            entrypoints: [path.join(settings.dir.bunchy, 'client.ts')],
            format: 'esm',
            minify: {
                identifiers: false,
                syntax: minify,
                whitespace: minify,
            },
            naming: `[name].${settings.buildId}.[ext]`,
            outdir: settings.dir.public,
            sourcemap: nodeEnv === 'production' ? 'none' : 'linked',
        })

        if (!result.success) {
            broadcast('/tasks/error', {
                details: result.logs,
                error: 'Build failed',
                task: 'code:bunchy',
                timestamp: new Date().toISOString(),
            }, 'POST')
            return
        }

        if (!result.outputs || result.outputs.length === 0) {
            broadcast('/tasks/error', {
                details: 'No output files generated',
                error: 'Build failed',
                task: 'code:bunchy',
                timestamp: new Date().toISOString(),
            }, 'POST')
            return
        }

        const output = result.outputs[0]
        const originalFilename = path.basename(output.path)
        const expectedFilename = `bunchy.${settings.buildId}.js`

        // Rename client.{buildId}.js to bunchy.{buildId}.js
        if (originalFilename !== expectedFilename) {
            const originalPath = path.join(settings.dir.public, originalFilename)
            const newPath = path.join(settings.dir.public, expectedFilename)
            await fs.move(originalPath, newPath, {overwrite: true})

            // Also handle sourcemap if it exists
            const originalSourceMap = originalFilename.replace('.js', '.js.map')
            const newSourceMap = expectedFilename.replace('.js', '.js.map')
            const originalSourceMapPath = path.join(settings.dir.public, originalSourceMap)
            const newSourceMapPath = path.join(settings.dir.public, newSourceMap)
            if (await fs.pathExists(originalSourceMapPath)) {
                await fs.move(originalSourceMapPath, newSourceMapPath, {overwrite: true})
            }
        }

        return {
            filename: expectedFilename,
            size: output.size,
        }
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error(error)
        broadcast('/tasks/error', {
            details: String(error),
            error: 'Build failed',
            task: 'code:bunchy',
            timestamp: new Date().toISOString(),
        }, 'POST')
        return
    }
})

tasks.dev = new Task('dev', async function taskDev({minify = false, sourcemap = true} = {}): Promise<void> {
    await tasks.clean.start()
    await Promise.all([
        tasks.assets.start(),
        tasks.html.start({minify}),
        tasks.code_frontend.start({minify, sourcemap}),
        tasks.code_bunchy.start({minify, sourcemap}),
        tasks.styles.start({minify, sourcemap}),
    ])

    watch(settings.dir.common, {recursive: true}, (_event: string, filename: string): void => {
        const extension = path.extname(filename)
        if (extension === '.ts' || extension === '.tsx') {
            /*
             * Use HMR for common package TypeScript/TSX files
             * Note: filename is relative to common dir, but HMR expects src/ prefix
             * We'll need to adjust the path or use a different approach
             */
            runner.hmr(filename)
        } else if (extension === '.css') {
            runner.styles.components()
        }
    })

    watch(settings.dir.src, {recursive: true}, (_event: string, filename: string): void => {
        const extension = path.extname(filename)

        if (filename.startsWith('assets/')) {
            runner.assets()
        } else if (extension === '.ts' || extension === '.tsx') {
            // Use HMR for all TypeScript/TSX files
            runner.hmr(filename)
        } else if (filename === 'index.html') {
            runner.html()
        } else if (extension === '.css') {
            // This is a temporary file for the components CSS, so we don't need to process it
            if (filename === 'components.css') {
                return
            }
            // Differentiate between app-level and component-level CSS files
            if (filename.startsWith('css/')) {
                // App-level styles (src/css/*.css)
                runner.styles.app()
            } else if (filename.startsWith('components/')) {
                // Component styles (src/components/**/*.css)
                runner.styles.components()
            } else {
                // Default to app for other CSS files
                runner.styles.app()
            }
        }
    })
})


tasks.html = new Task('html', async function taskHtml(): Promise<{filename: string; size: number}> {
    const indexFile = await fs.readFile(path.join(settings.dir.src, 'index.html'))
    const html = template(indexFile)({
        settings: {
            ...settings,
            enableBunchy: process.env.NODE_ENV !== 'production',
        },
    })
    const filename = 'index.html'
    await fs.writeFile(path.join(settings.dir.public, filename), html)
    return {filename, size: html.length}
})


tasks.styles = new Task('styles', async function taskStyles({minify = false, sourcemap = false} = {}): Promise<{size: number}> {
    const actions = [
        tasks.stylesApp.start({minify, sourcemap}) as Promise<{filename: string; size: number} | undefined>,
        tasks.stylesComponents.start({minify, sourcemap}) as Promise<{filename: string; size: number} | undefined>,
    ]

    const res = await Promise.all(actions)
    let totalSize = 0
    for (const result of res) {
        const resultSize = result?.size
        if (typeof resultSize === 'number') {
            totalSize += resultSize
        }
    }
    return {size: totalSize}
})


tasks.stylesApp = new Task('styles:app', async function taskStylesApp({minify, sourcemap}: {minify: boolean; sourcemap: boolean}): Promise<{filename: string; size: number} | undefined> {
    const filename = `app.${settings.buildId}.css`
    const appCssPath = path.join(settings.dir.src, 'css', 'app.css')

    try {
        const {code, map} = bundle({
            filename: appCssPath,
            minify,
            sourceMap: sourcemap,
        })

        let finalCSS = code.toString()
        if (map && sourcemap) {
            finalCSS += `\n/*# sourceMappingURL=${filename}.map */`
        }

        await fs.writeFile(path.join(settings.dir.public, filename), finalCSS)

        // Write source map if generated
        if (map && sourcemap) {
            const normalizedMap = normalizeSourceMap(map, path.dirname(appCssPath), settings.dir.public)
            await fs.writeFile(path.join(settings.dir.public, `${filename}.map`), normalizedMap)
        }

        return {filename, size: finalCSS.length}
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error(error)
        // Broadcast error to client
        broadcast('/tasks/error', {
            details: (error as Error).stack || String(error),
            error: (error as Error).message || 'CSS build failed',
            task: 'styles:app',
            timestamp: new Date().toISOString(),
        }, 'POST')
        return
    }
})


tasks.stylesComponents = new Task('styles:components', async function taskStylesComponents({minify, sourcemap}: {minify: boolean; sourcemap: boolean}): Promise<{filename: string; size: number} | undefined> {
    /*
     * Create a temporary components entry file that imports all component CSS files
     * Bun's Glob handles multiple patterns by creating separate instances
     */
    const glob1 = new Glob('**/*.css')
    const glob2 = new Glob('**/*.css')

    const imports1 = [...glob1.scanSync(settings.dir.common)].map((f: string): string => path.join(settings.dir.common, f))
    const imports2 = [...glob2.scanSync(settings.dir.components)].map((f: string): string => path.join(settings.dir.components, f))

    const allImports = [...imports1, ...imports2]

    // Create the components entry file content using absolute paths
    const componentImports = allImports.map((importFile: string): string => `@import "${importFile}";`)

    const entryContent = componentImports.join('\n')
    const entryFile = path.join(settings.dir.src, 'components.css')

    // Ensure the src directory exists
    await fs.ensureDir(path.dirname(entryFile))

    // Write the temporary entry file to src dir
    await fs.writeFile(entryFile, entryContent, 'utf8')
    const filename = `components.${settings.buildId}.css`

    try {
        // Use Lightning CSS bundle API for proper @import resolution
        const {code, map} = bundle({
            filename: entryFile,
            minify,
            sourceMap: sourcemap,
        })

        // Add sourceMappingURL comment to the CSS
        let finalCSS = code.toString()
        if (map && sourcemap) {
            finalCSS += `\n/*# sourceMappingURL=${filename}.map */`
        }

        // Write the bundled CSS
        await fs.writeFile(path.join(settings.dir.public, filename), finalCSS)

        // Write source map if generated
        if (map && sourcemap) {
            const normalizedMap = normalizeSourceMap(map, path.dirname(entryFile), settings.dir.public)
            await fs.writeFile(path.join(settings.dir.public, `${filename}.map`), normalizedMap)
        }

        // Clean up temporary entry file
        await fs.rm(entryFile, {force: true})

        return {
            filename,
            size: finalCSS.length,
        }
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error(error)
        // Broadcast error to client
        broadcast('/tasks/error', {
            details: (error as Error).stack || String(error),
            error: (error as Error).message || 'Component CSS build failed',
            task: 'styles:components',
            timestamp: new Date().toISOString(),
        }, 'POST')
        // Clean up temporary entry file on error
        await fs.rm(entryFile, {force: true})
        return
    }
})

export {tasks}
