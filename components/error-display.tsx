"use client";

import { Alert, Button, Stack, Text, Modal, Code, Collapse, Group } from "@mantine/core";
import { IconAlertCircle, IconBug, IconExternalLink, IconChevronDown, IconChevronRight } from "@tabler/icons-react";
import { useState, useEffect } from "react";

import { getConfig } from "@/lib/config";

interface ErrorDisplayProps {
  error: Error;
  /** Optional custom error context for better issue description */
  context?: string;
}

interface GitHubIssue {
  number: number;
  title: string;
  html_url: string;
  state: string;
}

/**
 * Component for displaying errors with functionality to lookup and create GitHub issues
 */
export function ErrorDisplay({ error, context }: ErrorDisplayProps) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [existingIssues, setExistingIssues] = useState<GitHubIssue[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [isDetailsExpanded, setIsDetailsExpanded] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  const errorMessage = error.message || "An error occurred while processing your request.";
  const errorStack = error.stack || "";
  const githubRepo = getConfig().github.repo;

  /**
   * Search for existing GitHub issues related to this error
   */
  const searchForIssues = async () => {
    if (!githubRepo) return;

    setIsSearching(true);
    setHasSearched(false);

    // Extract key terms from error message for search
    const searchTerms = extractSearchTerms(errorMessage);
    const query = encodeURIComponent(`repo:${githubRepo} ${searchTerms} in:title,body type:issue`);

    const response = await fetch(
      `https://api.github.com/search/issues?q=${query}&sort=updated&order=desc&per_page=5`
    );

    if (response.ok) {
      const data = await response.json();
      setExistingIssues(data.items || []);
    }

    setIsSearching(false);
    setHasSearched(true);
  };

  // Automatically search for issues when modal opens
  useEffect(() => {
    if (isModalOpen && githubRepo && !hasSearched) {
      searchForIssues();
    }
  }, [isModalOpen]);

  /**
   * Extract meaningful search terms from error message
   */
  const extractSearchTerms = (message: string): string => {
    // Remove common phrases and focus on error-specific content
    const cleaned = message
      .replace(/^Error:\s*/i, "")
      .replace(/\s+at\s+.*/g, "") // Remove stack trace references
      .replace(/\([^)]*\)/g, "") // Remove parenthetical content
      .trim();
    
    // Take first 50 characters as search terms
    return cleaned.substring(0, 50);
  };

  /**
   * Create a new GitHub issue for this error
   */
  const createNewIssue = () => {
    if (!githubRepo) return;

    const title = encodeURIComponent(`Error: ${errorMessage.substring(0, 100)}`);
    const body = encodeURIComponent(
      `## Error Description\n\n${errorMessage}\n\n` +
      `${context ? `## Context\n\n${context}\n\n` : ""}` +
      `## Stack Trace\n\n\`\`\`\n${errorStack}\n\`\`\`\n\n` +
      "---\n*This issue was created from the error display component*"
    );

    const url = `https://github.com/${githubRepo}/issues/new?title=${title}&body=${body}`;
    window.open(url, "_blank");
  };

  return (
    <>
      <Alert
        icon={<IconAlertCircle size={16} />}
        title="Error"
        color="red"
        variant="light"
        style={{ maxWidth: "100%", wordBreak: "break-word" }}
      >
        <Stack gap="xs">
          <Text 
            size="sm" 
            style={{ 
              display: "-webkit-box",
              WebkitLineClamp: 2,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word"
            }}
          >
            {errorMessage}
          </Text>
          <Button
            variant="subtle"
            size="xs"
            color="red"
            leftSection={<IconExternalLink size={14} />}
            onClick={() => setIsModalOpen(true)}
          >
            View Details
          </Button>
        </Stack>
      </Alert>

      {/* Error Details Modal */}
      <Modal
        opened={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        title="Error Details"
        size="lg"
        centered
      >
        <Stack gap="md">
          {/* Error Message */}
          <Stack gap="xs">
            <Text size="sm" fw={600}>Error Message</Text>
            <Code block style={{ whiteSpace: "pre-wrap" }}>
              {errorMessage}
            </Code>
          </Stack>

          {/* Details (Stack Trace + Context) */}
          {(errorStack || context) && (
            <Stack gap="xs">
              <Group 
                gap="xs" 
                onClick={() => setIsDetailsExpanded(!isDetailsExpanded)}
                style={{ cursor: "pointer", userSelect: "none" }}
              >
                {isDetailsExpanded ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
                <Text size="sm" fw={600}>Details</Text>
              </Group>
              <Collapse in={isDetailsExpanded}>
                <Stack gap="md">
                  {context && (
                    <Stack gap="xs">
                      <Text size="xs" fw={600} c="dimmed">Context</Text>
                      <Code block style={{ whiteSpace: "pre-wrap" }}>
                        {context}
                      </Code>
                    </Stack>
                  )}
                  {errorStack && (
                    <Stack gap="xs">
                      <Text size="xs" fw={600} c="dimmed">Stack Trace</Text>
                      <Code block style={{ whiteSpace: "pre-wrap", maxHeight: "200px", overflow: "auto" }}>
                        {errorStack}
                      </Code>
                    </Stack>
                  )}
                </Stack>
              </Collapse>
            </Stack>
          )}

          {/* GitHub Issue Search Results */}
          {githubRepo && hasSearched && (
            <Stack gap="xs">
              <Text size="sm" fw={600}>Related Issues</Text>
              {existingIssues.length > 0 ? (
                <Stack gap="xs">
                  {existingIssues.map((issue) => (
                    <Button
                      key={issue.number}
                      variant="light"
                      size="sm"
                      component="a"
                      href={issue.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      leftSection={<IconExternalLink size={16} />}
                      style={{ justifyContent: "flex-start" }}
                    >
                      <Text size="sm" truncate style={{ flex: 1, textAlign: "left" }}>
                        #{issue.number}: {issue.title}
                      </Text>
                    </Button>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    color="red"
                    leftSection={<IconBug size={16} />}
                    onClick={createNewIssue}
                    fullWidth
                  >
                    Create New Issue
                  </Button>
                </Stack>
              ) : (
                <Stack gap="xs">
                  <Text size="sm" c="dimmed">No existing issues found for this error.</Text>
                  <Button
                    variant="filled"
                    size="sm"
                    color="red"
                    leftSection={<IconBug size={16} />}
                    onClick={createNewIssue}
                    fullWidth
                  >
                    Create New Issue
                  </Button>
                </Stack>
              )}
            </Stack>
          )}

          {/* Loading state while searching */}
          {githubRepo && isSearching && !hasSearched && (
            <Group gap="xs" style={{ justifyContent: "center" }}>
              <Text size="sm" c="dimmed">Searching for related issues...</Text>
            </Group>
          )}
        </Stack>
      </Modal>
    </>
  );
}

