import type { ReactNode, SVGProps } from "react";

export type IconName =
  | "plus" | "sparkle" | "collapse" | "copy" | "download"
  | "sliders" | "sidebar" | "search" | "pin" | "trash"
  | "check" | "x" | "file";

const PATHS: Record<IconName, ReactNode> = {
  plus: <path d="M8 3.5v9M3.5 8h9" />,
  sparkle: (
    <>
      <path d="M7.2 2.6l1.05 2.85L11.1 6.5 8.25 7.55 7.2 10.4 6.15 7.55 3.3 6.5l2.85-1.05L7.2 2.6z" />
      <path d="M12.35 9.4l.5 1.35 1.35.5-1.35.5-.5 1.35-.5-1.35-1.35-.5 1.35-.5.5-1.35z" />
    </>
  ),
  collapse: (
    <>
      <path d="M3 6.4h3.4V3M13 6.4H9.6V3" />
      <path d="M3 9.6h3.4V13M13 9.6H9.6V13" />
    </>
  ),
  copy: (
    <>
      <rect x="5.6" y="5.6" width="7.6" height="7.6" rx="1.6" />
      <path d="M3.2 10.4h-.4a1 1 0 0 1-1-1V3.6a1 1 0 0 1 1-1h5.8a1 1 0 0 1 1 1v.4" />
    </>
  ),
  download: <path d="M8 2.6v7.2M5.1 6.9L8 9.8l2.9-2.9M2.8 12.4v1.1h10.4v-1.1" />,
  sliders: (
    <>
      <path d="M2.8 5.2h5.4M11.4 5.2h1.8M2.8 10.8h1.8M7.8 10.8h5.4" />
      <circle cx="9.8" cy="5.2" r="1.5" />
      <circle cx="6.2" cy="10.8" r="1.5" />
    </>
  ),
  sidebar: (
    <>
      <rect x="2.4" y="3.2" width="11.2" height="9.6" rx="2.2" />
      <path d="M9.6 3.2v9.6" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="3.9" />
      <path d="M10.2 10.2l2.9 2.9" />
    </>
  ),
  pin: <path d="M6 2.6h4M8 2.6v4.1l2.4 2.4H5.6L8 6.7V2.6M8 9.1v4.3" />,
  trash: (
    <>
      <path d="M2.9 4.4h10.2M6.1 4.4V2.9h3.8v1.5M4.4 4.4l.55 8.2h6.1l.55-8.2" />
      <path d="M6.7 6.8v3.6M9.3 6.8v3.6" />
    </>
  ),
  check: <path d="M3.4 8.4l2.9 2.9 6.3-6.2" />,
  x: <path d="M4.2 4.2l7.6 7.6M11.8 4.2l-7.6 7.6" />,
  file: (
    <>
      <path d="M4 2.6h4.6L12.4 6.4v7H4z" />
      <path d="M8.4 2.8v3.8h3.8" />
    </>
  ),
};

interface Props extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export default function Icon({ name, size = 16, ...rest }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.55}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {PATHS[name]}
    </svg>
  );
}