"use client";

import { Stack, Text, Group, Collapse, UnstyledButton, ScrollArea } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown, IconChevronRight, IconMessage } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, useRef } from "react";

interface AgentSessionInfo {
  id: string;
  title: string | null;
  messageCount: number;
  hasProject: boolean;
  createdAt: string;
  updatedAt: string;
}

interface ChatSessionListProps {
  onItemClick?: () => void;
}

export function ChatSessionList({ onItemClick }: ChatSessionListProps) {
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { toggle }] = useDisclosure(true);
  const pathname = usePathname();
  const lastPathnameRef = useRef<string | null>(null);

  const fetchSessions = async () => {
    try {
      const response = await fetch("/api/agent/chatbot/session");
      if (!response.ok) return;
      
      const data = await response.json();
      // Sort by updatedAt descending (most recently updated first)
      const sortedSessions = (data.sessions || []).sort((a: AgentSessionInfo, b: AgentSessionInfo) => {
        return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
      });
      setSessions(sortedSessions);
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();

    // Refetch sessions periodically (every 30 seconds)
    const interval = setInterval(() => {
      fetchSessions();
    }, 30000);

    // Refetch when window regains focus
    const handleFocus = () => {
      fetchSessions();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  // Refetch when navigating to a new chat session
  useEffect(() => {
    // Check if we navigated to a chat route
    if (pathname.startsWith("/chat/") && pathname !== lastPathnameRef.current) {
      // Small delay to ensure the session is created in the database
      setTimeout(() => {
        fetchSessions();
      }, 1000);
      lastPathnameRef.current = pathname;
    }
  }, [pathname]);

  if (loading || sessions.length === 0) {
    return null;
  }

  return (
    <>
      <Group gap="xs">
        <UnstyledButton 
          onClick={toggle} 
          style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit" }}
        >
          {opened ? <IconChevronDown size={24} /> : <IconChevronRight size={24} />}
          <Text ml={8}>Chats</Text>
        </UnstyledButton>
      </Group>
      <Collapse in={opened}>
        <ScrollArea mah={300} scrollbarSize={4}>
          <Stack gap="xs">
            {sessions.map((session) => {
              const displayTitle = session.title || "New conversation";
              return (
                <Group key={session.id} gap="xs">
                  <Link 
                    href={`/chat/${session.id}`}
                    style={{ display: "flex", alignItems: "center", textDecoration: "none", color: "inherit" }}
                    onClick={onItemClick}
                  >
                    <IconMessage size={24} />
                    <Text ml={8}>{displayTitle}</Text>
                  </Link>
                </Group>
              );
            })}
          </Stack>
        </ScrollArea>
      </Collapse>
    </>
  );
}

