import type { Metadata } from "next";
import "./styles.css";

export const metadata: Metadata = {
  title: "ChatWave — Private messages",
  description: "A modern private messaging app."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
