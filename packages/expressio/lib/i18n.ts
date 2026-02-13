/*
 * Re-export i18n functionality from common to maintain API compatibility
 * Other applications can still import from @garage44/expressio/lib/i18n
 */
export {create$t, i18nFormat, init, I18N_PATH_SYMBOL} from '@garage44/common/lib/i18n'
