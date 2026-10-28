import type { Metadata, Viewport } from "next";
import { Fraunces, Outfit } from "next/font/google";
import { RegisterServiceWorker } from "@/components/RegisterServiceWorker";
import { getItinerary } from "@/lib/itinerary";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

const trip = getItinerary().trip;

export const metadata: Metadata = {
  title: trip.title,
  description: trip.subtitle,
  applicationName: trip.title,
  appleWebApp: {
    title: trip.title,
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: trip.title,
    description: trip.subtitle,
    siteName: trip.title,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: trip.title,
    description: trip.subtitle,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#100e0c",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fraunces.variable} ${outfit.variable} h-full antialiased`}>
      <body className="min-h-dvh bg-ink font-sans text-cream">
        <RegisterServiceWorker />
        {children}
      </body>
    </html>
  );
}
