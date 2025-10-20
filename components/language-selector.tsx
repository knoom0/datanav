"use client";

import { ActionIcon, Menu, Text } from "@mantine/core";
import { IconCheck, IconLanguage } from "@tabler/icons-react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";

import { setLocale } from "@/actions/locale";
import { localeOptions } from "@/lib/i18n/config";

export function LanguageSelector() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleSelect = (value: string) => {
    if (value === locale) {
      return;
    }

    startTransition(async () => {
      await setLocale(value);
      router.refresh();
    });
  };

  return (
    <Menu shadow="md" width={180} withinPortal>
      <Menu.Target>
        <ActionIcon variant="subtle" size="lg" aria-label={t("Language")}>
          <IconLanguage size={20} />
        </ActionIcon>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>
          <Text size="xs" fw={600} tt="uppercase">
            {t("Language")}
          </Text>
        </Menu.Label>
        {localeOptions.map(({ value, label }) => (
          <Menu.Item
            key={value}
            leftSection={value === locale ? <IconCheck size="0.9rem" /> : null}
            onClick={() => handleSelect(value)}
            disabled={isPending}
          >
            {label}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
