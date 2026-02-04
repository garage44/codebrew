import {useEffect, useState, useCallback, useMemo} from 'preact/hooks'
import type {JSX} from 'preact'
import {Button, FieldText} from '@/components'
import {deepSignal} from 'deepsignal'
import {createValidator, required} from '@/lib/validation'
import {$t} from '@/app'

const TRANSLATIONS = [
    'Expression', // English
    'Expressie', // Dutch
    'Espressione', // Italian
    'Выражение', // Russian (vyrazheniye)
    'Ausdruck', // German
    'Expressão', // Portuguese
    '表現', // Japanese (hyōgen)
    'التعبير', // Arabic (at-ta'bir)
    'การแสดงออก', // Thai (kaansadaeng-ook)
    'अभिव्यक्ति', // Hindi (abhivyakti)
    '표현', // Korean (pyohyeon)
    'ביטוי', // Hebrew (bitui)
    'வெளிப்பாடு', // Tamil (velippaadu)
    'ᐃᑌᓂᒧᐎᐣ', // Cree (itenimowin)
    'ສະແດງອອກ', // Lao (sadaeng-ook)
    'ထုတ်ဖော်မှု', // Burmese (htwet-phaw-hmu)
    'អភិវ្យក្តិ', // Khmer (abhivyakti)
    'ᠢᠯᠡᠷᠡᠭᠦᠯᠦᠯᠲᠡ', // Mongolian (ileregülülte)
    'ਪ੍ਰਗਟਾਅ', // Punjabi (pragtaa)
    'ಅಭಿವ್ಯಕ್ತಿ', // Kannada (abhivyakti)
    'പ്രകടനം', // Malayalam (prakatanam)
    'অভিব্যক্তি', // Bengali (obhibbekti)
    'መግለጫ', // Amharic (megletsha)
    'გამოხატვა', // Georgian (gamokhatva)
    'արտահայտություն', // Armenian (artahaytutyun)
    'Ekspresja', // Polish
    'Výraz', // Czech
    'Kifejezés', // Hungarian
    'Uttryck', // Swedish
    'Uttrykk', // Norwegian
    'Ilmaisu', // Finnish
    'Izražaj', // Croatian
    'Izraz', // Serbian
    'Ekspresio', // Esperanto
    'Shprehje', // Albanian
    'Изразяване', // Bulgarian
    'Ekspresie', // Afrikaans
    'Ekspresyon', // Haitian Creole
    'Pahayag', // Filipino/Tagalog
    'Ekspresi', // Indonesian
    'Biểu hiện', // Vietnamese
]

const ANIMATION_DURATION = 7000
const MIN_SPAWN_DELAY = 500
const MAX_SPAWN_DELAY = 3000
const MAX_CONCURRENT_WORDS = 12

interface AnimatedWord {
    angle: number
    distance: number
    id: number
    opacity: number
    position: {x: number; y: number}
    scale: number
    text: string
}

interface LoginProps {
    animated?: boolean
    logo?: string
    LogoIcon?: () => JSX.Element
    onLogin: (username: string, password: string) => Promise<string | null>
    title?: string
}

const state = deepSignal({
    activeWords: [] as AnimatedWord[],
    animationFrame: 0,
    centerPosition: {x: window.innerWidth / 2, y: window.innerHeight / 2},
    nextWordId: 0,
    password: '',
    timeoutIds: [] as number[],
    username: '',
})

