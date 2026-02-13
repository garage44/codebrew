#!/usr/bin/env bun
import {type Browser, type Page, chromium} from 'playwright'
import {join} from 'node:path'
import {mkdir} from 'node:fs/promises'

interface ScreenshotConfig {
    actions?: (page: Page) => Promise<void>
    delay?: number
    name: string
    url: string
    waitForSelector?: string
}

const SCREENSHOTS: ScreenshotConfig[] = [
    {
        actions: async(page: Page): Promise<void> => {
            await page.goto('http://localhost:3030')
            await page.waitForSelector('.c-login')
            await page.fill('.c-field-text input[type="text"]', 'admin')
            await page.fill('.c-field-text input[type="password"]', 'admin')
        },
        name: 'screenshot-login.png',
        url: 'http://localhost:3030',
        waitForSelector: '.c-login',
    },
    {
        actions: async(page: Page): Promise<void> => {
            // Login first
            await page.goto('http://localhost:3030')
            await page.waitForSelector('.c-login')

            // Fill login form - use more specific selectors
            await page.fill('.c-field-text input[type="text"]', 'admin')
            await page.fill('.c-field-text input[type="password"]', 'admin')

            // Click the login button
            await page.click('.c-button')

            // Wait for login to complete
            await page.waitForSelector('.c-config')
        },
        name: 'screenshot-config.png',
        url: 'http://localhost:3030',
    },
    {
        actions: async(page: Page): Promise<void> => {
            // Login first
            await page.goto('http://localhost:3030')
            await page.waitForSelector('.c-login')

            // Fill login form - use more specific selectors
            await page.fill('.c-field-text input[type="text"]', 'admin')
            await page.fill('.c-field-text input[type="password"]', 'admin')

            // Click the login button
            await page.click('.c-button')

            // Wait for login to complete
            await page.goto('http://localhost:3030/workspaces/expressio/settings')
            await page.waitForSelector('.c-workspace-settings')
        },
        name: 'screenshot-workspace-config.png',
        url: 'http://localhost:3030',
    },
    {
        actions: async(page: Page): Promise<void> => {
            // Login first
            await page.goto('http://localhost:3030')
            await page.waitForSelector('.c-login')

            // Fill login form - use more specific selectors
            await page.fill('.c-field-text input[type="text"]', 'admin')
            await page.fill('.c-field-text input[type="password"]', 'admin')

            // Click the login button
            await page.click('.c-button')

            // Wait for login to complete
            await page.goto('http://localhost:3030/workspaces/expressio/translations')
            await page.waitForSelector('.c-translations')
            await page.click('.workspace-info .collapse-toggle', {modifiers: ['Control']})
            await page.waitForSelector('.c-translation-result')
        },
        name: 'screenshot-workspace.png',
        url: 'http://localhost:3030',
    },
]

async function waitForServer(maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i += 1) {
        try {
            // eslint-disable-next-line no-await-in-loop
            const response = await fetch('http://localhost:3030')
            if (response.ok || response.status === 404) {
                return true
            }
        } catch {
            // Server not ready yet
        }

        // eslint-disable-next-line no-console
        console.log(`Waiting for server... (${i + 1}/${maxAttempts})`)
        // eslint-disable-next-line no-await-in-loop
        await new Promise<void>((resolve): void => {
            setTimeout((): void => {
                resolve()
            }, 2000)
        })
    }

    return false
}

async function takeScreenshot(browser: Browser, config: ScreenshotConfig): Promise<void> {
    const page = await browser.newPage()

    try {
    // Set viewport for consistent screenshots
        await page.setViewportSize({height: 800, width: 1200})

        // Enable console logging for debugging
        page.on('console', (msg): void => {
            if (msg.type() === 'error') {
                // eslint-disable-next-line no-console
                console.log(`Browser console error: ${msg.text()}`)
            }
        })

        if (config.actions) {
            // eslint-disable-next-line no-console
            console.log(`  📝 Executing custom actions for ${config.name}`)
            await config.actions(page)
        } else {
            // eslint-disable-next-line no-console
            console.log(`  🌐 Navigating to ${config.url}`)
            await page.goto(config.url)

            if (config.waitForSelector) {
                // eslint-disable-next-line no-console
                console.log(`  ⏳ Waiting for selector: ${config.waitForSelector}`)
                await page.waitForSelector(config.waitForSelector, {timeout: 10_000})
            }
        }

        // Additional delay if specified
        if (config.delay) {
            // eslint-disable-next-line no-console
            console.log(`  ⏰ Waiting ${config.delay}ms for animations`)
            await page.waitForTimeout(config.delay)
        }

        // Take screenshot
        const screenshotPath = join('.github', config.name)
        await page.screenshot({
            fullPage: false,
            path: screenshotPath,
            type: 'png',
        })

        // eslint-disable-next-line no-console
        console.log(`✅ Screenshot saved: ${config.name}`)
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error(`❌ Failed to take screenshot ${config.name}:`, error.message)

        // Log current URL for debugging
        try {
            const currentUrl = page.url()
            // eslint-disable-next-line no-console
            console.log(`  📍 Current URL: ${currentUrl}`)
        } catch{
            // Ignore if page is closed
        }

        throw error
    } finally {
        await page.close()
    }
}

export async function takeScreenshots(): Promise<void> {
    // eslint-disable-next-line no-console
    console.log('📸 Starting screenshot capture...\n')

    // Ensure .github directory exists
    await mkdir('.github', {recursive: true})

    let serverProcess = null
    let browser: Browser | null = null

    try {
    // Start the server
        // eslint-disable-next-line no-console
        console.log('🚀 Starting Expressio server...')
        serverProcess = Bun.spawn(['bun', 'run', 'dev'], {
            cwd: 'packages/expressio',
            stderr: 'pipe',
            stdout: 'pipe',
        })

        // Wait for server to be ready
        const serverReady = await waitForServer()
        if (!serverReady) {
            throw new Error('Server failed to start within timeout period')
        }

        // eslint-disable-next-line no-console
        console.log('✅ Server is ready\n')

        // Launch browser
        // eslint-disable-next-line no-console
        console.log('🌐 Launching browser...')
        browser = await chromium.launch({
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--hide-scrollbars',
            ],
            // Show browser window for debugging
            headless: false,
            // Slow down actions by 1 second each
            slowMo: 1000,
        })

        // Take screenshots
        for (const config of SCREENSHOTS) {
            // eslint-disable-next-line no-console
            console.log(`📸 Taking screenshot: ${config.name}`)
            // eslint-disable-next-line no-await-in-loop
            await takeScreenshot(browser, config)
        }

        // eslint-disable-next-line no-console
        console.log('\n🎉 All screenshots captured successfully!')
    } catch(error) {
        // eslint-disable-next-line no-console
        console.error('❌ Screenshot capture failed:', error.message)
        throw error
    } finally {
    // Cleanup
        if (browser) {
            await browser.close()
            // eslint-disable-next-line no-console
            console.log('🌐 Browser closed')
        }

        if (serverProcess) {
            serverProcess.kill()
            // eslint-disable-next-line no-console
            console.log('🛑 Server stopped')
        }
    }
}

// Run if called directly
if (import.meta.main) {
    await takeScreenshots()
}
