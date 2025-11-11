"use client";

import { Stack, Text, Group, Collapse, UnstyledButton, ScrollArea, ActionIcon, Modal } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown, IconChevronRight, IconMessage, IconTrash } from "@tabler/icons-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useRef } from "react";

import { AgentSessionInfo } from "@/lib/types";

interface ChatSessionListProps {
  onItemClick?: () => void;
}

export function ChatSessionList({ onItemClick }: ChatSessionListProps) {
  const [sessions, setSessions] = useState<AgentSessionInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [opened, { toggle }] = useDisclosure(true);
  const [deleteModalOpened, { open: openDeleteModal, close: closeDeleteModal }] = useDisclosure(false);
  const [sessionToDelete, setSessionToDelete] = useState<AgentSessionInfo | null>(null);
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const pathname = usePathname();
  const router = useRouter();
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

  const handleDeleteClick = (session: AgentSessionInfo, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSessionToDelete(session);
    openDeleteModal();
  };

  const handleDeleteConfirm = async () => {
    if (!sessionToDelete) return;

    const sessionId = sessionToDelete.id;
    closeDeleteModal();
    setSessionToDelete(null);

    // Optimistically remove from UI
    setSessions(prevSessions => prevSessions.filter(s => s.id !== sessionId));

    // If we're currently on the deleted session, redirect to /chat
    if (pathname === `/chat/${sessionId}`) {
      router.push("/chat");
    }

    // Delete from server
    await fetch(`/api/agent/chatbot/session/${sessionId}`, {
      method: "DELETE"
    }).catch(() => {
      // If delete fails, refetch to restore the session
      fetchSessions();
    });
  };

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
              const isHovered = hoveredSessionId === session.id;
              return (
                <Group 
                  key={session.id} 
                  gap="xs"
                  style={{ position: "relative" }}
                  onMouseEnter={() => setHoveredSessionId(session.id)}
                  onMouseLeave={() => setHoveredSessionId(null)}
                >
                  <Link 
                    href={`/chat/${session.id}`}
                    style={{ 
                      display: "flex", 
                      alignItems: "center", 
                      textDecoration: "none", 
                      color: "inherit",
                      flex: 1,
                      minWidth: 0
                    }}
                    onClick={onItemClick}
                  >
                    <IconMessage size={24} style={{ flexShrink: 0 }} />
                    <Text 
                      ml={8} 
                      style={{ 
                        overflow: "hidden", 
                        textOverflow: "ellipsis", 
                        whiteSpace: "nowrap" 
                      }}
                    >
                      {displayTitle}
                    </Text>
                  </Link>
                  {isHovered && (
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={(e) => handleDeleteClick(session, e)}
                      style={{ flexShrink: 0 }}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  )}
                </Group>
              );
            })}
          </Stack>
        </ScrollArea>
      </Collapse>

      <Modal
        opened={deleteModalOpened}
        onClose={closeDeleteModal}
        title="Delete Chat Session"
        centered
      >
        <Stack gap="md">
          <Text>
            Are you sure you want to delete &quot;{sessionToDelete?.title || "New conversation"}&quot;? 
            This action cannot be undone.
          </Text>
          <Group justify="flex-end" gap="sm">
            <UnstyledButton onClick={closeDeleteModal}>
              <Text>Cancel</Text>
            </UnstyledButton>
            <UnstyledButton onClick={handleDeleteConfirm}>
              <Text c="red">Delete</Text>
            </UnstyledButton>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

