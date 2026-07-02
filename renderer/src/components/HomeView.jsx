import { DoorOpen, KeyRound, RadioTower, Search } from 'lucide-react'
import { useState } from 'react'

import { profileLabel, shortProfileKey } from '../tifo/identity.js'
import { availableRooms } from '../tifo/rooms.js'

export function HomeView({ actions, state }) {
  const [roomCode, setRoomCode] = useState('')
  const profile = state.profile

  function submitCustomRoom(event) {
    event.preventDefault()
    const nextRoomCode = roomCode.trim().toUpperCase()
    if (!nextRoomCode) return
    actions.joinRoom({ roomCode: nextRoomCode })
  }

  return (
    <main className='home-view'>
      <section className='brand-panel home-identity-panel' aria-labelledby='home-title'>
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

        <div className='home-identity'>
          <span className='identity-avatar'>
            {profile?.username?.slice(0, 1).toUpperCase() || 'T'}
          </span>
          <div>
            <span className='status-label'>Fan identity</span>
            <strong>{profileLabel(profile)}</strong>
            <small>{shortProfileKey(profile)}</small>
          </div>
        </div>

        <div className='status-grid' aria-label='App status'>
          <div>
            <span className='status-label'>Pear worker</span>
            <strong>{state.workerStatus}</strong>
          </div>
          <div>
            <span className='status-label'>Rooms</span>
            <strong>{availableRooms.length} available</strong>
          </div>
          <div>
            <span className='status-label'>App peers</span>
            <strong>{state.appPeerCount}</strong>
          </div>
        </div>

        {state.lastError ? (
          <p className='error-banner' role='status'>
            {state.lastError}
          </p>
        ) : null}
      </section>

      <section className='rooms-panel' aria-labelledby='rooms-title'>
        <div className='panel-heading rooms-heading'>
          <div>
            <p className='eyebrow'>Match rooms</p>
            <h2 id='rooms-title'>Available terraces</h2>
          </div>
          <span className='local-pill connected'>Ready</span>
        </div>

        <div className='room-card-list'>
          {availableRooms.map((room) => (
            <button
              className={`room-card tone-${room.tone}`}
              key={room.code}
              type='button'
              onClick={() => actions.joinRoom({ roomCode: room.code })}
            >
              <span className='room-card-meta'>{room.region}</span>
              <strong>{room.title}</strong>
              <span className='room-card-score'>
                <b>{room.home}</b>
                <em>vs</em>
                <b>{room.away}</b>
              </span>
              <span className='room-card-footer'>
                {room.detail}
                <DoorOpen size={15} strokeWidth={2.4} />
              </span>
            </button>
          ))}
        </div>

        <form className='custom-room-form' onSubmit={submitCustomRoom}>
          <label>
            <span>Private room code</span>
            <div className='custom-room-input'>
              <Search size={16} strokeWidth={2.4} />
              <input
                autoComplete='off'
                maxLength='32'
                placeholder='TEAM-TEAM-ROUND'
                value={roomCode}
                onChange={(event) => setRoomCode(event.currentTarget.value.toUpperCase())}
              />
            </div>
          </label>
          <button
            className='ghost-action inline-flex items-center justify-center gap-2'
            type='submit'
          >
            <RadioTower size={16} strokeWidth={2.4} />
            Enter
          </button>
        </form>

        <div className='identity-note'>
          <KeyRound size={15} strokeWidth={2.4} />
          <span>{profileLabel(profile)} joins every room from this device.</span>
        </div>
      </section>
    </main>
  )
}
