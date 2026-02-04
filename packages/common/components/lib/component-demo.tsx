interface ComponentDemoProps {
    children: unknown
    component: string
    title: string
}

export const ComponentDemo = ({children, component, title}: ComponentDemoProps) => {
    // Create slug from title for anchor links
    const id = title.toLowerCase().replaceAll(/\s+/g, '-')

    return (
        <section class='c-component-demo' id={id}>
            <header class='header'>
                <h2 class='title'>{title}</h2>
                <code class='component-name'>{component}</code>
            </header>
            <div class='content'>
                {children}
            </div>
        </section>
    )
}
