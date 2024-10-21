# Conventional Changelog plugin for release-it

This plugin will provide the recommended bump to release-it, and update the changelog file (e.g. `CHANGELOG.md`).

```
npm install --save-dev @release-it/conventional-changelog
```

## Configuration

In the [release-it][1] config, for example:

```json
"plugins": {
  "@release-it/conventional-changelog": {
    "preset": {
      "name": "angular"
    },
    "infile": "CHANGELOG.md"
  }
}
```

The plugin is a wrapper around conventional-changelog packages [conventional-recommended-bump][2],
[conventional-changelog-core][3] and more.

## Contents

- [`preset`][4]
- Bump
  - [`commitsOpts`][5]
  - [`tagOpts`][6]
  - [`whatBump`][7]
  - [`ignoreRecommendedBump`][8]
  - [`strictSemVer`][9]
- Changelog
  - [`infile`][10]
  - [`header`][11]
  - [`context`][12]
  - [`gitRawCommitsOpts`][13]
  - [`parserOpts`][14]
  - [`writerOpts`][15]

### `preset`

For `preset.name`, use one of:

- `angular`
- `atom`
- `codemirror`
- `conventionalcommits`
- `ember`
- `eslint`
- `express`
- `jquery`
- `jscs`
- `jshint`

Use an object with `name` and `types` to use a custom preset:

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

This is passed as the first argument to [`bumper.loadPreset`][16] (in both bumper and changelog writer).

See the [Conventional Changelog Configuration Spec (v2.1.0)][17] for the configuration object to pass as `preset`.

## Bump

### `tagOpts`

- This option will be passed as the first argument to [`bumper.tag`][16]
- [Type definition for `tagOpts` → look for `GetSemverTagsParams`][18]

### `commitsOpts`

- This option will be passed as the first argument to [`bumper.commits`][16]
- [Type definition for `commitsOpts` → look for `GetCommitsParams`][18]

### `whatBump`

- This option will be passed as the first argument to [`bumper.bump`][16]
- [Type definition for `whatBump` → look for `Preset['whatBump']`][19]
- Use `false` to skip releasing a new version:

```json
{
  "plugins": {
    "@release-it/conventional-changelog": {
      "whatBump": false
    }
  }
}
```

### `ignoreRecommendedBump`

Default value: `false`

Use `true` to ignore the recommended bump, and use the version provided by release-it (command line argument or prompt).

Note that the changelog preview shows the recommended bump, as the desired version isn't known yet in the release-it
process. The `infile` will have the correct version.

### `strictSemVer`

Default value: `false`

Use `true` to strictly follow semver, also in consecutive pre-releases. This means that from a pre-release, a
recommended bump will result in a next pre-release for the next version.

For example, from `1.0.0-alpha.0` a recommended bump of `minor` will result in a `preminor` bump to `1.1.0-alpha.0`.

The default behavior results in a `prerelease` bump to `1.0.0-alpha.1`.

## Changelog

### `infile`

Default value: `undefined`

- Set a filename as `infile` to write the changelog to. If this file does not exist yet, it's created with the full
  history.
- When `infile` is not set, the changelog generated by this plugin will still be used as release notes for e.g. [GitHub
  Releases][20].
- Set `infile: false` to disable the changelog writing (and only use the recommended bump for the next version).

### `header`

Set the main header for the changelog document:

```json
{
  "plugins": {
    "@release-it/conventional-changelog": {
      "infile": "CHANGELOG.md",
      "header": "# Changelog",
      "preset": {
        "name": "conventionalcommits"
      }
    }
  }
}
```

### `context`

Default value: `undefined`

This option will be passed as the second argument (`context`) to [conventional-changelog-core][21], for example:

```json
"plugins": {
  "@release-it/conventional-changelog": {
    "context": {
      "linkCompare": false
    }
  }
}
```

### `gitRawCommitsOpts`

Default value: `undefined`

Options for [`git-raw-commits`][22]. For example, you can use the following option to include merge commits into
changelog:

```json
{
  "plugins": {
    "@release-it/conventional-changelog": {
      "gitRawCommitsOpts": {
        "merges": null
      }
    }
  }
}
```

### `parserOpts`

- Default value: `undefined`
- Options for [`conventional-commits-parser`][23]
- This option will also be passed as the second argument to [`bumper.parserOptions`][16]
- [Type definition for `parserOpts` → look for `ParserOptions`][24]

For example, you can use the following option to set the merge pattern during parsing the commit message:

```json
{
  "plugins": {
    "@release-it/conventional-changelog": {
      "parserOpts": {
        "mergePattern": "^Merge pull request #(\\d+) from (.*)$"
      }
    }
  }
}
```

### `writerOpts`

- Default value: `undefined`
- Options for [`conventional-changelog-writer`][25]
- [Type definition for `writerOpts` → look for `Options`][26]

For example, you can use the following option to group the commits by 'scope' instead of 'type' by default.

```json
{
  "plugins": {
    "@release-it/conventional-changelog": {
      "writerOpts": {
        "groupBy": "scope"
      }
    }
  }
}
```

If you want to customize the templates used to write the changelog, you can do it like in a `.release-it.js` file like
so:

```js
const fs = require('fs');

const commitTemplate = fs.readFileSync('commit.hbs').toString();

module.exports = {
  plugins: {
    '@release-it/conventional-changelog': {
      writerOpts: {
        commitPartial: commitTemplate
      }
    }
  }
};
```

## Command-line

Options for this plugin can be set from the command line. Some examples:

```
release-it --plugins.@release-it/conventional-changelog.infile=history.md
release-it --no-plugins.@release-it/conventional-changelog.infile
```

- Keys are separated by dots.
- Values can be negated by prefixing the key with `no-`.
- Arguments may need to be single-quoted (`'`) such as `--'deep.key=value'` or `'--deep.key=value'`

Depending on your shell or OS this may differ.

## GitHub Actions

When using this plugin in a GitHub Action, make sure to set [`fetch-depth: 0`][27] so the history is available to
determine the correct recommended bump and changelog.

Also see [https://github.com/release-it/release-it/blob/master/docs/ci.md#github-actions][28]

[1]: https://github.com/release-it/release-it
[2]:
  https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-recommended-bump#readme
[3]:
  https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-core#api
[4]: #preset
[5]: #commitsopts
[6]: #tagopts
[7]: #whatbump
[8]: #ignorerecommendedbump
[9]: #strictsemver
[10]: #infile
[11]: #header
[12]: #context
[13]: #gitrawcommitsopts
[14]: #parseropts
[15]: #writeropts
[16]:
  https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-recommended-bump/README.md#api
[17]: https://github.com/conventional-changelog/conventional-changelog-config-spec/blob/master/versions/2.1.0/README.md
[18]: https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/git-client/src/types.ts
[19]:
  https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-recommended-bump/src/types.ts
[20]: https://github.com/release-it/release-it/blob/master/docs/github-releases.md
[21]:
  https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-core#context
[22]: https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/git-raw-commits#api
[23]:
  https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-commits-parser#api
[24]:
  https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-commits-parser/src/types.ts
[25]:
  https://github.com/conventional-changelog/conventional-changelog/tree/master/packages/conventional-changelog-writer#api
[26]:
  https://github.com/conventional-changelog/conventional-changelog/blob/master/packages/conventional-changelog-writer/src/types/options.ts
[27]: https://github.com/actions/checkout#fetch-all-history-for-all-tags-and-branches
[28]: https://github.com/release-it/release-it/blob/master/docs/ci.md#github-actions
