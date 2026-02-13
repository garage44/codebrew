/**
 * Avatar utilities for placeholder selection and URL resolution
 */

/**
 * Simple hash function for deterministic placeholder selection
 * Returns a number between 0 and 999999 for consistent hashing
 */
function hashString(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
        const char = str.codePointAt(i) ?? 0
        hash = (hash << 5) - hash + char
        // Convert to 32bit integer
        hash &= hash
    }
    return Math.abs(hash)
}

/**
 * Get placeholder avatar filename for a user
 * Returns deterministic placeholder based on user_id hash (placeholder-1.png to placeholder-10.png)
 */
export function getPlaceholderAvatar(userId: string): string {
    const hash = hashString(userId)
    const placeholderNumber = (hash % 10) + 1
    return `placeholder-${placeholderNumber}.png`
}

/**
 * Get avatar URL from avatar filename/path
 * Handles both placeholder images and uploaded avatars
 *
 * @param avatar Avatar filename/path from database (e.g., "placeholder-3.png" or "abc-123.jpg")
 * @param userId Optional user ID (used for uploaded avatars stored as {userId}.{ext})
 * @returns Resolved avatar URL path
 */
export function getAvatarUrl(avatar: string, _userId?: string): string {
    // If it's a placeholder, serve from /img/
    if (avatar.startsWith('placeholder-')) {
        return `/img/${avatar}`
    }

    // If avatar is already a full path/URL, return as-is
    if (avatar.startsWith('/') || avatar.startsWith('http')) {
        return avatar
    }

    /*
     * For uploaded avatars, avatar is stored as {userId}.{ext} in database
     * So it's already the filename, just serve from /avatars/
     */
    return `/avatars/${avatar}`
}
