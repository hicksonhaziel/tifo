import { motion } from 'framer-motion'
import { ArrowRight, Check, Flag, Lock, Users } from 'lucide-react'
import { useMemo, useState } from 'react'

import { normalizeUsername } from '../../tifo/identity.js'

const entrance = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, transition: { duration: 0.42, ease: 'easeOut' }, y: 0 }
}

const stagger = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.075
    }
  }
}

const featureRows = [
  {
    description: 'Your profile lives on this device',
    icon: Users,
    title: 'Just for you'
  },
  {
    description: 'You choose who joins your rooms',
    icon: Lock,
    title: 'Private by default'
  },
  {
    description: "Pick a name — you're in for good",
    icon: Flag,
    title: 'One-time setup'
  }
]

export function OnboardingView({ actions, state }) {
  const [rawUsername, setRawUsername] = useState('haziel')
  const [localError, setLocalError] = useState('')
  const username = useMemo(() => normalizeUsername(rawUsername).slice(0, 16), [rawUsername])
  const ready = /^[a-z0-9_]{3,16}$/.test(username)
  const displayUsername = username || 'username'

  function submitForm(event) {
    event.preventDefault()
    if (!ready) {
      setLocalError('Use 3-16 lowercase letters, numbers, or underscores')
      return
    }

    setLocalError('')
    actions.createProfile({ username })
  }

  return (
    <main
      className='tifo-onboarding fixed inset-0 z-50 flex overflow-hidden text-[#F1EEE8]'
      style={{
        background:
          'radial-gradient(80% 60% at 50% -10%, rgba(111,168,144,0.10), transparent 60%), #0F1113',
        '--bg': '#0F1113',
        '--panel': '#14171A'
      }}
    >
      <div className='pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.02)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.02)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(60%_50%_at_50%_40%,black,transparent_80%)]' />

      <motion.section
        className='relative z-10 m-auto grid w-full max-w-[1080px] grid-cols-1 items-center gap-10 px-6 py-14 md:grid-cols-[1.05fr_1fr] md:gap-16 md:px-14'
        initial='hidden'
        animate='show'
        variants={stagger}
      >
        <motion.div className='flex min-w-0 flex-col gap-8' variants={stagger}>
          <motion.div className='flex flex-col gap-4' variants={entrance}>
            <div className='flex min-w-0 items-center gap-3'>
              <span className='inline-flex items-center text-[32px] font-bold leading-none tracking-[-0.02em] text-[#F1EEE8]'>
                tifo<span className='ml-px text-[1.1em] leading-[0.6] text-[#6FA890]'>·</span>
              </span>
              <span className='ml-2 font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B8880]'>
                Living Terrace
              </span>
            </div>

            <h1 className='max-w-[560px] text-[44px] font-bold leading-[1.02] tracking-[-0.03em] text-[#F1EEE8] md:text-[52px]'>
              Claim your <span className='text-[#B8D4C6]'>terrace name.</span>
            </h1>
            <p className='max-w-[460px] text-[15.5px] leading-[1.55] text-[#C7C3BB]'>
              A living terrace for every match. Chants, reactions, clips and DMs — all in one place,
              all stored on your device.
            </p>
          </motion.div>

          <motion.div className='mt-2 flex flex-col gap-0' variants={stagger}>
            {featureRows.map((feature, index) => (
              <FeatureRow feature={feature} index={index} key={feature.title} />
            ))}
          </motion.div>
        </motion.div>

        <motion.form
          className='rounded-2xl border border-white/[0.05] bg-[#14171A] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.42)] md:p-8'
          onSubmit={submitForm}
          variants={entrance}
        >
          <div className='font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#B8D4C6]'>
            Step 01 · Your name
          </div>
          <h2 className='mb-2 mt-2.5 text-[30px] font-bold leading-tight tracking-[-0.025em] text-[#F1EEE8]'>
            Pick a name for the terrace
          </h2>
          <p className='mb-6 text-[14px] leading-[1.55] text-[#C7C3BB]'>
            This is how everyone will see you in chats, reactions and chants. You can't change it
            later on this device.
          </p>

          <label className='block'>
            <span className='font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B8880]'>
              Username
            </span>
            <div className='mt-2 flex h-[50px] items-center gap-2 rounded-lg border border-white/[0.09] bg-[#14171A] px-4 text-[16px] text-[#F1EEE8] shadow-none transition focus-within:border-[#6FA890]/50 focus-within:ring-4 focus-within:ring-[#6FA890]/10'>
              <span className='font-mono text-[16px] text-[#8B8880]'>@</span>
              <input
                className='min-w-0 flex-1 border-0 bg-transparent text-[16px] text-inherit outline-none'
                autoComplete='username'
                autoFocus
                maxLength='16'
                placeholder='haziel'
                value={rawUsername}
                onChange={(event) => {
                  setRawUsername(normalizeUsername(event.currentTarget.value).slice(0, 16))
                  setLocalError('')
                }}
              />
              {ready ? <Check size={16} strokeWidth={2.4} className='text-[#B8D4C6]' /> : null}
            </div>
            <span className='mt-2 block text-[12px] font-medium text-[#8B8880]'>
              3-16 lowercase letters, numbers, or underscores.
            </span>
          </label>

          <ProfilePreview username={displayUsername} ready={ready} />

          <motion.button
            className='mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#5B9078] bg-[#6FA890] px-5 text-[14px] font-bold text-[#0F1113] shadow-[0_6px_20px_-8px_rgba(111,168,144,0.45),inset_0_1px_0_rgba(255,255,255,0.12)] transition hover:bg-[#5B9078] disabled:cursor-not-allowed disabled:opacity-45'
            type='submit'
            disabled={!ready}
            whileTap={ready ? { scale: 0.99 } : undefined}
          >
            Continue to the terrace
            <ArrowRight size={14} strokeWidth={2.4} />
          </motion.button>

          {localError || state.lastError ? (
            <p className='mt-4 rounded-lg border border-[#D4A25A]/35 bg-[#D4A25A]/10 px-3 py-2 text-[13px] font-semibold text-[#f5d7a8]'>
              {localError || state.lastError}
            </p>
          ) : null}

          <div className='mt-4 flex items-center justify-center gap-2 text-[12px] font-medium text-[#8B8880]'>
            <Lock size={11} strokeWidth={2.4} />
            Your name stays on this device.
          </div>
        </motion.form>
      </motion.section>
    </main>
  )
}

