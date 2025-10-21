"use client";

import { Badge, Button, Card, Container, Group, Paper, Select, Stack, Text, TextInput, Title, Accordion, Code, ScrollArea } from "@mantine/core";
import { IconSearch, IconPackage, IconTag, IconCode, IconRefresh, IconPlus } from "@tabler/icons-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, useTransition, useEffect } from "react";

import {
  getComponentsAction,
  searchComponentsAction,
  getPackageNamesAction,
  getComponentCountAction,
  getSearchComponentCountAction
} from "@/actions/component";
import { useAppTitle } from "@/components/app-title-context";
import { ComponentInfo } from "@/lib/types";

const ITEMS_PER_PAGE = 20;

export default function ComponentsPage() {
  const { setTitle } = useAppTitle();
  const [components, setComponents] = useState<(ComponentInfo & { createdAt: string; updatedAt: string })[]>([]);
  const [packages, setPackages] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [totalCount, setTotalCount] = useState<number>(0);
  const t = useTranslations();
  const format = useFormatter();
  const visibleCount = components.length;
  const totalSummary = totalCount === 1
    ? t("{{count}} component total", { count: format.number(totalCount) })
    : t("{{count}} components total", { count: format.number(totalCount) });
  const loadedSummary = visibleCount !== totalCount
    ? t("({{count}} loaded)", { count: format.number(visibleCount) })
    : "";

  const loadComponents = async (reset = true) => {
    try {
      const [componentsData, packagesData, totalCountData] = await Promise.all([
        getComponentsAction({ offset: reset ? 0 : components.length, limit: ITEMS_PER_PAGE }),
        getPackageNamesAction(),
        getComponentCountAction()
      ]);
      
      startTransition(() => {
        if (reset) {
          setComponents(componentsData);
          setIsSearching(false);
        } else {
          setComponents(prev => [...prev, ...componentsData]);
        }
        
        setPackages(packagesData);
        setTotalCount(totalCountData);
        setHasMore(componentsData.length === ITEMS_PER_PAGE);
      });
    } catch (error) {
      console.error("Failed to load components:", error);
    }
  };

  const handleSearch = async () => {
    setIsSearching(true);
    
    try {
      const searchParams = {
        query: query || undefined,
        packageName: selectedPackage || undefined
      };
      
      const [results, searchCount] = await Promise.all([
        searchComponentsAction({
          ...searchParams,
          offset: 0,
          limit: ITEMS_PER_PAGE
        }),
        getSearchComponentCountAction(searchParams)
      ]);
      
      startTransition(() => {
        setComponents(results);
        setTotalCount(searchCount);
        setHasMore(results.length === ITEMS_PER_PAGE);
      });
      

    } catch (error) {
      console.error("Failed to search components:", error);
      setIsSearching(false);
    }
  };

  const loadMoreComponents = async () => {
    setIsLoadingMore(true);
    try {
      if (isSearching) {
        const searchParams = {
          query: query || undefined,
          packageName: selectedPackage || undefined
        };
        
        const results = await searchComponentsAction({
          ...searchParams,
          offset: components.length,
          limit: ITEMS_PER_PAGE
        });
        setComponents(prev => [...prev, ...results]);
        setHasMore(results.length === ITEMS_PER_PAGE);
      } else {
        await loadComponents(false);
      }
    } catch (error) {
      console.error("Failed to load more components:", error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleReset = async () => {
    setQuery("");
    setSelectedPackage(null);
    setIsSearching(false);
    await loadComponents(true);
  };

  useEffect(() => {
    setTitle(t("Components"));
    loadComponents(true);
  }, [setTitle, t]);
  
  return (
    <Container size="xl" py="md">
        <Stack gap="lg">
          <Group justify="flex-end">
            <Text c="dimmed">
              {totalSummary}
              {loadedSummary && (
                <Text span c="dimmed" size="sm"> {loadedSummary}</Text>
              )}
            </Text>
          </Group>

        {/* Search and Filter Controls */}
        <Paper p="md" withBorder>
          <Stack gap="md">
            <Group grow>
              <TextInput
                placeholder={t("Search components...")}
                value={query}
                onChange={(event) => setQuery(event.currentTarget.value)}
                leftSection={<IconSearch size={16} />}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSearch();
                  }
                }}
              />
              <Select
                placeholder={t("Filter by package")}
                value={selectedPackage}
                onChange={setSelectedPackage}
                data={packages.map(pkg => ({ value: pkg, label: pkg }))}
                leftSection={<IconPackage size={16} />}
                clearable
              />
            </Group>
            <Group>
              <Button
                onClick={handleSearch}
                loading={isPending}
                leftSection={<IconSearch size={16} />}
              >
                {t("Search")}
              </Button>
              <Button
                variant="light"
                onClick={handleReset}
                leftSection={<IconRefresh size={16} />}
              >
                {t("Reset")}
              </Button>
            </Group>
          </Stack>
        </Paper>

        {/* Components List */}
        {isPending ? (
          <Text ta="center" py="xl">{t("Loading components...")}</Text>
        ) : components.length === 0 ? (
          <Paper p="xl" ta="center">
            <Text size="lg" c="dimmed">{t("No components found")}</Text>
            <Text size="sm" c="dimmed" mt="xs">
              {t("Try adjusting your search criteria or indexing some components first.")}
            </Text>
          </Paper>
        ) : (
          <Stack gap="md">
            {components.map((component) => (
              <Card key={component.name} shadow="sm" padding="lg" radius="md" withBorder>
                <Stack gap="md">
                  <Group justify="space-between">
                    <Group>
                      <Title order={3}>{component.name}</Title>
                      <Badge variant="light" leftSection={<IconPackage size={14} />}>
                        {component.packageName}@{component.packageVersion}
                      </Badge>
                    </Group>
                    <Text size="xs" c="dimmed">
                      {new Date(component.updatedAt).toLocaleDateString(locale)}
                    </Text>
                  </Group>

                  <Text>{component.description}</Text>

                  {component.keywords && component.keywords.length > 0 && (
                    <Group gap="xs">
                      <IconTag size={16} />
                      {component.keywords.map((keyword: string) => (
                        <Badge key={keyword} size="sm" variant="outline">
                          {keyword}
                        </Badge>
                      ))}
                    </Group>
                  )}

                  <Accordion variant="contained">
                    <Accordion.Item value="documentation">
                      <Accordion.Control icon={<IconCode size={16} />}>
                        {t("Documentation")}
                      </Accordion.Control>
                      <Accordion.Panel>
                        <ScrollArea h={300}>
                          <Code block p="md">
                            {component.documentation}
                          </Code>
                        </ScrollArea>
                      </Accordion.Panel>
                    </Accordion.Item>
                  </Accordion>
                </Stack>
              </Card>
            ))}

            {/* Load More Button */}
            {hasMore && !isPending && (
              <Group justify="center" mt="md">
                <Button
                  variant="light"
                  size="lg"
                  leftSection={<IconPlus size={16} />}
                  loading={isLoadingMore}
                  onClick={loadMoreComponents}
                >
                  {t("Load More Components")}
                </Button>
              </Group>
            )}
          </Stack>
        )}
      </Stack>
    </Container>
  );
} 