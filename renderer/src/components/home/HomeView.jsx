import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { useMemo, useState } from 'react'

import { unreadCountForRoom } from '../../tifo/notifications.js'
import { profileAvatarFromFile } from '../../tifo/profile-avatar.js'
import { RoomView } from '../RoomView.jsx'
import { HomeSidebar } from './HomeSidebar.jsx'
import chatBgSharp from './chat-bg-sharp.png'
import p2pMesh from './p2p-mesh.png'
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
  const [roomAvatarDataUrl, setRoomAvatarDataUrl] = useState('')
  const [roomAvatarError, setRoomAvatarError] = useState('')
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
    const result = activeActions.createMatchRoom({
      ...roomDraft,
      avatarDataUrl: roomAvatarDataUrl
    })
    if (!result) return
    setRoomDraft({ awayName: '', homeName: '', round: '' })
    setRoomAvatarDataUrl('')
    setRoomAvatarError('')
    setCreatedInvite(result)
    setCopyStatus('')
    setAddMenuOpen(false)
    activeActions.joinRoom({ room: result.room })
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

  async function uploadRoomAvatar(file) {
    if (!file) return
    try {
      setRoomAvatarError('')
      setRoomAvatarDataUrl(await profileAvatarFromFile(file))
    } catch (err) {
      setRoomAvatarError(err.message || 'Could not use room image')
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
          roomAvatarDataUrl={roomAvatarDataUrl}
          roomAvatarError={roomAvatarError}
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
          setRoomAvatarDataUrl={setRoomAvatarDataUrl}
          setRoomDraftField={setRoomDraftField}
          state={activeState}
          uploadGroupAvatar={uploadGroupAvatar}
          uploadRoomAvatar={uploadRoomAvatar}
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
      <div className='home-empty-rings' aria-hidden='true' />
      <img className='home-empty-art' src={p2pMesh} alt='' aria-hidden='true' />
      <motion.div
        className='home-empty-center'
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.2, 0.8, 0.3, 1] }}
      >
        <h1 className='home-empty-title'>Welcome to the terrace</h1>
        <p className='home-empty-sub'>
          Pick a room from the sidebar to start — or use the <b>+</b> to join, create a group, or
          start a DM.
        </p>
      </motion.div>
      <div className='home-empty-footer'>
        <Lock size={12} strokeWidth={2.4} />
        Local-first · peer-to-peer · no servers
      </div>
    </div>
  )
}
