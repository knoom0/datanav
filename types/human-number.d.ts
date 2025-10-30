declare module "human-number" {
  function humanNumber(
    value: number,
    fn?: (n: number) => number
  ): string;

  export = humanNumber;
}

