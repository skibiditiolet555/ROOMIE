import { setPrefs, usePrefs } from '../../lib/prefs'
import './PrefsSwitch.css'

/** Language (ไทย/EN) and currency (THB/USD) toggles. `floating` pins it top-right on pages without the app header. */
export default function PrefsSwitch({ floating = false }) {
  const { lang, currency } = usePrefs()
  return (
    <div className={`prefs-switch ${floating ? 'is-floating' : ''}`.trim()}>
      <div className="prefs-seg" role="group" aria-label="Language">
        <button type="button" className={lang === 'th' ? 'is-active' : ''} onClick={() => setPrefs({ lang: 'th' })}>ไทย</button>
        <button type="button" className={lang === 'en' ? 'is-active' : ''} onClick={() => setPrefs({ lang: 'en' })}>EN</button>
      </div>
      <div className="prefs-seg" role="group" aria-label="Currency">
        <button type="button" className={currency === 'THB' ? 'is-active' : ''} onClick={() => setPrefs({ currency: 'THB' })}>฿ THB</button>
        <button type="button" className={currency === 'USD' ? 'is-active' : ''} onClick={() => setPrefs({ currency: 'USD' })}>$ USD</button>
      </div>
    </div>
  )
}
