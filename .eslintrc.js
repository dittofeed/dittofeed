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
    "consistent-return": "off",
    "default-case": "off",
    "filenames/no-index": "error",
    "import/prefer-default-export": "off",
    "no-continue": "off",
    "no-labels": "off",
    "no-plusplus": ["error", { allowForLoopAfterthoughts: true }],
    "no-restricted-syntax": "off",
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
        ignorePropertyModificationsFor: ["memo"],
      },
    ],
  },
  root: true,
};
