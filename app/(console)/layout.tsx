"use client";

import "@/app/globals.css";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@gfazioli/mantine-split-pane/styles.css";

import { AppShell, AppShellHeader, AppShellMain, AppShellNavbar, Burger, Group, MantineProvider, Text, ActionIcon, Stack, ScrollArea, Image, Divider } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBuilding, IconDatabase, IconPlus, IconClock, IconBook, IconBrain } from "@tabler/icons-react";
import Link from "next/link";

import { AppTitleProvider, useAppTitle } from "@/components/app-title-context";
import { ChatSessionList } from "@/components/chat-session-list";
import { UserProfile } from "@/components/user-profile";

const navbarConfig = [
  { icon: <IconBuilding size={24} />, label: "New Chat", href: "/chat" },
  { icon: <IconClock size={24} />, label: "Pulse", href: "/pulse" },
  { icon: <IconDatabase size={24} />, label: "Data", href: "/data" },
  { icon: <IconBook size={24} />, label: "Playbook", href: "/playbook" },
  { icon: <IconBrain size={24} />, label: "Strategist", href: "/strategist" },
];

function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [opened, { toggle, close }] = useDisclosure();
  const { title } = useAppTitle();

  const handleNavItemClick = () => {
    close();
  };

  return (
    <AppShell
      header={{ height: 60 }}
      navbar={{
        width: { base: 280, sm: 300 },
        breakpoint: "sm",
        collapsed: { mobile: !opened },
      }}
    >
      <AppShellHeader>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} hiddenFrom="sm" size="sm" />
            <Image src="/logo.png" alt="DataNav" h={32} w="auto" />
            <Group gap="xs">
              <Text size="lg" fw={500} visibleFrom="sm">DataNav</Text>
              <Text size="sm" c="dimmed" visibleFrom="sm">&gt;</Text>
              <Text size="lg" fw={500}>{title}</Text>
            </Group>
          </Group>
          
          <Group gap="xs">
            <ActionIcon 
              component={Link} 
              href="/chat" 
              variant="subtle"
              size="xl"
              aria-label="New Chat"
              c="dark"
              onClick={handleNavItemClick}
            >
              <IconPlus size={20} />
            </ActionIcon>
          </Group>
        </Group>
      </AppShellHeader>

      <AppShellNavbar p="md">
        <Stack h="100%" gap={0}>
          <ScrollArea flex={1} scrollbarSize={4}>
            <Stack gap="md">
              {navbarConfig.map((item) => (
                <Group key={item.label} gap="xs">
                  <Link 
                    href={item.href} 
                    style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit" }}
                    onClick={handleNavItemClick}
                  >
                    {item.icon}
                    <Text ml={8}>{item.label}</Text>
                  </Link>
                </Group>
              ))}
              <Divider my="md" />
              <ChatSessionList onItemClick={handleNavItemClick} />
            </Stack>
          </ScrollArea>
          <Divider />
          <UserProfile />
        </Stack>
      </AppShellNavbar>

      <AppShellMain>
        {children}
      </AppShellMain>
    </AppShell>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <MantineProvider theme={{ primaryColor: "orange" }}>
          <AppTitleProvider>
            <ConsoleLayout>
              {children}
            </ConsoleLayout>
          </AppTitleProvider>
        </MantineProvider>
      </body>
    </html>
  );
}
