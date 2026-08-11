import type { Metadata } from "next";
import { Archivo, Martian_Mono } from "next/font/google";
import "./globals.css";

// Archivo carries both the display and body voices via its width axis —
// "condensed" is a variation setting, not a second font file.
const archivo = Archivo({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// Martian Mono carries the data voice: LIVE, timers, counts.
const martian = Martian_Mono({
  subsets: ["latin"],
  axes: ["wdth"],
  variable: "--font-martian",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Earshot",
  description: "Live audio rooms.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} ${martian.variable} antialiased`}>
      <body>
        {/*
          #app is the query container. Its size is written from MeWe's
          HOST_DISPLAY_RESPONSE — never from the viewport. See globals.css.
        */}
        <div id="app">{children}</div>
      </body>
    </html>
  );
}
