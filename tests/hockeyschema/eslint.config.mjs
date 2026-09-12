import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    // .vscode/cucumber-glue: auto-generated stub files for the VS Code Cucumber extension's
    // autocomplete/navigation (see .vscode/settings.json's cucumber.glue) - not real runtime
    // code (the actual step definitions live in steps/*.ts), so unused-param lint noise there
    // isn't a real code-quality issue.
    ignores: ['.features-gen/**', '.vscode/cucumber-glue/**', 'node_modules/**', 'allure-report/**', 'playwright-report/**'],
  },
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts'],
    plugins: { playwright },
    rules: {
      ...playwright.configs['flat/recommended'].rules,
      'playwright/no-wait-for-timeout': 'error',
      'playwright/no-conditional-in-test': 'warn',
      // Cucumber steps call expect() outside a visible test() block — the real
      // test() wiring only exists in the generated .features-gen spec files,
      // so this rule can't see it and always false-positives on step files.
      'playwright/no-standalone-expect': 'off',
    },
  },
  prettier,
);
