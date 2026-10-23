import "./globals.css";

export const metadata = {
  title: "Chatbeep",
  description: "Private messaging app",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="bg-black text-slate-100 antialiased">{children}</body>
    </html>
  );
}
