import { Check, Copy, Link2, Plus, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { BallAvatar } from './BallAvatar.jsx'
import { MenuButton, SearchInput, TextField } from './HomeSearchInput.jsx'
import {
  avatarUrl,
  displayName,
  roomRound,
  roomTitle,
  searchChats,
  usernameLabel
} from './homeModel.js'

export function HomeSidebar({
  addMenuOpen,
  addTab,
  chats,
  copyInvite,
  copyStatus,
  createdInvite,
  dmHandle,
  groupName,
  inviteLink,
  onCreateDm,
  onCreateGroup,
  onJoinInvite,
  onOpenChat,
  onOpenCreated,
  onRoomClick,
  query,
  rooms,
  setAddMenuOpen,
  setAddTab,
  setCreatedInvite,
  setCopyStatus,
  setDmHandle,
  setGroupName,
  setInviteLink,
  setQuery,
  state
}) {
  const profile = state.profile
  const username = usernameLabel(profile)
  const filteredChats = searchChats(chats, query)

  return (
    <aside className='sidebar'>
      <div className='identity'>
        <div className='avatar'>
          <img alt={`@${username}`} src={avatarUrl(`${username}-9`)} />
        </div>
        <div className='grow col' style={{ minWidth: 0 }}>
          <div className='row aic between'>
            <div className='name'>{displayName(profile)}</div>
            <span className='chip live' style={{ fontSize: 9, padding: '2px 7px' }}>
              Online
            </span>
          </div>
          <div className='handle'>@{username}</div>
        </div>
      </div>

      <div className='side-search'>
        <SearchInput
          compact
          onChange={setQuery}
          placeholder='Search rooms, groups, fans…'
          value={query}
        />
      </div>

      <div className='grow' style={{ overflowY: 'auto', minHeight: 0 }}>
        <SideSection count={rooms.length} title='Match rooms' />
        <div className='side-nav'>
          {rooms.map((room, index) => (
            <SidebarRoom
              active={index === 0}
              key={room.code}
              onClick={() => onRoomClick(room)}
              room={room}
            />
          ))}
        </div>

        <SideSection
          action={
            <button
              className='btn ghost icon'
              onClick={() => setAddMenuOpen((open) => !open)}
              style={{ height: 24, width: 24 }}
              title='New'
              type='button'
            >
              <Plus
                size={12}
                style={{
                  transform: addMenuOpen ? 'rotate(45deg)' : 'none',
                  transition: 'transform .15s'
                }}
              />
            </button>
          }
          title='Chats'
        />

        <AnimatePresence initial={false}>
          {addMenuOpen ? (
            <motion.div
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              initial={{ height: 0, opacity: 0 }}
              style={{ overflow: 'hidden', padding: '0 12px 10px' }}
            >
              <AddMenu
                addTab={addTab}
                copyInvite={copyInvite}
                copyStatus={copyStatus}
                createdInvite={createdInvite}
                dmHandle={dmHandle}
                groupName={groupName}
                inviteLink={inviteLink}
                onCreateDm={onCreateDm}
                onCreateGroup={onCreateGroup}
                onJoinInvite={onJoinInvite}
                onOpenCreated={onOpenCreated}
                setAddTab={setAddTab}
                setCreatedInvite={setCreatedInvite}
                setCopyStatus={setCopyStatus}
                setDmHandle={setDmHandle}
                setGroupName={setGroupName}
                setInviteLink={setInviteLink}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className='side-nav'>
          {filteredChats.length > 0 ? (
            filteredChats.map((row) => (
              <SidebarChat key={row.key} onClick={() => onOpenChat(row)} row={row} />
            ))
          ) : (
            <EmptyChats />
          )}
        </div>
      </div>
    </aside>
  )
}

function SideSection({ action, count, title }) {
  return (
    <div className='side-section'>
      <span>{title}</span>
      {action || <span className='c-mute'>{count}</span>}
    </div>
  )
}

function SidebarRoom({ active, onClick, room }) {
  return (
    <button className={`side-item ${active ? 'active' : ''}`} onClick={onClick} type='button'>
      <div className='ico' style={{ background: 'transparent', border: 0 }}>
        <BallAvatar size={44} />
      </div>
      <div className='lbl'>
        <div className='t1'>{roomTitle(room)}</div>
        <div className='t2 row aic gap-1'>
          <span
            style={{
              background: room.homeAcc || room.homeAccent,
              borderRadius: '50%',
              display: 'inline-block',
              height: 5,
              width: 5
            }}
          />
          <span>{roomRound(room).split('·')[0].trim()}</span>
        </div>
      </div>
      {room.unread > 0 ? (
        <span className='badge'>{room.unread}</span>
      ) : room.live ? (
        <span className='chip live' style={{ fontSize: 9, padding: '1px 7px' }}>
          LIVE
        </span>
      ) : null}
    </button>
  )
}

function SidebarChat({ onClick, row }) {
  return (
    <button className='side-item' onClick={onClick} type='button'>
      <div className='ico'>
        {row.type === 'dm' && row.avatar ? (
          <img alt={row.title} src={row.avatar} />
        ) : (
          <div
            style={{
              alignItems: 'center',
              background: `linear-gradient(135deg, ${row.accent}44, ${row.accent}11)`,
              color: row.accent,
              display: 'flex',
              height: '100%',
              justifyContent: 'center',
              width: '100%'
            }}
          >
            <Users size={16} />
          </div>
        )}
        {row.type === 'dm' ? <span className='presence' /> : null}
      </div>
      <div className='lbl'>
        <div className='t1'>{row.title}</div>
        <div className='t2'>{row.last}</div>
      </div>
      <div className='col' style={{ alignItems: 'flex-end', gap: 4 }}>
        <div className='t2 c-mute t-xs'>{row.time}</div>
        {row.unread > 0 ? <span className='badge'>{row.unread}</span> : null}
      </div>
    </button>
  )
}

function AddMenu({
  addTab,
  copyInvite,
  copyStatus,
  createdInvite,
  dmHandle,
  groupName,
  inviteLink,
  onCreateDm,
  onCreateGroup,
  onJoinInvite,
  onOpenCreated,
  setAddTab,
  setCreatedInvite,
  setCopyStatus,
  setDmHandle,
  setGroupName,
  setInviteLink
}) {
  return (
    <div
      className='card'
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}
    >
      <div className='rail-tabs' style={{ background: 'var(--bg-1)' }}>
        {[
          ['join', 'Join'],
          ['create', 'Group'],
          ['dm', 'DM']
        ].map(([key, label]) => (
          <button
            className={`rail-tab ${addTab === key ? 'active' : ''}`}
            key={key}
            onClick={() => {
              setAddTab(key)
              setCreatedInvite(null)
              setCopyStatus('')
            }}
            type='button'
          >
            {label}
          </button>
        ))}
      </div>

      {addTab === 'join' ? (
        <form className='col' onSubmit={onJoinInvite} style={{ gap: 10 }}>
          <TextField
            icon={<Link2 size={12} />}
            onChange={setInviteLink}
            placeholder='paste invite link'
            value={inviteLink}
          />
          <MenuButton disabled={!inviteLink.trim()} type='submit'>
            Join room
          </MenuButton>
        </form>
      ) : null}

      {addTab === 'create' ? (
        <form className='col' onSubmit={onCreateGroup} style={{ gap: 10 }}>
          <TextField onChange={setGroupName} placeholder='Group name' value={groupName} />
          {!createdInvite ? (
            <MenuButton disabled={!groupName.trim()} type='submit'>
              Create private group
            </MenuButton>
          ) : (
            <>
              <div className='input' style={{ background: 'var(--bg-0)' }}>
                <span className='prefix'>
                  <Link2 size={12} />
                </span>
                <input
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={createdInvite.inviteLink}
                />
                <button className='btn ghost sm' onClick={copyInvite} type='button'>
                  {copyStatus === 'Copied' ? (
                    <>
                      <Check size={12} />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} />
                      Copy
                    </>
                  )}
                </button>
              </div>
              <button className='btn primary sm' onClick={onOpenCreated} type='button'>
                Open chat
              </button>
              <div className='t-xs c-mute'>Anyone with this link can join.</div>
            </>
          )}
        </form>
      ) : null}

      {addTab === 'dm' ? (
        <form className='col' onSubmit={onCreateDm} style={{ gap: 10 }}>
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
    </div>
  )
}

function EmptyChats() {
  return (
    <div className='card' style={{ margin: '0 4px', padding: '14px 12px', textAlign: 'center' }}>
      <div style={{ color: 'var(--ink-1)', fontSize: 12, fontWeight: 600 }}>
        No private chats yet
      </div>
      <div style={{ color: 'var(--ink-2)', fontSize: 11.5, marginTop: 4 }}>
        Use + to join, create, or start a DM.
      </div>
    </div>
  )
}
