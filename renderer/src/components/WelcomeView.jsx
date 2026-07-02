import { ArrowRight, ShieldCheck, UserRound } from 'lucide-react'
import { useMemo, useState } from 'react'

import { normalizeUsername, validUsername } from '../tifo/identity.js'

export function WelcomeView({ actions, state }) {
  const [rawUsername, setRawUsername] = useState('')
  const [localError, setLocalError] = useState('')
  const username = useMemo(() => normalizeUsername(rawUsername), [rawUsername])
  const ready = validUsername(username)

  function submitForm(event) {
    event.preventDefault()
    if (!ready) {
      setLocalError('Use 2 to 20 letters, numbers, or underscores')
      return
    }

    setLocalError('')
    actions.createProfile({ username })
  }

  return (
    <main className='welcome-view'>
      <section className='welcome-brand' aria-labelledby='welcome-title'>
        <div className='brand-lockup'>
          <div>
            <p className='eyebrow'>TIFO Living Terrace</p>
            <h1 id='welcome-title'>
              <img
                className='brand-logo-image'
                src='../assets/brand/transparent/tifo-primary-lockup.png'
                alt='TIFO'
              />
            </h1>
          </div>
        </div>
        <p className='tagline'>Claim your terrace name.</p>
        <div className='identity-principles' aria-label='Identity model'>
          <span>
            <UserRound size={15} strokeWidth={2.4} />
            One local profile
          </span>
          <span>
            <ShieldCheck size={15} strokeWidth={2.4} />
            Device-held key
          </span>
        </div>
      </section>

      <section className='identity-panel' aria-labelledby='identity-title'>
        <div className='panel-heading'>
          <p className='eyebrow'>First run</p>
          <h2 id='identity-title'>Create your fan identity</h2>
          <p className='panel-copy'>This name appears beside your chats, chants, and reactions.</p>
        </div>

        <form className='identity-form' onSubmit={submitForm}>
          <label>
            <span>Username</span>
            <div className='username-field'>
              <span>@</span>
              <input
                autoComplete='username'
                autoFocus
                maxLength='24'
                placeholder='haziel'
                value={rawUsername}
                onChange={(event) => {
                  setRawUsername(event.currentTarget.value)
                  setLocalError('')
                }}
              />
            </div>
          </label>

          <div className='identity-preview'>
            <span className='status-label'>Profile preview</span>
            <strong>{ready ? `@${username}` : '@username'}</strong>
          </div>

          <button
            className='primary-action inline-flex items-center justify-center gap-2'
            type='submit'
          >
            Continue
            <ArrowRight size={16} strokeWidth={2.4} />
          </button>
        </form>

        {localError || state.lastError ? (
          <p className='error-banner' role='status'>
            {localError || state.lastError}
          </p>
        ) : null}
      </section>
    </main>
  )
}
