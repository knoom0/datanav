"use client"

import { 
  Menu, 
  Avatar, 
  Text, 
  UnstyledButton, 
  Group
} from "@mantine/core"
import type { User } from "@supabase/supabase-js"
import { 
  IconLogout, 
  IconUser, 
  IconChevronDown 
} from "@tabler/icons-react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"

import { createClient } from "@/lib/supabase/client"

export function UserProfile() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      setUser(user)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setUser(session?.user ?? null)
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const handleSignOut = async () => {
    setLoading(true)
    await supabase.auth.signOut()
    router.push("/auth/login")
    router.refresh()
    setLoading(false)
  }

  if (!user) {
    return null
  }

  const displayName = user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split("@")[0] || "User"
  const avatarUrl = user.user_metadata?.avatar_url

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <UnstyledButton p="xs">
          <Group gap="xs">
            <Avatar 
              src={avatarUrl} 
              size="sm" 
              radius="xl"
            >
              <IconUser size="1rem" />
            </Avatar>
            <div style={{ flex: 1 }}>
              <Text size="sm" fw={500} lineClamp={1}>
                {displayName}
              </Text>
              <Text c="dimmed" size="xs" lineClamp={1}>
                {user.email}
              </Text>
            </div>
            <IconChevronDown size="1rem" />
          </Group>
        </UnstyledButton>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Item
          leftSection={<IconLogout size="1rem" />}
          onClick={handleSignOut}
          disabled={loading}
        >
          Sign Out
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

