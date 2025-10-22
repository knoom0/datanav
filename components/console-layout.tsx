"use client";

import "@/app/globals.css";
import "@mantine/core/styles.css";
import "@mantine/charts/styles.css";
import "@gfazioli/mantine-split-pane/styles.css";

import { AppShell, AppShellHeader, AppShellMain, AppShellNavbar, Burger, Group, Text, ActionIcon, Stack, ScrollArea, Image } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconBuilding, IconDatabase, IconComponents, IconPlus } from "@tabler/icons-react";
import Link from "next/link";
import type React from "react";

import { useTranslations } from "next-intl";

import { useAppTitle } from "@/components/app-title-context";
import { LanguageSelector } from "@/components/language-selector";
import { UserProfile } from "@/components/user-profile";

const navbarConfig = [
  { icon: <IconBuilding size={24} />, label: "New Chat", href: "/chat" },
  { icon: <IconDatabase size={24} />, label: "Data", href: "/data" },
  { icon: <IconComponents size={24} />, label: "Components", href: "/components" },
];

export function ConsoleLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [opened, { toggle, close }] = useDisclosure();
  const { title } = useAppTitle();
  const t = useTranslations();

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
            <Text size="lg" fw={500}>{title}</Text>
          </Group>

          <Group gap="xs">
            <LanguageSelector />
            <ActionIcon
              component={Link}
              href="/chat"
              variant="subtle"
              size="xl"
              aria-label={t("New Chat")}
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
                    <Text ml={8}>{t(item.label)}</Text>
                  </Link>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
          <UserProfile />
        </Stack>
      </AppShellNavbar>

      <AppShellMain>
        {children}
      </AppShellMain>
    </AppShell>
  );
}
