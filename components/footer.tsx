import { ConsentSettingsButton } from "@/components/analytics";

const links = [
  { label: "GitHub", href: "https://github.com/gdgcloudhanoi" },
  { label: "Facebook", href: "https://www.facebook.com/GDGCloudHanoi" },
  {
    label: "LinkedIn",
    href: "https://www.linkedin.com/company/gdgcloudhanoi",
  },
  {
    label: "Bevy",
    href: "https://gdg.community.dev/gdg-cloud-hanoi/",
    meta: "[8K]",
  },
];

export function Footer() {
  return (
    <footer className="flex flex-wrap border-t border-hairline max-lg:border-b min-[25rem]:flex-nowrap">
      {links.map(({ label, href, meta }) => (
        <div
          key={label}
          className="flex-[1_0_100%] border-hairline text-center not-first:border-t min-[25rem]:flex-1 min-[25rem]:not-first:border-t-0 sm:not-first:border-l"
        >
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="block py-8 transition-colors hover:bg-surface-soft"
          >
            {label}
            {meta && <span className="ml-1 text-mute max-sm:hidden">{meta}</span>}
          </a>
        </div>
      ))}
    </footer>
  );
}

export function Legal({ children = "DevFest Cloud Hanoi 2026" }: { children?: React.ReactNode }) {
  return (
    <div className="mt-16 flex flex-wrap justify-center gap-x-8 gap-y-2 px-6 text-caption text-mute">
      <span>{children}</span>
      <ConsentSettingsButton />
    </div>
  );
}
