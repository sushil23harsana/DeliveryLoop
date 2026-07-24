import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") || (host.startsWith("localhost") ? "http" : "https");
  const base = new URL(`${protocol}://${host}`);
  const title = "DeliveryLoop - Client UAT Workspace";
  const description = "Move client releases from ready for testing to formally accepted with contextual feedback, retesting, and sign-off.";
  return {
    metadataBase: base,
    title,
    description,
    openGraph: { title, description, type: "website", images: [{ url: new URL("/og-v3.png", base).toString(), width: 1672, height: 941, alt: "DeliveryLoop secure client delivery workflow" }] },
    twitter: { card: "summary_large_image", title, description, images: [new URL("/og-v3.png", base).toString()] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // Dark is the default theme; the client flips this attribute when the
    // stored preference says otherwise, so SSR never renders a light flash.
    <html lang="en" data-theme="dark">
      <body
        className={`${geist.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
