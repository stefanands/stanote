export type IconName =
  | 'files'
  | 'terminal'
  | 'search'
  | 'refresh'
  | 'close'
  | 'more'
  | 'sun'
  | 'moon'
  | 'chevron'
  | 'layout-left'
  | 'layout-right'
  | 'layout-sidebar'
  | 'file-plus'
  | 'folder-plus'
  | 'rename'
  | 'trash'
  | 'reveal'
  | 'copy'
  | 'check'
  | 'folder'
  | 'folder-open'
  | 'file'
  | 'file-text'
  | 'file-image'
  | 'file-code'

const paths: Record<IconName, JSX.Element> = {
  chevron: <polyline points="6 3.5 10.5 8 6 12.5" />,
  'layout-left': (
    <>
      <rect x="2" y="3" width="6.4" height="10" rx="1" />
      <rect x="10" y="3" width="4" height="4.4" rx="1" />
      <rect x="10" y="8.6" width="4" height="4.4" rx="1" />
    </>
  ),
  'layout-right': (
    <>
      <rect x="7.6" y="3" width="6.4" height="10" rx="1" />
      <rect x="2" y="3" width="4" height="4.4" rx="1" />
      <rect x="2" y="8.6" width="4" height="4.4" rx="1" />
    </>
  ),
  'layout-sidebar': (
    <>
      <rect x="2" y="3" width="3.4" height="10" rx="1" />
      <rect x="7" y="3" width="7" height="5.4" rx="1" />
      <rect x="7" y="9.6" width="7" height="3.4" rx="1" />
    </>
  ),
  'file-plus': (
    <>
      <path d="M4 2.5h4.5L12 6v7.5H4z" />
      <line x1="8" y1="7.5" x2="8" y2="11" />
      <line x1="6.25" y1="9.25" x2="9.75" y2="9.25" />
    </>
  ),
  'folder-plus': (
    <>
      <path d="M2 4h4l1.3 1.6H14v7.4H2z" />
      <line x1="8" y1="8" x2="8" y2="11.4" />
      <line x1="6.3" y1="9.7" x2="9.7" y2="9.7" />
    </>
  ),
  rename: (
    <>
      <path d="M9.5 3.5 12.5 6.5 6 13H3v-3z" />
      <line x1="8.5" y1="4.5" x2="11.5" y2="7.5" />
    </>
  ),
  trash: (
    <>
      <polyline points="3 4.5 13 4.5" />
      <path d="M5.5 4.5V13h5V4.5" />
      <path d="M6.5 4.5V3h3v1.5" />
    </>
  ),
  reveal: (
    <>
      <path d="M12.5 9v3.5H3.5V4H7" />
      <polyline points="9.5 3 13 3 13 6.5" />
      <line x1="13" y1="3" x2="8" y2="8" />
    </>
  ),
  files: <path d="M2 4h4l1.3 1.6H14v7.4H2z" />,
  copy: (
    <>
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 2.5h-8v8" />
    </>
  ),
  check: <polyline points="3 8.5 6.5 12 13 4.5" />,
  folder: <path d="M2 4h4l1.3 1.6H14v7.4H2z" />,
  'folder-open': (
    <>
      <path d="M2 13V4h4l1.3 1.6H13v1.9" />
      <path d="M2 13l1.7-5.5h11L13 13H2z" />
    </>
  ),
  file: (
    <>
      <path d="M4 2.5h4.5L12 6v7.5H4z" />
      <polyline points="8.5 2.5 8.5 6 12 6" />
    </>
  ),
  'file-text': (
    <>
      <path d="M4 2.5h4.5L12 6v7.5H4z" />
      <polyline points="8.5 2.5 8.5 6 12 6" />
      <line x1="6" y1="8.75" x2="10" y2="8.75" />
      <line x1="6" y1="11" x2="9" y2="11" />
    </>
  ),
  'file-image': (
    <>
      <path d="M4 2.5h4.5L12 6v7.5H4z" />
      <polyline points="8.5 2.5 8.5 6 12 6" />
      <circle cx="6.7" cy="8.4" r="0.75" />
      <path d="M5.5 12l1.9-2.1 1.2 1.3 0.9-1 1.4 1.8" />
    </>
  ),
  'file-code': (
    <>
      <path d="M4 2.5h4.5L12 6v7.5H4z" />
      <polyline points="8.5 2.5 8.5 6 12 6" />
      <polyline points="6.6 8.2 5.4 9.6 6.6 11" />
      <polyline points="9.4 8.2 10.6 9.6 9.4 11" />
    </>
  ),
  terminal: (
    <>
      <polyline points="3.5 5.5 6.5 8 3.5 10.5" />
      <line x1="8" y1="11" x2="12.5" y2="11" />
    </>
  ),
  search: (
    <>
      <circle cx="7" cy="7" r="4" />
      <line x1="10" y1="10" x2="13.5" y2="13.5" />
    </>
  ),
  refresh: (
    <>
      <path d="M12.6 8a4.6 4.6 0 1 1-1.4-3.3" />
      <polyline points="12.9 3.4 12.9 5.6 10.7 5.6" />
    </>
  ),
  close: (
    <>
      <line x1="4" y1="4" x2="12" y2="12" />
      <line x1="12" y1="4" x2="4" y2="12" />
    </>
  ),
  more: (
    <>
      <circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  sun: (
    <>
      <circle cx="8" cy="8" r="3" />
      <line x1="8" y1="1.5" x2="8" y2="3" />
      <line x1="8" y1="13" x2="8" y2="14.5" />
      <line x1="1.5" y1="8" x2="3" y2="8" />
      <line x1="13" y1="8" x2="14.5" y2="8" />
      <line x1="3.4" y1="3.4" x2="4.5" y2="4.5" />
      <line x1="11.5" y1="11.5" x2="12.6" y2="12.6" />
      <line x1="12.6" y1="3.4" x2="11.5" y2="4.5" />
      <line x1="4.5" y1="11.5" x2="3.4" y2="12.6" />
    </>
  ),
  moon: <path d="M13 9.3A5.2 5.2 0 0 1 6.7 3 5.6 5.6 0 1 0 13 9.3Z" />
}

interface Props {
  name: IconName
  size?: number
}

export default function Icon({ name, size = 16 }: Props): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
