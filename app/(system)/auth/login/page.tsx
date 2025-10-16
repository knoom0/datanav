import {
  Container,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from "@mantine/core"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import LoginPageClient from "@/app/(system)/auth/login/login-page-client"
import { getConfig } from "@/lib/config"

function LoadingFallback() {
  return (
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
  )
}

export default function LoginPage() {
  const config = getConfig()

  if (!config.hosting?.enabled) {
    notFound()
  }

  return (
    <Suspense fallback={<LoadingFallback />}>
      <LoginPageClient />
    </Suspense>
  )
}
