declare module "css-tree" {
  const csstree: any;
  export default csstree;
  export function parse(css: string): any;
  export function walk(ast: any, callback: (node: any) => void): void;
}
