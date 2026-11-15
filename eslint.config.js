// ESLint flat config (ESLint 9). Lints app source only; formatting is left
// to Prettier (`npm run format`), so the stylistic Vue template rules that
// would fight it are turned off below.
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
  {
    files: ['src/**/*.{ts,vue}'],
    extends: [...tseslint.configs.recommended, ...pluginVue.configs['flat/recommended']],
    languageOptions: {
      parserOptions: { parser: tseslint.parser, sourceType: 'module' },
    },
    rules: {
      // Prettier owns template layout.
      'vue/max-attributes-per-line': 'off',
      'vue/singleline-html-element-content-newline': 'off',
      'vue/multiline-html-element-content-newline': 'off',
      'vue/html-indent': 'off',
      'vue/html-self-closing': 'off',
      'vue/html-closing-bracket-newline': 'off',
      'vue/first-attribute-linebreak': 'off',
      'vue/html-closing-bracket-spacing': 'off',
      // Existing single-word views and board components; new ones should be multi-word.
      'vue/multi-word-component-names': [
        'error',
        { ignores: ['Canvas', 'District', 'Home', 'Join', 'Login', 'Signup'] },
      ],
    },
  },
);
