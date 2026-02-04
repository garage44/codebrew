import classnames from 'classnames'
import {useRef, useEffect} from 'preact/hooks'
import type {ComponentChildren} from 'preact'
import type {JSX} from 'preact'
import {Button} from '../button/button'
import tippy, {type Instance as TippyInstance} from 'tippy.js'

interface PanelMenuProps {
    actions?: ComponentChildren
    collapsed: boolean
    footer?: ComponentChildren
    LinkComponent?: any
    logoCommitHash?: string
    logoHref?: string
    LogoIcon?: () => JSX.Element
    logoSrc?: string
    logoText?: string
    logoVersion?: string
    navigation?: ComponentChildren
    onCollapseChange?: (collapsed: boolean) => void
}

/**
 * PanelMenu - Generic left sidebar/panel component
 *
 * Provides a consistent panel layout with logo, navigation, actions, and footer sections.
 * Supports collapse/expand functionality.
 *
 * @example
 * <PanelMenu
 *   collapsed={false}
 *   logoSrc="/logo.svg"
 *   logoText="App Name"
 *   navigation={<nav>...</nav>}
 *   actions={<div>...</div>}
 *   footer={<div>...</div>}
 * />
 */
export const PanelMenu = ({
    actions,
    collapsed,
    footer,
    LinkComponent,
    logoCommitHash = '',
    logoHref,
    LogoIcon,
    logoSrc,
    logoText = '',
    logoVersion = '',
    navigation,
    onCollapseChange,
}: PanelMenuProps) => {
    const versionRef = useRef<HTMLSpanElement>(null)
    const tippyInstanceRef = useRef<TippyInstance | null>(null)

    useEffect(() => {
        if (versionRef.current && logoCommitHash) {
            tippyInstanceRef.current = tippy(versionRef.current, {
                content: logoCommitHash,
                placement: 'bottom',
                theme: 'default',
            })

            return () => {
                if (tippyInstanceRef.current) {
                    tippyInstanceRef.current.destroy()
                    tippyInstanceRef.current = null
                }
            }
        }
    }, [logoCommitHash])

    const renderLogo = () => {
        const logoContent = (
            <>
                {logoSrc && <img src={logoSrc} alt={`${logoText} Logo`} />}
                {LogoIcon && (
                    <svg class="icon" viewBox="0 0 24 24" height="40" width="40">
                        <LogoIcon />
                    </svg>
                )}
                {logoText && (
                    <div class="l-name">
                        <span class="name logo-text">{logoText}</span>
                        {logoVersion && (
                            <span ref={versionRef} class="version">
                                {logoVersion}
                            </span>
                        )}
                    </div>
                )}
            </>
        )

        if (LinkComponent && logoHref) {
            return (
                <LinkComponent class="logo" href={logoHref}>
                    {logoContent}
                </LinkComponent>
            )
        }

        return <div class="logo">{logoContent}</div>
    }

    return (
        <aside
            class={classnames('c-panel-menu', 'fade-in', {
                collapsed,
            })}
            style={{gridColumn: 'menu'}}
        >
            <header>
                {renderLogo()}
            </header>
            <div class="content">
                {navigation && (
                    <div class="navigation" data-collapsed={collapsed}>
                        {navigation}
                    </div>
                )}
                {actions && (
                    <div class="actions" data-collapsed={collapsed}>
                        {actions}
                    </div>
                )}
                {footer && <div class="footer">{footer}</div>}
            </div>
            {onCollapseChange && (
                <Button
                    icon={collapsed ? 'chevron_right' : 'chevron_left'}
                    onClick={() => onCollapseChange(!collapsed)}
                    size="s"
                    tip={collapsed ? 'Expand panel' : 'Collapse panel'}
                    type="info"
                    variant="toggle"
                />
            )}
        </aside>
    )
}
