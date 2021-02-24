# Conventional Changelog plugin for release-it

This plugin will provide the recommended bump to release-it, and update the changelog file (e.g. `CHANGELOG.md`).

```
npm install --save-dev @release-it/conventional-changelog
```

## Config

In the [release-it](https://github.com/release-it/release-it) config, for example:

```json
"plugins": {
  "@release-it/conventional-changelog": {
    "preset": "angular",
    "infile": "CHANGELOG.md"
  }
}
```

...or another example:

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

- Omit the `infile` at will. If set, but the file does not exist yet, it's created with the full history.
- Please find the
  [list of available presets](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages)
  (`angular`, `ember`, etc).
- Options are passed verbatim to
  [conventional-recommended-bump](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-recommended-bump#readme)
  and
  [conventional-changelog](https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog#readme).

## GitHub Actions

When using this plugin in a GitHub Action, make sure to set
[`fetch-depth: 0`](https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches) so the history is
available to determine the correct recommended bump and changelog.

Also see https://github.com/release-it/release-it/blob/master/docs/ci.md#github-actions
