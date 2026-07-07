import { Check, Copy, ImagePlus, Link2, Plus, Trash2, Users } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { useRef } from 'react'

import { BallAvatar } from './BallAvatar.jsx'
import { MenuButton, SearchInput, TextField } from './HomeSearchInput.jsx'
import {
  displayName,
  profileAvatarUrl,
  roomRound,
  roomTitle,
  searchChats,
  usernameLabel
} from './homeModel.js'

export function HomeSidebar({
  activePanel,
  activeRoomCode,
  addMenuOpen,
  addTab,
  chats,
  copyInvite,
  copyStatus,
  createdInvite,
  groupAvatarDataUrl,
  groupAvatarError,
  groupName,
  inviteLink,
  onCreateDm,
  onCreateGroup,
  onCreateRoom,
  onDeleteChat,
  onDeleteRoom,
  onJoinInvite,
  onOpenChat,
  onOpenCreated,
  onRoomClick,
  query,
  roomAvatarDataUrl,
  roomAvatarError,
  roomDraft,
  rooms,
  setAddMenuOpen,
  setAddTab,
  setCreatedInvite,
  setCopyStatus,
  setGroupAvatarDataUrl,
  setGroupName,
  setInviteLink,
  setRoomAvatarDataUrl,
  setRoomDraftField,
  setQuery,
  state,
  uploadGroupAvatar,
  uploadRoomAvatar
}) {
  const profile = state.profile
  const username = usernameLabel(profile)
  const filteredChats = searchChats(chats, query)
  const addPanelActive = ['join', 'room', 'create', 'dm'].includes(activePanel)
  const unreadTotal = state.notifications?.unreadCount || 0

  return (
    <aside className='sidebar'>
      <div className='identity'>
        <div className='avatar'>
          <img alt={`@${username}`} src={profileAvatarUrl(profile, `${username}-9`)} />
        </div>
        <div className='grow col' style={{ minWidth: 0 }}>
          <div className='row aic between'>
            <div className='name'>{displayName(profile)}</div>
            <div className='identity-status'>
              {unreadTotal > 0 ? (
                <span className='global-unread-badge'>{formatUnread(unreadTotal)}</span>
              ) : null}
              <span className='chip live' style={{ fontSize: 9, padding: '2px 7px' }}>
                Online
              </span>
            </div>
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
          {rooms.map((room) => (
            <SidebarRoom
              active={room.code === activeRoomCode}
              key={room.code}
              onDelete={() => onDeleteRoom(room)}
              onClick={() => onRoomClick(room)}
              room={room}
            />
          ))}
        </div>

        <SideSection
          action={
            <button
              className={`btn ghost icon ${addPanelActive ? 'active' : ''}`}
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
                groupAvatarDataUrl={groupAvatarDataUrl}
                groupAvatarError={groupAvatarError}
                groupName={groupName}
                inviteLink={inviteLink}
                onCreateDm={onCreateDm}
                onCreateGroup={onCreateGroup}
                onCreateRoom={onCreateRoom}
                onJoinInvite={onJoinInvite}
                onOpenCreated={onOpenCreated}
                roomAvatarDataUrl={roomAvatarDataUrl}
                roomAvatarError={roomAvatarError}
                roomDraft={roomDraft}
                setAddTab={setAddTab}
                setCreatedInvite={setCreatedInvite}
                setCopyStatus={setCopyStatus}
                setGroupAvatarDataUrl={setGroupAvatarDataUrl}
                setGroupName={setGroupName}
                setInviteLink={setInviteLink}
                setRoomAvatarDataUrl={setRoomAvatarDataUrl}
                setRoomDraftField={setRoomDraftField}
                uploadGroupAvatar={uploadGroupAvatar}
                uploadRoomAvatar={uploadRoomAvatar}
              />
            </motion.div>
          ) : null}
        </AnimatePresence>

        <div className='side-nav'>
          {filteredChats.length > 0 ? (
            filteredChats.map((row) => (
              <SidebarChat
                active={row.key === activeRoomCode || row.room?.code === activeRoomCode}
                key={row.key}
                onDelete={() => onDeleteChat(row)}
                onClick={() => onOpenChat(row)}
                row={row}
              />
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

function SidebarRoom({ active, onClick, onDelete, room }) {
  return (
    <div
      className={`side-item ${active ? 'active' : ''} ${room.unread > 0 ? 'unread' : ''}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick()
      }}
      role='button'
      tabIndex={0}
    >
      <div
        className='ico'
        style={{
          background: room.avatarDataUrl ? 'var(--bg-2)' : 'transparent',
          border: room.avatarDataUrl ? '1px solid var(--line-2)' : 0
        }}
      >
        {room.avatarDataUrl ? (
          <img alt={roomTitle(room)} src={room.avatarDataUrl} />
        ) : (
          <BallAvatar size={44} />
        )}
      </div>
      <div className='lbl'>
        <div className='t1'>{roomTitle(room)}</div>
        <div className='t2'>{roomRound(room).split('·')[0].trim()}</div>
      </div>
      {room.unread > 0 ? <span className='badge'>{formatUnread(room.unread)}</span> : null}
      <button
        className='side-delete'
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        title='Delete room'
        type='button'
      >
        <Trash2 size={13} strokeWidth={2.4} />
      </button>
    </div>
  )
}

function SidebarChat({ active, onClick, onDelete, row }) {
  return (
    <div
      className={`side-item ${active ? 'active' : ''} ${row.unread > 0 ? 'unread' : ''}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') onClick()
      }}
      role='button'
      tabIndex={0}
    >
      <div className='ico'>
        {row.avatar ? (
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
        {row.unread > 0 ? <span className='badge'>{formatUnread(row.unread)}</span> : null}
      </div>
      <button
        className='side-delete'
        onClick={(event) => {
          event.stopPropagation()
          onDelete()
        }}
        title={row.type === 'group' ? 'Delete group' : 'Delete chat'}
        type='button'
      >
        <Trash2 size={13} strokeWidth={2.4} />
      </button>
    </div>
  )
}

function formatUnread(count) {
  return count > 99 ? '99+' : String(count)
}

function AddMenu({
  addTab,
  copyInvite,
  copyStatus,
  createdInvite,
  groupAvatarDataUrl,
  groupAvatarError,
  groupName,
  inviteLink,
  onCreateDm,
  onCreateGroup,
  onCreateRoom,
  onJoinInvite,
  onOpenCreated,
  roomAvatarDataUrl,
  roomAvatarError,
  roomDraft,
  setAddTab,
  setCreatedInvite,
  setCopyStatus,
  setGroupAvatarDataUrl,
  setGroupName,
  setInviteLink,
  setRoomAvatarDataUrl,
  setRoomDraftField,
  uploadGroupAvatar,
  uploadRoomAvatar
}) {
  const inviteReady = createdInvite && ['room', 'create', 'dm'].includes(addTab)

  return (
    <div
      className='card'
      style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12 }}
    >
      <div className='rail-tabs add-tabs' style={{ background: 'var(--bg-1)' }}>
        {[
          ['join', 'Join'],
          ['room', 'Room'],
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

      {addTab === 'room' ? (
        <form className='col' onSubmit={onCreateRoom} style={{ gap: 10 }}>
          <AvatarPicker
            avatarDataUrl={roomAvatarDataUrl}
            error={roomAvatarError}
            onClear={() => setRoomAvatarDataUrl('')}
            onUpload={uploadRoomAvatar}
            note='Optional match image for the sidebar and invite.'
            title='Room picture'
          />
          <div className='form-grid-2'>
            <TextField
              onChange={(value) => setRoomDraftField('homeName', value)}
              placeholder='Home team'
              value={roomDraft.homeName}
            />
            <TextField
              onChange={(value) => setRoomDraftField('awayName', value)}
              placeholder='Away team'
              value={roomDraft.awayName}
            />
          </div>
          <TextField
            onChange={(value) => setRoomDraftField('round', value)}
            placeholder='Competition or round'
            value={roomDraft.round}
          />
          <MenuButton
            disabled={!roomDraft.homeName.trim() || !roomDraft.awayName.trim()}
            type='submit'
          >
            Create match room
          </MenuButton>
          {inviteReady ? (
            <CreatedInviteActions
              copyInvite={copyInvite}
              copyStatus={copyStatus}
              inviteLink={createdInvite.inviteLink}
              note='Share this room link with fans.'
              onOpenCreated={onOpenCreated}
            />
          ) : null}
        </form>
      ) : null}

      {addTab === 'create' ? (
        <form className='col' onSubmit={onCreateGroup} style={{ gap: 10 }}>
          <AvatarPicker
            avatarDataUrl={groupAvatarDataUrl}
            error={groupAvatarError}
            onClear={() => setGroupAvatarDataUrl('')}
            onUpload={uploadGroupAvatar}
            note='Optional image for the sidebar and header.'
            title='Group picture'
          />
          <TextField onChange={setGroupName} placeholder='Group name' value={groupName} />
          {!inviteReady ? (
            <MenuButton disabled={!groupName.trim()} type='submit'>
              Create private group
            </MenuButton>
          ) : (
            <CreatedInviteActions
              copyInvite={copyInvite}
              copyStatus={copyStatus}
              inviteLink={createdInvite.inviteLink}
              note='Anyone with this link can join.'
              onOpenCreated={onOpenCreated}
            />
          )}
        </form>
      ) : null}

      {addTab === 'dm' ? (
        <form className='col' onSubmit={onCreateDm} style={{ gap: 10 }}>
          <div className='dm-link-card'>
            <div className='dm-link-icon'>
              <Link2 size={14} strokeWidth={2.4} />
            </div>
            <div>
              <div className='dm-link-title'>DM by private TIFO link</div>
              <div className='dm-link-copy'>
                Safer than usernames. The link carries the private chat key.
              </div>
            </div>
          </div>
          {!inviteReady ? (
            <MenuButton type='submit'>Create DM link</MenuButton>
          ) : (
            <CreatedInviteActions
              copyInvite={copyInvite}
              copyStatus={copyStatus}
              inviteLink={createdInvite.inviteLink}
              note='Send this link to the person you want to DM.'
              onOpenCreated={onOpenCreated}
            />
          )}
        </form>
      ) : null}
    </div>
  )
}

function CreatedInviteActions({ copyInvite, copyStatus, inviteLink, note, onOpenCreated }) {
  return (
    <>
      <div className='input' style={{ background: 'var(--bg-0)' }}>
        <span className='prefix'>
          <Link2 size={12} />
        </span>
        <input onFocus={(event) => event.currentTarget.select()} readOnly value={inviteLink} />
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
      <div className='t-xs c-mute'>{note}</div>
    </>
  )
}

function AvatarPicker({ avatarDataUrl, error, note, onClear, onUpload, title }) {
  const inputRef = useRef(null)
  return (
    <div className='group-avatar-picker'>
      <button
        className='group-avatar-button'
        onClick={() => inputRef.current?.click()}
        type='button'
      >
        {avatarDataUrl ? (
          <img alt='Group avatar' src={avatarDataUrl} />
        ) : (
          <ImagePlus size={17} strokeWidth={2.4} />
        )}
      </button>
      <div className='grow col' style={{ gap: 2 }}>
        <div className='group-avatar-title'>{title}</div>
        <div className='t-xs c-mute'>{note}</div>
        {error ? <div className='t-xs avatar-error'>{error}</div> : null}
      </div>
      {avatarDataUrl ? (
        <button className='btn ghost sm' onClick={onClear} type='button'>
          Clear
        </button>
      ) : null}
      <input
        accept='image/png,image/jpeg,image/webp'
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          onUpload(file)
        }}
        ref={inputRef}
        type='file'
      />
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
