import type { SVGProps } from 'react'

const base: SVGProps<SVGSVGElement> = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
}

const icon = (paths: string[]) => (props: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...props}>
    {paths.map((d) => (
      <path key={d} d={d} />
    ))}
  </svg>
)

export const SearchIcon = icon(['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z', 'm21 21-4.3-4.3'])
export const PlusIcon = icon(['M12 5v14', 'M5 12h14'])
export const CloseIcon = icon(['M18 6 6 18', 'm6 6 12 12'])
export const TrashIcon = icon(['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6'])
export const CopyIcon = icon(['M9 9h11v11H9Z', 'M5 15H4V4h11v1'])
export const SunIcon = icon(['M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z', 'M12 1v2', 'M12 21v2', 'M4.2 4.2l1.4 1.4', 'M18.4 18.4l1.4 1.4', 'M1 12h2', 'M21 12h2', 'M4.2 19.8l1.4-1.4', 'M18.4 5.6l1.4-1.4'])
export const MoonIcon = icon(['M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z'])
export const FolderIcon = icon(['M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z'])
export const GlobeIcon = icon(['M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z', 'M3 12h18', 'M12 3a14 14 0 0 1 0 18', 'M12 3a14 14 0 0 0 0 18'])
export const OrbitIcon = icon(['M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'M12 20c5.5 0 10-3.6 10-8s-4.5-8-10-8-10 3.6-10 8 4.5 8 10 8Z', 'M7 19c-2.5-2-2.4-6.9.2-11'])
