import * as MantineCore from "@mantine/core";
import * as TablerIcons from "@tabler/icons-react";
import * as React from "react";
import { describe, it, expect } from "vitest";

import { compileModule, CompileError } from "@/lib/ui-kit/code-compiler";

type CompileTestCase = {
  name: string;
  tsCode: string;
  imports?: Record<string, any>;
};

const cases: CompileTestCase[] = [
  {
    name: "default export function",
    tsCode: `
      export default function TestComponent() {
        return (
          <div style={{ color: 'green', fontWeight: 'bold' }}>Hello from compiled TS!</div>
        );
      }
    `,
  },
  {
    name: "multiple named exports and a default export",
    tsCode: `
      export function Helper() { return <span>Helper</span>; }
      export const value = 42;
      export default function TestComponent() {
        return <div>Default Export</div>;
      }
    `,
  },
  {
    name: "anonymous default exported function (should fail)",
    tsCode: `
      export default function() {
        return <div>Anonymous Default Function</div>;
      }
    `,
  },
  {
    name: "anonymous default exported class",
    tsCode: `
      import React from 'react';
      export default class extends React.Component {
        render() {
          return <div>Anonymous Default Class</div>;
        }
      }
    `,
  },
  {
    name: "various import statement forms",
    tsCode: `
      import React, { useState } from 'react';
      import * as ReactAll from 'react';
      import 'react';
      export default function TestComponent() {
        const [count] = useState(0);
        return <div>Imports: {typeof React} {typeof ReactAll} {count}</div>;
      }
    `,
  },
  {
    name: "error handling with source maps",
    tsCode: `
      interface Product {
        name: string;
        price: number;
      }

      function calculateTotal(products: Product[]): number {
        let total = 0;
        for (const product of products) {
          // This line will cause an error when product is null
          total += product.price * 1.1;
        }
        return total;
      }

      function processOrder() {
        const products: Product[] = [
          { name: "Widget", price: 10 },
          null as any, // This will cause the error
          { name: "Gadget", price: 20 }
        ];
        return calculateTotal(products);
      }

      export default processOrder;
    `,
  },
  {
    name: "mantine core imports",
    tsCode: `
      import React from 'react';
      import { Button } from '@mantine/core';
      import { IconHeart } from '@tabler/icons-react';

      export default function MantineComponent() {
        return (
          <Button variant="filled" color="blue">
            <IconHeart /> Mantine Button
          </Button>
        );
      }
    `,
    imports: {
      "react": React,
      "@mantine/core": MantineCore,
      "@tabler/icons-react": TablerIcons,
    }
  },
];

describe("compile (parameterized)", () => {
  it.each(cases)("$name", async ({ name, tsCode, imports }) => {
    let result: any;
    try {
      result = await compileModule({ tsCode, imports });
    } catch (e) {
      throw new Error(`Test Error: ${name}\n --- Typescript code ---\n${tsCode}\n\n --- JavaScript code ---\n${result?.compiledCode}\n\n Error: ${e}`, { cause: e });
    }

    // Verify compilation succeeded and includes source map
    expect(result.compiledCode).toBeTruthy();
    expect(result.sourceMap).toBeTruthy();
  }, 20000);

  it("should throw an error when the code contains a syntax error", async () => {
    const tsCode = `
      export default function TestComponent() {
        return <div>Hello from compiled TS!</div>;
    `;
    await expect(compileModule({ tsCode })).rejects.toThrow(CompileError);
  });
});
