# Conventional Changelog plugin for release-it

This plugin will provide the recommended bump to release-it, and update the changelog file (e.g. `CHANGELOG.md`).

```
npm install --save-dev @release-it/conventional-changelog
```

## Configuration

In the [release-it](https://github.com/release-it/release-it) config, for example:

```json
"plugins": {
  "@release-it/conventional-changelog": {
    "preset": "angular",
    "infile": "CHANGELOG.md"
  }
}
```

Options are passed verbatim to
[conventional-recommended-bump](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-recommended-bump#readme)
and
[conventional-changelog](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog#readme).

### `preset`

Use one of:

- `angular`
- `atom`
- `codemirror`
- `ember`
- `eslint`
- `express`
- `jquery`
- `jscs`
- `jshint`

Use an object with `name` and `types` to use a custom preset, such as conventional commits:

```json
"plugins": {
  "@release-it/conventional-changelog": {
    "infile": "CHANGELOG.md",
    "preset": {
      "name": "conventionalcommits",
      "types": [
        {
          "type": "feat",
          "section": "Features"
        },
        {
          "type": "fix",
          "section": "Bug Fixes"
        },
        {}
      ]
    }
  }
}
```

### `infile`

Default value: `undefined`

- Set a filename as `infile` to write the changelog to. If this file does not exist yet, it's created with the full
  history.
- When `infile` is not set, the changelog generated by this plugin will still be used as release notes for e.g.
  [GitHub Releases](https://github.com/release-it/release-it/blob/master/docs/github-releases.md).

### `ignoreRecommendedBump`

Default value: `false`

Use `true` to ignore the recommended bump, and use the version provided by release-it (command line argument or prompt).

(Note that the changelog preview shows the recommended bump, as the desired version isn't known yet. The `infile` will
have the correct version.)

## GitHub Actions

When using this plugin in a GitHub Action, make sure to set
[`fetch-depth: 0`](https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches) so the history is
available to determine the correct recommended bump and changelog.

Also see https://github.com/release-it/release-it/blob/master/docs/ci.md#github-actions
