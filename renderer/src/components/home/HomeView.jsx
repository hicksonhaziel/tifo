import { motion } from 'framer-motion'
import { useMemo, useState } from 'react'

import { availableRooms } from '../../tifo/rooms.js'
import { BallAvatar } from './BallAvatar.jsx'
import { HomeSidebar } from './HomeSidebar.jsx'
import chatBgSharp from './chat-bg-sharp.png'
import './generatedHome.css'
import { recentChatRows, searchRooms } from './homeModel.js'

export function HomeView({ actions, state }) {
  const [query, setQuery] = useState('')
  const [addMenuOpen, setAddMenuOpen] = useState(false)
  const [addTab, setAddTab] = useState('join')
  const [groupName, setGroupName] = useState('')
  const [inviteLink, setInviteLink] = useState('')
  const [dmHandle, setDmHandle] = useState('')
  const [createdInvite, setCreatedInvite] = useState(null)
  const [copyStatus, setCopyStatus] = useState('')

  const rooms = useMemo(() => searchRooms(availableRooms, query), [query])
  const chats = useMemo(() => recentChatRows(state), [state])

  function joinRoom(room) {
    actions.joinRoom({ roomCode: room.code })
  }

  function openChat(row) {
    if (!row.room) return
    actions.joinRoom({ room: row.room })
  }

  function joinInvite(event) {
    event.preventDefault()
    if (!inviteLink.trim()) return
    actions.joinInvite(inviteLink)
    setInviteLink('')
    setAddMenuOpen(false)
  }

  function createPrivateGroup(event) {
    event.preventDefault()
    const result = actions.createPrivateGroup({ title: groupName })
    if (!result) return
    setCreatedInvite(result)
    setGroupName('')
    setCopyStatus('')
  }

  function createDm(event) {
    event.preventDefault()
    const result = actions.createDmRoom({ handle: dmHandle })
    if (!result) return
    setDmHandle('')
    setAddMenuOpen(false)
    setCreatedInvite(null)
    actions.joinRoom({ room: result.room })
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
      <div className='app-body'>
        <HomeSidebar
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
            createdInvite?.room && actions.joinRoom({ room: createdInvite.room })
          }
          onRoomClick={joinRoom}
          query={query}
          rooms={rooms}
          setAddMenuOpen={setAddMenuOpen}
          setAddTab={setAddTab}
          setCreatedInvite={setCreatedInvite}
          setCopyStatus={setCopyStatus}
          setDmHandle={setDmHandle}
          setGroupName={setGroupName}
          setInviteLink={setInviteLink}
          setQuery={setQuery}
          state={state}
        />

        <main className='main'>
          <GeneratedHomeEmpty />
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
