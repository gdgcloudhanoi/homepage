import { Providers } from "./providers";

export default function Layout({ children }: LayoutProps<"/events">) {
  return <Providers>{children}</Providers>;
}
