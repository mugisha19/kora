/**
 * Commit message rules for the whole Kora monorepo (web and API commits alike).
 *
 * Scopes say which app a change belongs to, so `git log -- kora-web` and release notes stay readable:
 *   feat(web/board): …   fix(api/auth): …   chore(repo): …   ci(web): …
 */
const SCOPE_PATTERN = /^((web|api)(\/[a-z0-9-]+)?|repo|ci|deps|docs|release)$/;

export default {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'kora-scope-format': ({ scope }) => [
          Boolean(scope && SCOPE_PATTERN.test(scope)),
          'scope must be web[/area], api[/area], repo, ci, deps, docs or release (e.g. "web/auth")',
        ],
      },
    },
  ],
  rules: {
    'scope-empty': [2, 'never'],
    'kora-scope-format': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'body-max-line-length': [1, 'always', 100],
  },
};