export const Login = ({animated = true, logo, LogoIcon, onLogin, title = 'Login'}: LoginProps) => {
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState('')

    // Memoize the validator to prevent re-creation on every render
    const {isValid, resetTouched, validation} = useMemo(() => createValidator({
        password: [state.$password, required('Password is required')],
        username: [state.$username, required('Username is required')],
    }), [])

    const clearTimers = () => {
        if (state.animationFrame) {
            cancelAnimationFrame(state.animationFrame)
        }
        state.timeoutIds.forEach(clearTimeout)
        state.timeoutIds = []
    }

    const updateCenter = () => {
        state.centerPosition = {
            x: window.innerWidth / 2,
            y: window.innerHeight / 2,
        }
    }

    const getRandomPosition = () => {
        const angle = Math.random() * Math.PI * 2
        return {
            angle,
            x: state.centerPosition.x,
            y: state.centerPosition.y,
        }
    }

    const spawnWord = () => {
        const text = TRANSLATIONS[Math.floor(Math.random() * TRANSLATIONS.length)]
        const {angle, x, y} = getRandomPosition()
        const scale = 10.2 + Math.random() * 0.4
        const distance = 1

        const newWord: AnimatedWord = {
            angle,
            distance,
            id: state.nextWordId++,
            opacity: 1,
            position: {x, y},
            scale,
            text,
        }

        state.activeWords = [...state.activeWords, newWord]

        // Just remove word after animation, don't schedule next
        const timeoutId = window.setTimeout(() => {
            state.activeWords = state.activeWords.filter((w) => w.id !== newWord.id)
        }, ANIMATION_DURATION)

        state.timeoutIds = [...state.timeoutIds, timeoutId]
    }

    // Simplified continuous scheduling
    const scheduleNextWord = () => {
        const delay = MIN_SPAWN_DELAY + Math.random() * (MAX_SPAWN_DELAY - MIN_SPAWN_DELAY)
        const timeoutId = window.setTimeout(() => {
            if (state.activeWords.length < MAX_CONCURRENT_WORDS) {
                spawnWord()
            }
            scheduleNextWord() // Always schedule next regardless
        }, delay)
        state.timeoutIds = [...state.timeoutIds, timeoutId]
    }

    const handleLogin = useCallback(async() => {
        resetTouched()

        if (!isValid.value) {
            setError('Please fill in all required fields')
            return
        }

        setLoading(true)
        setError('')

        try {
            const errorMessage = await onLogin(state.username, state.password)
            if (errorMessage) {
                setError(errorMessage)
            } else {
                // Clear form on success
                state.username = ''
                state.password = ''
            }
        } catch(err) {
            setError('Login failed. Please try again.')
        } finally {
            setLoading(false)
        }
    }, [isValid, onLogin, resetTouched])

    const handleKeyPress = useCallback((e: KeyboardEvent) => {
        if (e.key === 'Enter' && !loading) {
            handleLogin()
        }
    }, [loading, handleLogin])

    useEffect(() => {
        if (animated) {
            document.addEventListener('keydown', handleKeyPress)
            window.addEventListener('resize', updateCenter)
            spawnWord() // Spawn first word immediately
            scheduleNextWord() // Start scheduling next words
        }

        return () => {
            if (animated) {
                document.removeEventListener('keydown', handleKeyPress)
                clearTimers()
                window.removeEventListener('resize', updateCenter)
            }
        }
    }, [animated])

    return <div class='c-login' onKeyPress={handleKeyPress}>
        <div style={{position: 'absolute', visibility: 'hidden'}}>
            {$t('direction_helper')}
        </div>
        {animated && <div class='words-container'>
            {state.activeWords.map((word) => <div
                class='floating-translation fade-in'
                key={word.id}
                style={{
                    '--angle': `${word.angle}rad`,
                    left: `${word.position.x}px`,
                    top: `${word.position.y}px`,
                }}
            >
                    {word.text}
            </div>)}
        </div>}

        <div class='login-container'>

            <div class='logo'>
                {LogoIcon ?
                    <svg class='icon logo-animated' viewBox='0 0 24 24'>
                        <LogoIcon />
                    </svg> :
                    logo ?
                    <img alt='Logo' src={logo} /> :
                        null}
                <div class='logo-text'>{title}</div>
            </div>

            <div class='field'>
                <FieldText
                    help='Enter your username'
                    label='Username'
                    model={state.$username}
                    placeholder='Enter your username'
                    validation={validation.value.username}
                />
            </div>

            <div class='field'>
                <FieldText
                    help='Enter your password'
                    label='Password'
                    model={state.$password}
                    placeholder='Enter your password'
                    type='password'
                    validation={validation.value.password}
                />
            </div>

            {error && <div class='error-message'>
                {error}
            </div>}

            <div class='actions'>
                <Button
                    disabled={loading || !isValid.value}
                    icon='login'
                    onClick={handleLogin}
                    tip='Login'
                    variant='menu'
                >
                    {loading ? 'Logging in...' : 'Login'}
                </Button>
            </div>
        </div>
    </div>
}
