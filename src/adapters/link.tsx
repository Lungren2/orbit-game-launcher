import type { AnchorHTMLAttributes } from 'react';

// Keep the registry source intact while resolving Next's Link to an anchor in Vite.
export default function Link({ href, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a href={href} {...props}>{children}</a>;
}
