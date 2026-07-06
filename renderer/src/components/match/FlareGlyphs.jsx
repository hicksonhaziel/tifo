export function GoalGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <g opacity='0.62' stroke='currentColor' strokeWidth='1'>
        <path d='M4 8h32v22l-16 6-16-6z' />
        <path d='M4 14h32M4 20h32M4 26h32M10 8v24M16 8v26M20 8v28M24 8v26M30 8v24' />
      </g>
      <circle cx='20' cy='20' fill='#f3f0e8' r='7' stroke='#111519' strokeWidth='1' />
      <path d='M20 15l2.9 2-1.1 3.4h-3.6L17.1 17z' fill='#111519' />
      <path
        d='M20 15v-3M22.9 17l2.4-1.2M21.8 20.4l1.8 2.4M18.2 20.4l-1.8 2.4M17.1 17l-2.4-1.2'
        stroke='#111519'
        strokeWidth='0.8'
      />
    </svg>
  )
}

export function SaveGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <path
        d='M8 24c0-6 4-9 8-9v-5c0-2 2-3 3-3s3 1 3 3v5h2v-4c0-2 2-3 3-3s3 1 3 3v5h1c2 0 3 2 3 4v8c0 4-4 6-8 6H14c-4 0-6-4-6-6z'
        fill='currentColor'
        fillOpacity='0.15'
        stroke='currentColor'
        strokeLinejoin='round'
        strokeWidth='1.6'
      />
      <circle cx='6' cy='14' r='2.8' stroke='currentColor' strokeWidth='1.4' />
      <path
        d='M6 11.2v5.6M3.2 14h5.6M9 12L5 8M12 10l-2-5M15 9V4'
        opacity='0.75'
        stroke='currentColor'
        strokeLinecap='round'
        strokeWidth='1.25'
      />
    </svg>
  )
}

export function FoulGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <rect
        fill='currentColor'
        fillOpacity='0.12'
        height='22'
        rx='2'
        stroke='currentColor'
        strokeWidth='1.8'
        transform='rotate(-8 18 19)'
        width='16'
        x='10'
        y='8'
      />
      <rect
        fill='currentColor'
        fillOpacity='0.22'
        height='22'
        rx='2'
        stroke='currentColor'
        strokeWidth='1.8'
        transform='rotate(8 24 23)'
        width='16'
        x='16'
        y='12'
      />
    </svg>
  )
}

export function VarGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <rect height='20' rx='2' stroke='currentColor' strokeWidth='1.8' width='28' x='6' y='10' />
      <path d='M12 34l8-4 8 4' stroke='currentColor' strokeLinejoin='round' strokeWidth='1.6' />
      <text
        fill='currentColor'
        fontFamily='Arial, sans-serif'
        fontSize='10'
        fontWeight='800'
        letterSpacing='1'
        textAnchor='middle'
        x='20'
        y='24'
      >
        VAR
      </text>
    </svg>
  )
}

export function WhistleGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <path
        d='M6 20l16-5 10 3v8l-10 3-16-5z'
        fill='currentColor'
        fillOpacity='0.15'
        stroke='currentColor'
        strokeLinejoin='round'
        strokeWidth='1.6'
      />
      <rect fill='currentColor' height='4' width='4' x='4' y='20' />
      <circle cx='27' cy='22' fill='currentColor' fillOpacity='0.45' r='2.5' />
      <path
        d='M34 14c3 2 3 10 0 12M36 11c4 3 4 15 0 18'
        opacity='0.75'
        stroke='currentColor'
        strokeLinecap='round'
        strokeWidth='1.2'
      />
    </svg>
  )
}

export function FireGlyph({ size = 20 }) {
  return (
    <svg aria-hidden='true' fill='none' height={size} viewBox='0 0 40 40' width={size}>
      <path
        d='M20 6c2 6 8 8 8 16 0 6-4 10-8 10s-8-4-8-10c0-4 3-6 5-10 1 2 2 4 3 2 0-2-1-4 0-8z'
        fill='currentColor'
        fillOpacity='0.18'
        stroke='currentColor'
        strokeLinejoin='round'
        strokeWidth='1.8'
      />
      <path
        d='M20 18c1 4 4 4 4 8 0 3-2 4-4 4s-4-2-4-4c0-3 3-3 4-8z'
        fill='currentColor'
        fillOpacity='0.6'
      />
    </svg>
  )
}

export function ReactionGlyph({ size = 20, type }) {
  if (type === 'goal') return <GoalGlyph size={size} />
  if (type === 'save') return <SaveGlyph size={size} />
  if (type === 'var') return <VarGlyph size={size} />
  if (type === 'full-time') return <WhistleGlyph size={size} />
  if (type === 'penalty' || type === 'red-card') return <FoulGlyph size={size} />
  return <FireGlyph size={size} />
}
