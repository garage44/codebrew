const colors = [
    {id: 'surface', name: 'Surface (Neutral)'},
    {id: 'primary', name: 'Primary'},
    {id: 'success', name: 'Success'},
    {id: 'danger', name: 'Danger'},
    {id: 'warning', name: 'Warning'},
]

export const Tokens = () => (
    <div class='c-tokens styleguide-page'>
        <h1>Design Tokens</h1>
        <p>Colors, typography, spacing, and other design system values</p>

        <section class='token-section'>
            <h2>Colors</h2>

            {colors.map((color) => (
                <div class='' key={color.id}>
                    <h3>{color.name}</h3>
                    <div class='color-grid'>
                        {[0, 1, 2, 3, 4, 5, 6, 7, 8].map((level) => (
                            <div class='c-color-swatch' key={level}>
                                <div class='color' style={{background: `var(--${color.id}-${level})`}} />
                                <div class='label'>
                                    <code>
                                        --{color.id}-{level}
                                    </code>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))}
        </section>

        <section class='token-section'>
            <h2>Typography</h2>
            <div class='typography-scale'>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-xxs)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-xxs (0.61rem / 10px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-xs)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-xs (0.74rem / 12px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-s)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-s (0.8rem / 13px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-d)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-d (0.9rem / 14px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-l)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-l (1.05rem / 17px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-xl)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-xl (1.3rem / 21px)</code>
                </div>
                <div class='typography-item'>
                    <div class='typography-example' style={{'font-size': 'var(--font-xxl)'}}>
                        The quick brown fox jumps over the lazy dog
                    </div>
                    <code>--font-xxl (3rem / 48px)</code>
                </div>
            </div>
        </section>

        <section class='token-section'>
            <h2>Spacing</h2>
            <div class='spacing-scale'>
                {[
                    {name: '--spacer-025', px: '2px', value: 'calc(var(--spacer-1) * 0.25)'},
                    {name: '--spacer-05', px: '4px', value: 'calc(var(--spacer-1) * 0.5)'},
                    {name: '--spacer-1', px: '8px', value: '8px'},
                    {name: '--spacer-2', px: '16px', value: 'calc(var(--spacer-1) * 2)'},
                    {name: '--spacer-3', px: '24px', value: 'calc(var(--spacer-1) * 3)'},
                    {name: '--spacer-4', px: '32px', value: 'calc(var(--spacer-1) * 4)'},
                    {name: '--spacer-5', px: '40px', value: 'calc(var(--spacer-1) * 5)'},
                    {name: '--spacer-6', px: '48px', value: 'calc(var(--spacer-1) * 6)'},
                    {name: '--spacer-7', px: '56px', value: 'calc(var(--spacer-1) * 7)'},
                    {name: '--spacer-8', px: '64px', value: 'calc(var(--spacer-1) * 8)'},
                ].map(({name, px, value}) => (
                    <div class='spacing-item' key={name}>
                        <div class='spacing-visual' style={{height: `var(${name})`, width: `var(${name})`}} />
                        <div class='spacing-info'>
                            <code>{name}</code>
                            <div class='spacing-value'>
                                {value} ({px})
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </section>

        <section class='token-section'>
            <h2>Icons</h2>
            <div class='icon-scale'>
                {[
                    {name: '--icon-xs', px: '14px'},
                    {name: '--icon-s', px: '16px'},
                    {name: '--icon-d', px: '24px'},
                    {name: '--icon-l', px: '32px'},
                    {name: '--icon-xl', px: '36px'},
                ].map(({name, px}) => (
                    <div class='icon-size-item' key={name}>
                        <div class='icon-size-visual' style={{height: `var(${name})`, width: `var(${name})`}} />
                        <div class='icon-size-info'>
                            <code>{name}</code>
                            <div class='icon-size-value'>{px}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>

        <section class='token-section'>
            <h2>Border Radius</h2>
            <div class='radius-scale'>
                {[
                    {name: '--border-radius-xs', px: '4px'},
                    {name: '--border-radius-s', px: '4px'},
                    {name: '--border-radius-d', px: '8px'},
                    {name: '--border-radius-l', px: '12px'},
                    {name: '--border-radius-xl', px: '16px'},
                ].map(({name, px}) => (
                    <div class='radius-item' key={name}>
                        <div class='radius-visual' style={{'border-radius': `var(${name})`}} />
                        <div class='radius-info'>
                            <code>{name}</code>
                            <div class='radius-value'>{px}</div>
                        </div>
                    </div>
                ))}
            </div>
        </section>
    </div>
)
