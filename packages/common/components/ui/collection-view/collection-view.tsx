import {ComponentChildren} from 'preact'


export interface CollectionColumn {
    /**
     * Whether to align content to center
     */
    center?: boolean
    /**
     * Additional CSS class for the column
     */
    className?: string
    /**
     * Whether this column should flex to fill available space
     */
    flex?: boolean | number
    /**
     * Column label (header text)
     */
    label?: ComponentChildren
    /**
     * Minimum width for flex columns
     */
    minWidth?: string
    /**
     * Function to render the cell content for this column
     * Receives (item, index) and returns the cell content
     */
    render: (item: any, index: number) => ComponentChildren
    /**
     * Column width (e.g., '120px', '200px') or flex value (e.g., '1', '2')
     * If not provided, defaults to 'auto'
     */
    width?: string
}

export interface CollectionViewProps {
    /**
     * Additional CSS class for the collection view
     */
    className?: string
    /**
     * Column definitions with render functions
     */
    columns: CollectionColumn[]
    /**
     * Empty state message (shown when items.length === 0)
     */
    emptyMessage?: ComponentChildren
    /**
     * Key function for React keys (defaults to item.id or index)
     */
    getKey?: (item: any, index: number) => string | number
    /**
     * Array of items to render
     */
    items: any[]
    /**
     * Function to render row actions (edit/delete buttons)
     * Receives (item) and should return Button components with variant="toggle"
     */
    row_actions?: (item: any) => ComponentChildren
}

/**
 * CollectionView - Reusable table-like component using flexbox
 *
 * Provides a consistent table-like layout with:
 * - Header row with column labels
 * - Alternating odd/even row styling
 * - Column-based layout using flexbox
 * - Hover effects
 * - Row actions (edit/delete buttons) that appear on hover
 *
 * @example
 * <CollectionView
 *   columns={[
 *     {
 *       label: 'Name',
 *       flex: true,
 *       minWidth: '200px',
 *       render: (user) => <span>{user.username}</span>
 *     },
 *     {
 *       label: 'Role',
 *       width: '120px',
 *       center: true,
 *       render: (user) => user.admin ? <Badge>Admin</Badge> : <span>—</span>
 *     }
 *   ]}
 *   items={users}
 *   row_actions={(user) => (
 *     <>
 *       <Button icon="edit" onClick={() => edit(user)} variant="toggle" type="info" />
 *       <Button icon="trash" onClick={() => delete(user)} variant="toggle" type="danger" />
 *     </>
 *   )}
 *   emptyMessage="No users found"
 * />
 */
export function CollectionView({
    className = '',
    columns,
    emptyMessage,
    getKey,
    items,
    row_actions,
}: CollectionViewProps) {
    const getItemKey = (item: any, index: number) => {
        if (getKey) return getKey(item, index)
        return item.id ?? item._id ?? index
    }

    // Add actions column if row_actions is provided
    const allColumns: CollectionColumn[] = row_actions
        ? [
            ...columns,
            {
                className: 'collection-actions-column',
                label: '',
                render: () => null, // Actions column doesn't render in cells
                width: '140px',
                minWidth: '140px',
            } satisfies CollectionColumn,
        ]
        : columns

    return (
        <div class={`c-collection-view ${className}`}>
            {items.length === 0 && emptyMessage ? (
                <div class="collection-empty-state">{emptyMessage}</div>
            ) : (
                <>
                    <div class="collection-header">
                        {allColumns.map((column, index) => (
                            <div
                                key={index}
                                class={`collection-header-cell ${column.className || ''}`}
                                style={{
                                    flex: column.flex ? (typeof column.flex === 'number' ? column.flex : 1) : undefined,
                                    justifyContent: column.center ? 'center' : undefined,
                                    minWidth: column.minWidth,
                                    width: column.flex ? undefined : column.width || 'auto',
                                }}
                            >
                                {column.label}
                            </div>
                        ))}
                    </div>
                    {items.map((item, index) => (
                        <div
                            key={getItemKey(item, index)}
                            class={`collection-row ${index % 2 === 0 ? 'even' : 'odd'}`}
                        >
                            {allColumns.map((column, colIndex) => {
                                const isActionsColumn = colIndex === allColumns.length - 1 && row_actions
                                return (
                                    <div
                                        key={colIndex}
                                        class={`collection-cell ${column.className || ''}`}
                                        style={{
                                            flex: column.flex ? (typeof column.flex === 'number' ? column.flex : 1) : undefined,
                                            justifyContent: column.center ? 'center' : undefined,
                                            minWidth: column.minWidth,
                                            width: column.flex ? undefined : column.width || 'auto',
                                        }}
                                    >
                                        {isActionsColumn ? (
                                            <div class="collection-row-actions">{row_actions(item)}</div>
                                        ) : (
                                            column.render(item, index)
                                        )}
                                    </div>
                                )
                            })}
                        </div>
                    ))}
                </>
            )}
        </div>
    )
}
