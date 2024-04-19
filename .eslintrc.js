module.exports = {
  ignorePatterns: ["**/*.js", "**/dist/**/*"],
  extends: [
    "eslint:recommended",
    "airbnb",
    "airbnb-typescript",
    "plugin:@typescript-eslint/recommended",
    "plugin:@typescript-eslint/strict",
    "prettier",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ["./tsconfig.eslint.json", "./packages/*/tsconfig.json"],
  },
  plugins: ["@typescript-eslint", "simple-import-sort", "filenames"],
  rules: {
    "@typescript-eslint/no-redeclare": "off",
    "@typescript-eslint/no-explicit-any": "error",
    "consistent-return": "off",
    // There's some kind of bug with this rule, which throws the error "Cannot read properties of undefined (reading 'kind')"
    "@typescript-eslint/return-await": "off",
    "default-case": "off",
    "filenames/no-index": "error",
    "import/prefer-default-export": "off",
    "no-continue": "off",
    "no-labels": "off",
    "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],
    "no-restricted-syntax": "off",
    "no-void": "off",
    "no-shadow": "off",
    "guard-for-in": "off",
    "simple-import-sort/exports": "error",
    "simple-import-sort/imports": "error",
    "import/no-extraneous-dependencies": ["error", { includeTypes: false }],
    "no-param-reassign": [
      "error",
      {
        props: true,
        // naming convention so that can use array reduce
        ignorePropertyModificationsFor: ["memo", "acc"],
      },
    ],
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
        caughtErrorsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/no-unsafe-enum-comparison": "error",
    "@typescript-eslint/no-duplicate-enum-values": "error",
  },
  root: true,
};
