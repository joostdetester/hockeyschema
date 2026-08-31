import tseslint from 'typescript-eslint';
import playwright from 'eslint-plugin-playwright';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: ['.features-gen/**', 'node_modules/**', 'allure-report/**', 'playwright-report/**'],
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
