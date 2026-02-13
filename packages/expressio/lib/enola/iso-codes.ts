/**
 * ISO 639-2 to ISO 639-1 language code mapping
 *
 * ISO 639-2 uses three-letter codes and has two forms:
 * - Terminological (T): Based on the native name of the language
 * - Bibliographic (B): Alternative codes used in bibliographic tradition
 *
 * We use only the terminological (T) codes where available, as they are:
 * 1. Based on the native names of the languages (endonyms)
 * 2. Preferred in modern applications
 * 3. Recommended by ISO 639-2 Registration Authority
 *
 * Example:
 * German: 'deu' (terminological, from "Deutsch") maps to 'de' (ISO 639-1)
 */
const ISO_639_2_TO_1: Record<string, string> = {
    // Afar
    aar: 'aa',
    // Abkhazian
    abk: 'ab',
    // Afrikaans
    afr: 'af',
    // Akan
    aka: 'ak',
    // Amharic
    amh: 'am',
    // Arabic
    ara: 'ar',
    // Aragonese
    arg: 'an',
    // Assamese
    asm: 'as',
    // Avaric
    ava: 'av',
    // Avestan
    ave: 'ae',
    // Aymara
    aym: 'ay',
    // Azerbaijani
    aze: 'az',
    // Bambara
    bam: 'bm',
    // Belarusian
    bel: 'be',
    // Bengali
    ben: 'bn',
    // Bihari languages
    bih: 'bh',
    // Bislama
    bis: 'bi',
    // Tibetan
    bod: 'bo',
    // Bosnian
    bos: 'bs',
    // Breton
    bre: 'br',
    // Bulgarian
    bul: 'bg',
    // Catalan
    cat: 'ca',
    // Czech
    ces: 'cs',
    // Chamorro
    cha: 'ch',
    // Chechen
    che: 'ce',
    // Church Slavic
    chu: 'cu',
    // Chuvash
    chv: 'cv',
    // Cornish
    cor: 'kw',
    // Corsican
    cos: 'co',
    // Cree
    cre: 'cr',
    // Welsh
    cym: 'cy',
    // Danish
    dan: 'da',
    // German
    deu: 'de',
    // Divehi
    div: 'dv',
    // Dzongkha
    dzo: 'dz',
    // Greek
    ell: 'el',
    // English
    eng: 'en',
    // Esperanto
    epo: 'eo',
    // Estonian
    est: 'et',
    // Basque
    eus: 'eu',
    // Ewe
    ewe: 'ee',
    // Faroese
    fao: 'fo',
    // Persian
    fas: 'fa',
    // Fijian
    fij: 'fj',
    // Finnish
    fin: 'fi',
    // French
    fra: 'fr',
    // Fulah
    ful: 'ff',
    // Gaelic
    gla: 'gd',
    // Irish
    gle: 'ga',
    // Galician
    glg: 'gl',
    // Manx
    glv: 'gv',
    // Guarani
    grn: 'gn',
    // Gujarati
    guj: 'gu',
    // Haitian
    hat: 'ht',
    // Hausa
    hau: 'ha',
    // Hebrew
    heb: 'he',
    // Herero
    her: 'hz',
    // Hindi
    hin: 'hi',
    // Hiri Motu
    hmo: 'ho',
    // Hungarian
    hun: 'hu',
    // Armenian
    hye: 'hy',
    // Ido
    ido: 'io',
    // Sichuan Yi
    iii: 'ii',
    // Inuktitut
    iku: 'iu',
    // Interlingue
    ile: 'ie',
    // Interlingua
    ina: 'ia',
    // Indonesian
    ind: 'id',
    // Inupiaq
    ipk: 'ik',
    // Icelandic
    isl: 'is',
    // Italian
    ita: 'it',
    // Javanese
    jav: 'jv',
    // Japanese
    jpn: 'ja',
    // Kalaallisut
    kal: 'kl',
    // Kannada
    kan: 'kn',
    // Kashmiri
    kas: 'ks',
    // Georgian
    kat: 'ka',
    // Kanuri
    kau: 'kr',
    // Kazakh
    kaz: 'kk',
    // Central Khmer
    khm: 'km',
    // Kikuyu
    kik: 'ki',
    // Kinyarwanda
    kin: 'rw',
    // Kirghiz
    kir: 'ky',
    // Komi
    kom: 'kv',
    // Kongo
    kon: 'kg',
    // Korean
    kor: 'ko',
    // Kuanyama
    kua: 'kj',
    // Kurdish
    kur: 'ku',
    // Lao
    lao: 'lo',
    // Latin
    lat: 'la',
    // Latvian
    lav: 'lv',
    // Limburgan
    lim: 'li',
    // Lingala
    lin: 'ln',
    // Lithuanian
    lit: 'lt',
    // Luba-Katanga
    lub: 'lu',
    // Ganda
    lug: 'lg',
    // Marshallese
    mah: 'mh',
    // Malayalam
    mal: 'ml',
    // Marathi
    mar: 'mr',
    // Macedonian
    mkd: 'mk',
    // Malagasy
    mlg: 'mg',
    // Maltese
    mlt: 'mt',
    // Mongolian
    mon: 'mn',
    // Maori
    mri: 'mi',
    // Malay
    msa: 'ms',
    // Burmese
    mya: 'my',
    // Nauru
    nau: 'na',
    // Navajo
    nav: 'nv',
    // South Ndebele
    nbl: 'nr',
    // North Ndebele
    nde: 'nd',
    // Ndonga
    ndo: 'ng',
    // Nepali
    nep: 'ne',
    // Dutch
    nld: 'nl',
    // Norwegian Nynorsk
    nno: 'nn',
    // Norwegian Bokmål
    nob: 'nb',
    // Norwegian
    nor: 'no',
    // Chichewa
    nya: 'ny',
    // Occitan
    oci: 'oc',
    // Ojibwa
    oji: 'oj',
    // Oriya
    ori: 'or',
    // Oromo
    orm: 'om',
    // Ossetian
    oss: 'os',
    // Panjabi
    pan: 'pa',
    // Pali
    pli: 'pi',
    // Polish
    pol: 'pl',
    // Portuguese
    por: 'pt',
    // Pushto
    pus: 'ps',
    // Quechua
    que: 'qu',
    // Romansh
    roh: 'rm',
    // Romanian
    ron: 'ro',
    // Rundi
    run: 'rn',
    // Russian
    rus: 'ru',
    // Sango
    sag: 'sg',
    // Sanskrit
    san: 'sa',
    // Sinhala
    sin: 'si',
    // Slovak
    slk: 'sk',
    // Slovenian
    slv: 'sl',
    // Northern Sami
    sme: 'se',
    // Samoan
    smo: 'sm',
    // Shona
    sna: 'sn',
    // Sindhi
    snd: 'sd',
    // Somali
    som: 'so',
    // Southern Sotho
    sot: 'st',
    // Spanish
    spa: 'es',
    // Albanian
    sqi: 'sq',
    // Sardinian
    srd: 'sc',
    // Serbian
    srp: 'sr',
    // Swati
    ssw: 'ss',
    // Sundanese
    sun: 'su',
    // Swahili
    swa: 'sw',
    // Swedish
    swe: 'sv',
    // Tahitian
    tah: 'ty',
    // Tamil
    tam: 'ta',
    // Tatar
    tat: 'tt',
    // Telugu
    tel: 'te',
    // Tajik
    tgk: 'tg',
    // Tagalog
    tgl: 'tl',
    // Thai
    tha: 'th',
    // Tigrinya
    tir: 'ti',
    // Tonga
    ton: 'to',
    // Tswana
    tsn: 'tn',
    // Tsonga
    tso: 'ts',
    // Turkmen
    tuk: 'tk',
    // Turkish
    tur: 'tr',
    // Twi
    twi: 'tw',
    // Uighur
    uig: 'ug',
    // Ukrainian
    ukr: 'uk',
    // Urdu
    urd: 'ur',
    // Uzbek
    uzb: 'uz',
    // Venda
    ven: 've',
    // Vietnamese
    vie: 'vi',
    // Volapük
    vol: 'vo',
    // Walloon
    wln: 'wa',
    // Wolof
    wol: 'wo',
    // Xhosa
    xho: 'xh',
    // Yiddish
    yid: 'yi',
    // Yoruba
    yor: 'yo',
    // Zhuang
    zha: 'za',
    // Chinese
    zho: 'zh',
    // Zulu
    zul: 'zu',
}

