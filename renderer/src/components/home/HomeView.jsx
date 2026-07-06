import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'

import { unreadCountForRoom } from '../../tifo/notifications.js'
import { profileAvatarFromFile } from '../../tifo/profile-avatar.js'
import { RoomView } from '../RoomView.jsx'
import { BallAvatar } from './BallAvatar.jsx'
import { HomeSidebar } from './HomeSidebar.jsx'
import chatBgSharp from './chat-bg-sharp.png'
import './generatedHome.css'
import { recentChatRows, searchRooms } from './homeModel.js'

export function HomeView({ actions, controller, state }) {
  const activeController = controller || { actions, state }
  const activeActions = activeController.actions
  const activeState = activeController.state
  const roomOpen = activeState.view === 'room'
  const [query, setQuery] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addTab, setAddTab] = useState('join')
  const [groupName, setGroupName] = useState('')
  const [groupAvatarDataUrl, setGroupAvatarDataUrl] = useState('')
  const [groupAvatarError, setGroupAvatarError] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [roomDraft, setRoomDraft] = useState({
    awayName: '',
    homeName: '',
    round: ''
  })
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')

  const rooms = useMemo(
    () =>
      searchRooms(activeState.matchRooms || [], query).map((room) => ({
        ...room,
        unread: unreadCountForRoom(activeState.notifications, room.code)
      })),
    [activeState.matchRooms, activeState.notifications, query]
  )
  const chats = useMemo(() => recentChatRows(activeState), [activeState])

  function joinRoom(room) {
    activeActions.joinRoom({ room })
  }

  function openChat(row) {
    if (!row.room) return
    activeActions.joinRoom({ room: row.room })
  }

  function joinInvite(event) {
    event.preventDefault()
    if (!inviteLink.trim()) return
    activeActions.joinInvite(inviteLink)
    setInviteLink('')
    setAddMenuOpen(false)
  }

  function createPrivateGroup(event) {
    event.preventDefault()
    const result = activeActions.createPrivateGroup({
      avatarDataUrl: groupAvatarDataUrl,
      title: groupName
    })
    if (!result) return
    setCreatedInvite(result)
    setGroupAvatarDataUrl('')
    setGroupAvatarError('')
    setGroupName('')
    setCopyStatus('')
    setAddMenuOpen(false)
    activeActions.joinRoom({ room: result.room })
  }

  function createDm(event) {
    event.preventDefault()
    const result = activeActions.createDmRoom()
    if (!result) return
    setCreatedInvite(result)
    setCopyStatus('')
    setAddMenuOpen(true)
  }

  function createMatchRoom(event) {
    event.preventDefault()
    const room = activeActions.createMatchRoom(roomDraft)
    if (!room) return
    setRoomDraft({ awayName: '', homeName: '', round: '' })
    setAddMenuOpen(false)
    activeActions.joinRoom({ room })
  }

  function setRoomDraftField(field, value) {
    setRoomDraft((draft) => ({
      ...draft,
      [field]: value
    }))
  }

  async function uploadGroupAvatar(file) {
    if (!file) return
    try {
      setGroupAvatarError('')
      setGroupAvatarDataUrl(await profileAvatarFromFile(file))
    } catch (err) {
      setGroupAvatarError(err.message || 'Could not use group image')
    }
  }

  async function copyInvite() {
    if (!createdInvite?.inviteLink) return
    try {
      await window.navigator.clipboard.writeText(createdInvite.inviteLink)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Select and copy')
    }
  }

  return (
    <motion.main
      animate={{ opacity: 1 }}
      className='tifo-generated-home'
      initial={{ opacity: 0 }}
      style={{
        '--chat-bg-image': `url(${chatBgSharp})`
      }}
    >
      <div className={`app-body ${roomOpen ? 'room-open' : ''}`}>
        <HomeSidebar
          activePanel=''
          activeRoomCode={roomOpen ? activeState.roomCode : ''}
          addMenuOpen={addMenuOpen}
          addTab={addTab}
          chats={chats}
          copyInvite={copyInvite}
          copyStatus={copyStatus}
          createdInvite={createdInvite}
          groupAvatarDataUrl={groupAvatarDataUrl}
          groupAvatarError={groupAvatarError}
          groupName={groupName}
          inviteLink={inviteLink}
          onCreateRoom={createMatchRoom}
          onCreateDm={createDm}
          onCreateGroup={createPrivateGroup}
          onDeleteChat={(row) => activeActions.deletePrivateRoom(row.room?.code || row.key)}
          onDeleteRoom={(room) => activeActions.deleteMatchRoom(room.code)}
          onJoinInvite={joinInvite}
          onOpenChat={openChat}
          onOpenCreated={() =>
            createdInvite?.room && activeActions.joinRoom({ room: createdInvite.room })
          }
          onRoomClick={joinRoom}
          query={query}
          roomDraft={roomDraft}
          rooms={rooms}
          setAddMenuOpen={setAddMenuOpen}
          setAddTab={(tab) => {
            setAddTab(tab)
            setCreatedInvite(null)
            setCopyStatus('')
            setAddMenuOpen(true)
          }}
          setCreatedInvite={setCreatedInvite}
          setCopyStatus={setCopyStatus}
          setGroupAvatarDataUrl={setGroupAvatarDataUrl}
          setGroupName={setGroupName}
          setInviteLink={setInviteLink}
          setQuery={setQuery}
          setRoomDraftField={setRoomDraftField}
          state={activeState}
          uploadGroupAvatar={uploadGroupAvatar}
        />

        <main className='main'>
          <div className='main-panel'>
            {roomOpen ? <RoomView controller={activeController} /> : <GeneratedHomeEmpty />}
          </div>
        </main>
      </div>
    </motion.main>
  )
}

function GeneratedHomeEmpty() {
  return (
    <div className='chat-bg home-empty grow'>
      <div className='chat-bg-pattern' />
      <div className='home-empty-state'>
        <BallAvatar size={72} />
        <div className='hint'>Pick a terrace from the sidebar</div>
      </div>
    </div>
  )
}
