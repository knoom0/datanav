import * as HeroIconsOutline from "@heroicons/react/24/outline";
import * as HeroIconsSolid from "@heroicons/react/24/solid";
import * as MantineCarousel from "@mantine/carousel";
import * as MantineCharts from "@mantine/charts";
import * as MantineCodeHighlight from "@mantine/code-highlight";
import * as MantineCore from "@mantine/core";
import * as MantineDates from "@mantine/dates";
import * as MantineDropzone from "@mantine/dropzone";
import * as MantineForm from "@mantine/form";
import * as MantineHooks from "@mantine/hooks";
import * as MantineModals from "@mantine/modals";
import * as MantineNotifications from "@mantine/notifications";
import * as MantineNprogress from "@mantine/nprogress";
import * as MantineSpotlight from "@mantine/spotlight";
import * as MantineTiptap from "@mantine/tiptap";
import * as TablerIcons from "@tabler/icons-react";
import * as React from "react";

export const config = {
  agent: {
    codeAgent: {
      model: "gpt-5",
    },
    gEval: {
      model: "gpt-4.1",
    },
    reportingAgent: {
      model: "gpt-5",
      providerOptions: {
        openai: {
          reasoningSummary: "auto",
        }
      }
    },
    model: "gpt-4.1",
  },

  database: {
    type: "postgres",
    ssl: {
      rejectUnauthorized: false
    }
  },

  email: {
    sender: "noreply@datanav.app",
    senderName: "DataNav"
  },

  github: {
    repo: "knoom0/datanav",
  },

  hosting: {
    enabled: false,
  },

  job: {
    maxJobDurationMs: 60000,
  },

  model: {
    small: "openai:gpt-4o-mini",
    embedding: "openai:text-embedding-3-small",
  },

  packages: {
    "react": React,
    "@mantine/carousel": MantineCarousel,
    "@mantine/charts": MantineCharts,
    "@mantine/code-highlight": MantineCodeHighlight,
    "@mantine/core": MantineCore,
    "@mantine/dates": MantineDates,
    "@mantine/dropzone": MantineDropzone,
    "@mantine/form": MantineForm,
    "@mantine/hooks": MantineHooks,
    "@mantine/modals": MantineModals,
    "@mantine/notifications": MantineNotifications,
    "@mantine/nprogress": MantineNprogress,
    "@mantine/spotlight": MantineSpotlight,
    "@mantine/tiptap": MantineTiptap,
    "@tabler/icons-react": TablerIcons,
    "@heroicons/react/24/solid": HeroIconsSolid,
    "@heroicons/react/24/outline": HeroIconsOutline,
  },

  redis: {
    url: process.env.REDIS_URL || "redis://localhost:6379",
  },
};