/**
 * Convert ISO 639-1 code to ISO 639-2 code
 * Returns the terminological (T) code where available
 * @param iso6391Code - Two-letter ISO 639-1 language code
 * @returns Three-letter ISO 639-2 language code or null if not found
 */
function iso6391ToIso6392(iso6391Code: string): string | null {
    const code = iso6391Code.toLowerCase()

    return null
}

/**
 * Extended language codes mapping for variants
 * Maps from provider-specific codes to ISO language codes
 */
const EXTENDED_LANGUAGE_CODES = {
    // British English
    'en-gb': 'eng-gbr',
    // American English
    'en-us': 'eng-usa',
    // Brazilian Portuguese
    'pt-br': 'por-bra',
    // European Portuguese
    'pt-pt': 'por-prt',
    // Chinese (macrolanguage)
    zh: 'zho',
    // Simplified Chinese (Han Simplified)
    'zh-hans': 'zho-hans',
}

function toIso6391(iso6392Code: string | null | undefined): string | null {
    if (!iso6392Code) {
        return null
    }
    const code = iso6392Code.toLowerCase()
    if (code.includes('-')) {
        // For codes like 'eng-gbr', convert to 'en-gb'
        for (const [iso6391, iso6392] of Object.entries(EXTENDED_LANGUAGE_CODES)) {
            if (iso6392 === code) {
                return iso6391
            }
        }
    }
    return ISO_639_2_TO_1[code] || null
}

/**
 * Convert extended language code to ISO 639-2
 * Handles variants like en-US, pt-BR, etc.
 * @param code - Extended language code (e.g., 'en-US', 'pt-BR')
 * @returns The ISO 639-2 code with optional region (e.g., 'eng-GBR', 'por-BRA')
 */
function toIso6392(iso6391Code: string): string | null {
    const code = iso6391Code.toLowerCase()
    if (iso6391Code.includes('-')) {
        const extendedCode = EXTENDED_LANGUAGE_CODES[iso6391Code.toLowerCase() as keyof typeof EXTENDED_LANGUAGE_CODES]

        if (extendedCode) {
            return extendedCode
        }
    }

    for (const [iso6392, iso6391] of Object.entries(ISO_639_2_TO_1)) {
        if (iso6391 === code) {
            return iso6392
        }
    }

    return null
}

/**
 * Get the region code from an ISO 639-2 code with region
 * @param code - ISO 639-2 code with optional region (e.g., 'eng-GB', 'por-BR')
 * @returns The region code or null if not found
 */
function getRegionCode(code: string): string | null {
    const parts = code.split('-')
    return parts.length > 1 ? parts[1] : null
}

export {
    EXTENDED_LANGUAGE_CODES,
    ISO_639_2_TO_1,
    getRegionCode,
    iso6391ToIso6392,
    toIso6391,
    toIso6392,
}
