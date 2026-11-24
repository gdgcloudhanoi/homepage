import Image from "next/image";

import {
  // DiscordIcon,
  FacebookIcon,
  GitHubIcon,
  InstagramIcon,
  LinkedInIcon,
  XIcon,
} from "@/components/ui/social";

const socials = [
  // { Icon: DiscordIcon, href: "" },
  { Icon: GitHubIcon, href: "https://github.com/gdgcloudhanoi" },
  { Icon: FacebookIcon, href: "https://www.facebook.com/GDGCloudHanoi" },
  { Icon: InstagramIcon, href: "https://www.instagram.com/gdg.cloudhanoi/" },
  {
    Icon: LinkedInIcon,
    href: "https://www.linkedin.com/company/gdgcloudhanoi",
  },
  { Icon: XIcon, href: "https://x.com/GDGCloudHanoi" },
];

const Header = () => {
  return (
    <header className="sticky top-0 z-10 border-b border-hairline bg-canvas text-ink">
      <nav className="flex h-20 items-center justify-between gap-4 px-6 font-medium lg:px-20">
        <Image
          src="/gdgcloudhanoi.png"
          alt="GDG Cloud Hanoi - Logo"
          width={3646}
          height={759}
          priority
          className="h-8 w-auto"
        />

        <div className="flex items-center gap-8">
          <ul className="hidden items-center gap-4 text-mute md:flex">
            {socials.map(({ Icon, href }) => (
              <li key={href}>
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-ink"
                >
                  <Icon />
                </a>
              </li>
            ))}
          </ul>
        </div>
      </nav>
    </header>
  );
};

export default Header;
