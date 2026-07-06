import { ArrowLeft, Link2, MessageCircle, Users } from 'lucide-react'
import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'

import { unreadCountForRoom } from '../../tifo/notifications.js'
import { availableRooms } from '../../tifo/rooms.js'
import { RoomView } from '../RoomView.jsx'
import { BallAvatar } from './BallAvatar.jsx'
import { HomeSidebar } from './HomeSidebar.jsx'
import { MenuButton, TextField } from './HomeSearchInput.jsx'
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
  const [inviteLink, setInviteLink] = useState('')
  const [dmHandle, setDmHandle] = useState('')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')
  const [homePanel, setHomePanel] = useState('idle')

  const rooms = useMemo(
    () =>
      searchRooms(availableRooms, query).map((room) => ({
        ...room,
        unread: unreadCountForRoom(activeState.notifications, room.code)
      })),
    [activeState.notifications, query]
  )
  const chats = useMemo(() => recentChatRows(activeState), [activeState])
  const focusedHomePanel = !roomOpen && homePanel !== 'idle'

  function joinRoom(room) {
    setHomePanel('idle')
    activeActions.joinRoom({ roomCode: room.code })
  }

  function openChat(row) {
    if (!row.room) return
    setHomePanel('idle')
    activeActions.joinRoom({ room: row.room })
  }

  function joinInvite(event) {
    event.preventDefault()
    if (!inviteLink.trim()) return
    activeActions.joinInvite(inviteLink)
    setInviteLink('')
    setAddMenuOpen(false)
    setHomePanel('idle')
  }

  function createPrivateGroup(event) {
    event.preventDefault()
    const result = activeActions.createPrivateGroup({ title: groupName })
    if (!result) return
    setCreatedInvite(result)
    setGroupName('')
    setCopyStatus('')
    setAddMenuOpen(false)
    setHomePanel('idle')
    activeActions.joinRoom({ room: result.room })
  }

  function createDm(event) {
    event.preventDefault()
    const result = activeActions.createDmRoom({ handle: dmHandle })
    if (!result) return
    setDmHandle('')
    setAddMenuOpen(false)
    setCreatedInvite(null)
    setHomePanel('idle')
    activeActions.joinRoom({ room: result.room })
  }

  function selectAddTab(tab) {
    setAddTab(tab)
    setCreatedInvite(null)
    setCopyStatus('')
    setHomePanel(tab)
    setAddMenuOpen(false)
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
      <div className={`app-body ${roomOpen || focusedHomePanel ? 'room-open' : ''}`}>
        <HomeSidebar
          activePanel={focusedHomePanel ? homePanel : ''}
          activeRoomCode={roomOpen ? activeState.roomCode : ''}
          addMenuOpen={addMenuOpen}
          addTab={addTab}
          chats={chats}
          copyInvite={copyInvite}
          copyStatus={copyStatus}
          createdInvite={createdInvite}
          dmHandle={dmHandle}
          groupName={groupName}
          inviteLink={inviteLink}
          onCreateDm={createDm}
          onCreateGroup={createPrivateGroup}
          onJoinInvite={joinInvite}
          onOpenChat={openChat}
          onOpenCreated={() =>
            createdInvite?.room && activeActions.joinRoom({ room: createdInvite.room })
          }
          onRoomClick={joinRoom}
          query={query}
          rooms={rooms}
          setAddMenuOpen={setAddMenuOpen}
          setAddTab={selectAddTab}
          setCreatedInvite={setCreatedInvite}
          setCopyStatus={setCopyStatus}
          setDmHandle={setDmHandle}
          setGroupName={setGroupName}
          setInviteLink={setInviteLink}
          setQuery={setQuery}
          state={activeState}
        />

        <main className='main'>
          <div className='main-panel'>
            {roomOpen ? (
              <RoomView controller={activeController} />
            ) : focusedHomePanel ? (
              <HomeWorkflowPanel
                addTab={addTab}
                dmHandle={dmHandle}
                groupName={groupName}
                inviteLink={inviteLink}
                onBack={() => {
                  setHomePanel('idle')
                  setAddMenuOpen(false)
                }}
                onCreateDm={createDm}
                onCreateGroup={createPrivateGroup}
                onJoinInvite={joinInvite}
                setAddTab={selectAddTab}
                setDmHandle={setDmHandle}
                setGroupName={setGroupName}
                setInviteLink={setInviteLink}
              />
            ) : (
              <GeneratedHomeEmpty />
            )}
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

function HomeWorkflowPanel({
  addTab,
  dmHandle,
  groupName,
  inviteLink,
  onBack,
  onCreateDm,
  onCreateGroup,
  onJoinInvite,
  setAddTab,
  setDmHandle,
  setGroupName,
  setInviteLink
}) {
  const title =
    addTab === 'create'
      ? 'Create private group'
      : addTab === 'dm'
        ? 'Start direct message'
        : 'Join private chat'
  const subtitle =
    addTab === 'create'
      ? 'Create a private supporter group and land in the chat immediately.'
      : addTab === 'dm'
        ? 'Start a direct chat with a fan handle from your local profile.'
        : 'Paste a TIFO invite link to join a private group or DM.'

  return (
    <div className='chat-bg home-workflow grow'>
      <div className='chat-bg-pattern' />
      <section className='home-workflow-card card'>
        <div className='row aic between home-workflow-head'>
          <button className='btn ghost icon' onClick={onBack} title='Back' type='button'>
            <ArrowLeft size={14} strokeWidth={2.4} />
          </button>
          <div className='rail-tabs'>
            {[
              ['join', 'Join'],
              ['create', 'Group'],
              ['dm', 'DM']
            ].map(([key, label]) => (
              <button
                className={`rail-tab ${addTab === key ? 'active' : ''}`}
                key={key}
                onClick={() => setAddTab(key)}
                type='button'
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className='home-workflow-copy'>
          <div className='workflow-icon'>
            {addTab === 'create' ? (
              <Users size={18} strokeWidth={2.4} />
            ) : addTab === 'dm' ? (
              <MessageCircle size={18} strokeWidth={2.4} />
            ) : (
              <Link2 size={18} strokeWidth={2.4} />
            )}
          </div>
          <div>
            <h2>{title}</h2>
            <p>{subtitle}</p>
          </div>
        </div>

        {addTab === 'join' ? (
          <form className='col home-workflow-form' onSubmit={onJoinInvite}>
            <TextField
              icon={<Link2 size={13} strokeWidth={2.4} />}
              onChange={setInviteLink}
              placeholder='paste invite link'
              value={inviteLink}
            />
            <MenuButton disabled={!inviteLink.trim()} type='submit'>
              Join chat
            </MenuButton>
          </form>
        ) : null}

        {addTab === 'create' ? (
          <form className='col home-workflow-form' onSubmit={onCreateGroup}>
            <TextField onChange={setGroupName} placeholder='Group name' value={groupName} />
            <MenuButton disabled={!groupName.trim()} type='submit'>
              Create and open group
            </MenuButton>
          </form>
        ) : null}

        {addTab === 'dm' ? (
          <form className='col home-workflow-form' onSubmit={onCreateDm}>
            <TextField
              icon={<span style={{ fontFamily: 'var(--font-mono)' }}>@</span>}
              onChange={setDmHandle}
              placeholder='fan.username'
              value={dmHandle}
            />
            <MenuButton disabled={!dmHandle.trim()} type='submit'>
              Start DM
            </MenuButton>
          </form>
        ) : null}
      </section>
    </div>
  )
}
