"use client"

import {
  Container,
  Paper,
  TextInput,
  PasswordInput,
  Button,
  Title,
  Text,
  Stack,
  Alert,
  Tabs,
  Group,
  Loader
} from "@mantine/core"
import { IconAlertCircle } from "@tabler/icons-react"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useState } from "react"

import { createClient } from "@/lib/supabase/client";
import { isHostingEnabled } from "@/lib/util/hosting";

function LoginPageContent() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>("signin");
  
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "/chat";
  
  const hostingEnabled = isHostingEnabled();

  if (!hostingEnabled) {
    return (
      <Container size={420} my={40}>
        <Title ta="center" order={1} mb="md">
          Welcome to DataNav
        </Title>

        <Text c="dimmed" size="sm" ta="center" mb="xl">
          Authentication is currently disabled.
        </Text>

        <Paper withBorder shadow="md" p={30} mt={30} radius="md">
          <Alert icon={<IconAlertCircle size="1rem" />} color="yellow">
            Hosting features are disabled for this deployment, so signing in is
            unavailable.
          </Alert>
        </Paper>
      </Container>
    )
  }

  const supabase = createClient()

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      router.push(redirectTo)
      router.refresh()
    }
    
    setLoading(false)
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signUp({
      email,
      password,
    })

    if (error) {
      setError(error.message)
    } else {
      setError(null)
      // Show success message instead of redirecting
      setActiveTab("signin")
      setPassword("")
      // You might want to show a success message here
    }
    
    setLoading(false)
  }

  const handleGitHubSignIn = async () => {
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  const handleGoogleSignIn = async () => {
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirectTo=${encodeURIComponent(redirectTo)}`
      }
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    }
  }

  return (
    <Container size={420} my={40}>
      <Title ta="center" order={1} mb="md">
        Welcome to DataNav
      </Title>
      
      <Text c="dimmed" size="sm" ta="center" mb="xl">
        Sign in to access your data analytics workspace
      </Text>

      <Paper withBorder shadow="md" p={30} mt={30} radius="md">
        <Tabs value={activeTab} onChange={setActiveTab}>
          <Tabs.List grow>
            <Tabs.Tab value="signin">Sign In</Tabs.Tab>
            <Tabs.Tab value="signup">Sign Up</Tabs.Tab>
          </Tabs.List>

          <Tabs.Panel value="signin" pt="md">
            {error && (
              <Alert icon={<IconAlertCircle size="1rem" />} color="red" mb="md">
                {error}
              </Alert>
            )}
            
            <form onSubmit={handleSignIn}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="your@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Your password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" fullWidth loading={loading}>
                  Sign In
                </Button>
              </Stack>
            </form>
          </Tabs.Panel>

          <Tabs.Panel value="signup" pt="md">
            {error && (
              <Alert icon={<IconAlertCircle size="1rem" />} color="red" mb="md">
                {error}
              </Alert>
            )}
            
            <form onSubmit={handleSignUp}>
              <Stack gap="md">
                <TextInput
                  label="Email"
                  placeholder="your@email.com"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                <PasswordInput
                  label="Password"
                  placeholder="Create a password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <Button type="submit" fullWidth loading={loading}>
                  Sign Up
                </Button>
              </Stack>
            </form>
          </Tabs.Panel>
        </Tabs>

        <Group justify="center" mt="xl" gap="xs">
          <Button 
            variant="outline" 
            onClick={handleGitHubSignIn}
            loading={loading}
            style={{ flex: 1 }}
          >
            GitHub
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGoogleSignIn}
            loading={loading}
            style={{ flex: 1 }}
          >
            Google
          </Button>
        </Group>
      </Paper>
    </Container>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <Container size={420} my={40}>
        <Title ta="center" order={1} mb="md">
          Welcome to DataNav
        </Title>
        <Text c="dimmed" size="sm" ta="center" mb="xl">
          Sign in to access your data analytics workspace
        </Text>
        <Paper withBorder shadow="md" p={30} mt={30} radius="md">
          <Stack align="center" gap="md">
            <Loader size="lg" />
            <Text ta="center">Loading...</Text>
          </Stack>
        </Paper>
      </Container>
    }>
      <LoginPageContent />
    </Suspense>
  );
}
