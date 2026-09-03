import type { Metadata } from "next";
import { Inter, Kaushan_Script } from "next/font/google";
import "./globals.css";
import { ReportIssueButton } from "./ReportIssueButton";
import { AssistBar } from "./AssistBar";
import { ConfigError, missingRequiredEnv } from "./ConfigCheck";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const kaushanScript = Kaushan_Script({
  variable: "--font-script",
  weight: "400",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Order Desk",
  description: "Order-management platform for apparel shops.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Checked here rather than per page: without these, every route throws
  // on its first Supabase call, so there is no page that could usefully
  // report it.
  const missing = missingRequiredEnv();

  return (
    <html
      lang="en"
      className={`${inter.variable} ${kaushanScript.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        {missing.length > 0 ? (
          <ConfigError missing={missing} />
        ) : (
          <>
            <AssistBar />
            {children}
            <ReportIssueButton />
          </>
        )}
      </body>
    </html>
  );
}
