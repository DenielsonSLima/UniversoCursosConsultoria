import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "pasta sem título/**"
    ]
  },
  js.configs.recommended,
  {
    files: ["**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        sourceType: "module"
      },
      globals: {
        window: "readonly",
        document: "readonly",
        alert: "readonly",
        confirm: "readonly",
        prompt: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        requestAnimationFrame: "readonly",
        FileReader: "readonly",
        navigator: "readonly",
        sessionStorage: "readonly",
        process: "readonly",
        Event: "readonly",
        KeyboardEvent: "readonly",
        Node: "readonly",
        NodeFilter: "readonly",
        Text: "readonly",
        Document: "readonly",
        Window: "readonly",
        WindowEventMap: "readonly",
        HTMLInputElement: "readonly",
        HTMLDivElement: "readonly",
        HTMLSelectElement: "readonly",
        HTMLTextAreaElement: "readonly",
        HTMLElement: "readonly",
        HTMLImageElement: "readonly",
        HTMLMetaElement: "readonly",
        HTMLLinkElement: "readonly",
        HTMLScriptElement: "readonly",
        SVGSVGElement: "readonly",
        MouseEvent: "readonly",
        File: "readonly",
        Blob: "readonly",
        Image: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        fetch: "readonly",
        Request: "readonly",
        RequestInit: "readonly",
        Response: "readonly",
        crypto: "readonly",
        btoa: "readonly",
        Deno: "readonly"
      }
    },
    plugins: {
      "react-hooks": reactHooks
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "no-unused-vars": ["error", {
        args: "none",
        caughtErrors: "none",
        ignoreRestSiblings: true
      }]
    }
  }
];
