import { FlatCompat } from "@eslint/eslintrc";
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: ["src/components/originkit/**", "src/components/brand/logo-paths.ts", ".next/**"] },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
];
