declare module "simple-grep" {
  interface GrepMatch {
    line_number: string;
    line: string;
  }

  interface GrepResult {
    file: string;
    results: GrepMatch[];
  }

  type GrepCallback = (results: GrepResult[]) => void;

  function grep(pattern: string, target: string, callback: GrepCallback): void;

  export = grep;
} 