function FeatureRow({ feature, index }) {
  const Icon = feature.icon
  return (
    <motion.div
      className={`flex items-center gap-3 py-3 ${index === 0 ? '' : 'border-t border-white/[0.05]'}`}
      variants={entrance}
    >
      <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-white/[0.09] bg-[#1A1E22] text-[#B8D4C6]'>
        <Icon size={14} strokeWidth={2.4} />
      </div>
      <div className='min-w-0'>
        <div className='text-[13.5px] font-semibold text-[#F1EEE8]'>{feature.title}</div>
        <div className='truncate text-[12px] font-medium text-[#8B8880]'>{feature.description}</div>
      </div>
    </motion.div>
  )
}

function ProfilePreview({ username, ready }) {
  const avatar = avatarUrl(username || 'preview')

  return (
    <div className='mt-6'>
      <span className='font-mono text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8B8880]'>
        Preview
      </span>
      <div className='mt-2 rounded-xl border border-white/[0.09] bg-[#0F1113] p-3.5'>
        <div className='flex items-center gap-3'>
          <div className='flex h-[42px] w-[42px] shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/[0.09] bg-[linear-gradient(135deg,#2a2e33,#16191b)]'>
            <img className='block h-full w-full object-cover' src={avatar} alt='' />
          </div>
          <div className='min-w-0 flex-1'>
            <div className='flex min-w-0 items-center gap-2'>
              <span className='truncate text-[14px] font-semibold text-[#F1EEE8]'>@{username}</span>
              <span className='inline-flex items-center rounded-full border border-[#7BC49A]/30 bg-[#7BC49A]/10 px-2 py-[1px] text-[9px] font-semibold uppercase text-[#7BC49A]'>
                Live
              </span>
            </div>
            <div className='text-[12px] font-medium text-[#8B8880]'>on the terrace · online</div>
          </div>
          <span className='inline-flex items-center rounded-full border border-[#6FA890]/30 bg-[#6FA890]/10 px-2 py-[2px] text-[9px] font-semibold uppercase text-[#B8D4C6]'>
            Fan
          </span>
        </div>

        <div className='ml-[54px] mt-2 inline-flex rounded-[4px_12px_12px_12px] border border-white/[0.05] bg-[#22272C] px-3 py-1.5 text-[13.5px] text-[#F1EEE8]'>
          {ready ? 'Welcome to the terrace.' : 'Choose your name.'}
        </div>
      </div>
    </div>
  )
}

function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
    seed
  )}&backgroundColor=1a1e22,22272c,2b3137&backgroundType=solid&radius=50`
}
