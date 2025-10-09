import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";

import { MantineProvider } from "@mantine/core";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "DataNav",
  description: "Your personal AI data analyst",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MantineProvider theme={{ primaryColor: "orange" }} forceColorScheme="light">
          {children}
        </MantineProvider>
      </body>
    </html>
  );
}
