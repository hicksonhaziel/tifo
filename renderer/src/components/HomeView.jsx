import { RadioTower } from 'lucide-react'
import { useEffect, useState } from 'react'

export function HomeView({ actions, state }) {
  const [nickname, setNickname] = useState(state.nickname)
  const [roomCode, setRoomCode] = useState(state.roomCode)

  useEffect(() => {
    setNickname(state.nickname)
    setRoomCode(state.roomCode)
  }, [state.nickname, state.roomCode])

  function submitForm(event) {
    event.preventDefault()
    actions.joinRoom({
      nickname: nickname.trim(),
      roomCode: roomCode.trim()
    })
  }

  return (
    <main className='home-view'>
      <section className='brand-panel' aria-labelledby='home-title'>
        <div className='brand-lockup'>
          <div>
            <p className='eyebrow'>TIFO Living Terrace</p>
            <h1 id='home-title'>
              <img
                className='brand-logo-image'
                src='../assets/brand/transparent/tifo-primary-lockup.png'
                alt='TIFO'
              />
            </h1>
          </div>
        </div>
        <p className='tagline'>Build the terrace. Preserve the echo.</p>
        <div className='feature-row' aria-label='TIFO principles'>
          <span>Fan owned</span>
          <span>No accounts</span>
          <span>Peer first</span>
        </div>
        <div className='status-grid' aria-label='App status'>
          <div>
            <span className='status-label'>Pear worker</span>
            <strong>{state.workerStatus}</strong>
          </div>
          <div>
            <span className='status-label'>P2P room</span>
            <strong>Not connected</strong>
          </div>
          <div>
            <span className='status-label'>Mode</span>
            <strong>Local preview</strong>
          </div>
        </div>
        {state.lastError ? (
          <p className='error-banner' role='status'>
            {state.lastError}
          </p>
        ) : null}
      </section>

      <section className='join-panel' aria-labelledby='join-title'>
        <div className='panel-heading'>
          <p className='eyebrow'>Join room</p>
          <h2 id='join-title'>Enter a match room</h2>
          <p className='panel-copy'>Join a worker-backed P2P match room.</p>
        </div>
        <form id='join-form' className='join-form' onSubmit={submitForm}>
          <label>
            <span>Fan name</span>
            <input
              id='nickname'
              name='nickname'
              maxLength='24'
              autoComplete='nickname'
              placeholder='Amina'
              value={nickname}
              onChange={(event) => setNickname(event.currentTarget.value)}
              required
            />
          </label>
          <label>
            <span>Room code</span>
            <input
              id='room-code'
              name='roomCode'
              maxLength='32'
              autoComplete='off'
              placeholder='MAR-DEMO-R16'
              value={roomCode}
              onChange={(event) => setRoomCode(event.currentTarget.value)}
              required
            />
          </label>
          <button
            className='primary-action inline-flex items-center justify-center gap-2'
            type='submit'
          >
            <RadioTower size={16} strokeWidth={2.4} />
            Enter terrace
          </button>
        </form>
        <div className='fixture-preview'>
          <span className='fixture-label'>Demo fixture</span>
          <span className='fixture-team'>MAR</span>
          <span className='fixture-divider'>vs</span>
          <span className='fixture-team muted'>OPP</span>
          <span className='fixture-round'>R16</span>
        </div>
      </section>
    </main>
  )
}
