/**
 * Load plugins - importing triggers registerApp() in each package
 */
import pc from 'picocolors'

const PLUGIN_COLORS: Record<string, (str: string) => string> = {
    expressio: pc.cyan,
    nonlinear: pc.green,
    pyrite: pc.magenta,
}

export function getPluginColor(pluginId: string): (str: string) => string {
    return PLUGIN_COLORS[pluginId] ?? pc.white
}

export async function loadPlugins(): Promise<void> {
    await import('@garage44/expressio/codebrew')
    await import('@garage44/nonlinear/codebrew')
    await import('@garage44/pyrite/codebrew')
}
