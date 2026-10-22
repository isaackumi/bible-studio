// The studio's icon catalog (vite.config.js lucideIcons): every Lucide icon's name and shapes.
declare module "virtual:lucide-icons" {
  const icons: Array<[name: string, node: Array<[tag: string, attrs: Record<string, string>]>]>;
  export default icons;
}
