import type { MDXComponents } from "mdx/types";

// Required by @next/mdx in the App Router. Posts are styled with `prose` in app/blog/[slug].
const components: MDXComponents = {};

export function useMDXComponents(): MDXComponents {
  return components;
}
