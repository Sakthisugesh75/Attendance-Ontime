import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { ServiceWorker } from "@/components/layout/service-worker";
import { ThemeProvider } from "@/components/layout/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

// One typeface, with tabular figures for times and counts (DESIGN.md §3).
const appFont = Outfit({ variable: "--font-app", subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], display: "swap" });

export const metadata: Metadata = {
  title: { default: "Attendance", template: "%s · Attendance" },
  description: "Punch in/out, attendance, leave and reports",
  applicationName: "Attendance",
  appleWebApp: { capable: true, title: "Attendance", statusBarStyle: "default" },
  icons: { icon: "/icons/icon-192.png", apple: "/icons/icon-192.png" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5ecd6" },
    { media: "(prefers-color-scheme: dark)", color: "#15130f" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning className={appFont.variable}>
      <body>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster richColors position="top-center" />
        </ThemeProvider>
        <ServiceWorker />
      </body>
    </html>
  );
}
