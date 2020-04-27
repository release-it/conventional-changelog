const { EOL } = require('os');
const fs = require('fs');
const { Plugin } = require('release-it');
const conventionalRecommendedBump = require('conventional-recommended-bump');
const conventionalChangelog = require('conventional-changelog');
const semver = require('semver');
const concat = require('concat-stream');
const prependFile = require('prepend-file');

class ConventionalChangelog extends Plugin {
  static disablePlugin() {
    return 'version';
  }

  getInitialOptions(options, namespace) {
    options[namespace].tagName = options.git.tagName;
    return options[namespace];
  }

  async getChangelog(latestVersion) {
    const { version, previousTag, currentTag } = await this.getConventionalConfig(latestVersion);
    this.setContext({ version, previousTag, currentTag });
    return this.generateChangelog();
  }

  async getConventionalConfig(latestVersion) {
    const { increment, isPreRelease, preReleaseId } = this.config.getContext('version');
    const version = await this.getIncrementedVersion({ increment, latestVersion, isPreRelease, preReleaseId });
    this.setContext({ version });

    const previousTag = this.config.getContext('latestTag');
    const tagTemplate = this.options.tagName || ((previousTag || '').match(/^v/) ? 'v${version}' : '${version}');
    const currentTag = tagTemplate.replace('${version}', version);

    return { version, previousTag, currentTag };
  }

  getIncrementedVersion({ increment, latestVersion, isPreRelease, preReleaseId }) {
    const { version } = this.getContext();
    if (version) return version;
    this.debug({ increment, latestVersion, isPreRelease, preReleaseId });
    return new Promise((resolve, reject) =>
      conventionalRecommendedBump(this.options, (err, result) => {
        this.debug({ err, result });
        if (err) return reject(err);
        let { releaseType } = result;
        if (increment) {
          this.log.warn(`Recommended bump is "${releaseType}", but is overridden with "${increment}".`);
          releaseType = increment;
        }
        if (increment && semver.valid(increment)) {
          resolve(increment);
        } else if (isPreRelease) {
          const type = increment ? `pre${releaseType}` : 'prerelease';
          resolve(semver.inc(latestVersion, type, preReleaseId));
        } else if (releaseType) {
          resolve(semver.inc(latestVersion, releaseType, preReleaseId));
        } else {
          resolve(null);
        }
      })
    );
  }

  getChangelogStream(options = {}) {
    const { version, previousTag, currentTag } = this.getContext();
    return conventionalChangelog(
      Object.assign(options, this.options),
      { version, previousTag, currentTag },
      {
        debug: this.config.isDebug ? this.debug : null
      }
    );
  }

  generateChangelog(options) {
    return new Promise((resolve, reject) => {
      const resolver = result => resolve(result.toString().trim());
      const changelogStream = this.getChangelogStream(options);
      changelogStream.pipe(concat(resolver));
      changelogStream.on('error', reject);
    });
  }

  async writeChangelog() {
    const { infile } = this.options;
    let { changelog } = this.config.getContext();

    let hasInfile = false;
    try {
      fs.accessSync(infile);
      hasInfile = true;
    } catch (err) {
      this.debug(err);
    }

    if (!hasInfile) {
      changelog = await this.generateChangelog({ releaseCount: 0 });
      this.debug({ changelog });
    }

    await new Promise((resolve, reject) =>
      prependFile(infile, changelog + EOL + EOL, err => {
        if (err) return reject(err);
        resolve();
      })
    );

    if (!hasInfile) {
      await this.exec(`git add ${infile}`);
    }
  }

  async beforeRelease() {
    const { infile } = this.options;
    const { isDryRun } = this.global;

    this.log.exec(`Writing changelog to ${infile}`, isDryRun);

    if (infile && !isDryRun) {
      await this.writeChangelog();
    }
  }
}

module.exports = ConventionalChangelog;
