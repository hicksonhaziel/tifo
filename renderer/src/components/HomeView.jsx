import { Copy, DoorOpen, KeyRound, MessageCircle, Plus, RadioTower, Search } from 'lucide-react'
import { useState } from 'react'

import { profileLabel, shortProfileKey } from '../tifo/identity.js'
import { roomInviteLabel } from '../tifo/invites.js'
import { availableRooms } from '../tifo/rooms.js'

export function HomeView({ actions, state }) {
  const [roomCode, setRoomCode] = useState('')
  const [privateTitle, setPrivateTitle] = useState('')
  const [dmHandle, setDmHandle] = useState('')
  const [inviteText, setInviteText] = useState('')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const profile = state.profile

  function submitCustomRoom(event) {
    event.preventDefault()
    const nextRoomCode = roomCode.trim().toUpperCase()
    if (!nextRoomCode) return
    actions.joinRoom({ roomCode: nextRoomCode })
  }

  function createPrivateGroup(event) {
    event.preventDefault()
    const result = actions.createPrivateGroup({ title: privateTitle })
    if (!result) return
    setCreatedInvite(result)
    setPrivateTitle('')
    setCopyStatus('')
  }

  function createDm(event) {
    event.preventDefault()
    if (!dmHandle.trim()) return
    const result = actions.createDmRoom({ handle: dmHandle })
    if (!result) return
    setCreatedInvite(result)
    setDmHandle('')
    setCopyStatus('')
  }

  function joinInvite(event) {
    event.preventDefault()
    actions.joinInvite(inviteText)
  }

  async function copyInvite(inviteLink = createdInvite?.inviteLink) {
    if (!inviteLink) return
    try {
      await window.navigator.clipboard.writeText(inviteLink)
      setCopyStatus('Invite copied')
    } catch {
      setCopyStatus('Select and copy the invite link')
    }
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
            <strong>{availableRooms.length} public</strong>
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
            <p className='eyebrow'>Fan hub</p>
            <h2 id='rooms-title'>Match rooms, groups, and DMs</h2>
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

        <div className='private-room-grid'>
          <form className='private-room-tool' onSubmit={createPrivateGroup}>
            <div>
              <span className='status-label'>Private group</span>
              <strong>Create group invite</strong>
            </div>
            <input
              maxLength='48'
              placeholder='Group name'
              value={privateTitle}
              onChange={(event) => setPrivateTitle(event.currentTarget.value)}
            />
            <button className='private-tool-action' type='submit'>
              <Plus size={15} strokeWidth={2.4} />
              Create group
            </button>
          </form>

          <form className='private-room-tool' onSubmit={createDm}>
            <div>
              <span className='status-label'>Direct message</span>
              <strong>Start DM</strong>
            </div>
            <input
              maxLength='20'
              placeholder='fan username'
              value={dmHandle}
              onChange={(event) => setDmHandle(event.currentTarget.value)}
            />
            <button className='private-tool-action' type='submit'>
              <MessageCircle size={15} strokeWidth={2.4} />
              Start DM
            </button>
          </form>
        </div>

        {createdInvite ? (
          <div className='created-invite-panel'>
            <div>
              <span className='status-label'>{roomInviteLabel(createdInvite.room)}</span>
              <strong>{createdInvite.room.title}</strong>
            </div>
            <input
              readOnly
              value={createdInvite.inviteLink}
              onFocus={(event) => event.target.select()}
            />
            <div className='invite-actions'>
              <button className='ghost-action' type='button' onClick={() => copyInvite()}>
                <Copy size={15} strokeWidth={2.4} />
                Copy invite
              </button>
              <button
                className='primary-action'
                type='button'
                onClick={() => actions.joinRoom({ room: createdInvite.room })}
              >
                Open chat
              </button>
            </div>
            {copyStatus ? <p className='control-note'>{copyStatus}</p> : null}
          </div>
        ) : null}

        <form className='custom-room-form' onSubmit={joinInvite}>
          <label>
            <span>Join with invite</span>
            <div className='custom-room-input'>
              <KeyRound size={16} strokeWidth={2.4} />
              <input
                autoComplete='off'
                placeholder='tifo://room/...'
                value={inviteText}
                onChange={(event) => setInviteText(event.currentTarget.value)}
              />
            </div>
          </label>
          <button
            className='ghost-action inline-flex items-center justify-center gap-2'
            type='submit'
          >
            <RadioTower size={16} strokeWidth={2.4} />
            Join
          </button>
        </form>

        {state.recentPrivateRooms.length > 0 ? (
          <div className='recent-private-list'>
            <span className='status-label'>Recent groups and DMs</span>
            {state.recentPrivateRooms.map((room) => (
              <div className='recent-private-row' key={room.code}>
                <button type='button' onClick={() => actions.joinRoom({ room })}>
                  <strong>{room.title}</strong>
                  <span>{roomInviteLabel(room)}</span>
                </button>
                <button type='button' title='Copy invite' onClick={() => copyInvite(room.invite)}>
                  <Copy size={14} strokeWidth={2.4} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <form className='custom-room-form compact' onSubmit={submitCustomRoom}>
          <label>
            <span>Public match code</span>
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
          <span>{profileLabel(profile)} joins rooms from this device.</span>
        </div>
      </section>
    </main>
  )
}
