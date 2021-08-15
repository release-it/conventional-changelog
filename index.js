const { EOL } = require('os');
const fs = require('fs');
const { Plugin } = require('release-it');
const conventionalRecommendedBump = require('conventional-recommended-bump');
const conventionalChangelog = require('conventional-changelog');
const semver = require('semver');
const concat = require('concat-stream');
const prependFile = require('prepend-file');

class ConventionalChangelog extends Plugin {
  static disablePlugin(options) {
    return options.ignoreRecommendedBump ? null : 'version';
  }

  getInitialOptions(options, namespace) {
    const { tagName } = options.git;
    options[namespace].tagPrefix = tagName ? tagName.replace(/v?\$\{version\}$/, '') : '';
    return options[namespace];
  }

  async getChangelog(latestVersion) {
    if (!this.config.isIncrement) {
      this.setContext({ version: latestVersion });
    } else {
      const { increment, isPreRelease, preReleaseId } = this.config.getContext('version');
      const version = await this.getRecommendedVersion({ increment, latestVersion, isPreRelease, preReleaseId });
      this.setContext({ version });
    }
    return this.generateChangelog();
  }

  getRecommendedVersion({ increment, latestVersion, isPreRelease, preReleaseId }) {
    const { version } = this.getContext();
    if (version) return version;
    const { options } = this;
    this.debug({ increment, latestVersion, isPreRelease, preReleaseId });
    this.debug('conventionalRecommendedBump', { options });
    return new Promise((resolve, reject) =>
      conventionalRecommendedBump(options, (err, result) => {
        this.debug({ err, result });
        if (err) return reject(err);
        let { releaseType } = result;
        if (increment) {
          this.log.warn(`The recommended bump is "${releaseType}", but is overridden with "${increment}".`);
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

  getChangelogStream(opts = {}) {
    const { version } = this.getContext();
    const { isIncrement } = this.config;
    const { latestTag, secondLatestTag, tagTemplate } = this.config.getContext();
    const currentTag = isIncrement ? (tagTemplate ? tagTemplate.replace('${version}', version) : version) : latestTag;
    const previousTag = isIncrement ? latestTag : secondLatestTag;
    const releaseCount = opts.releaseCount === 0 ? 0 : isIncrement ? 1 : 2;
    const options = Object.assign({}, { releaseCount }, this.options);
    const context = { version, previousTag, currentTag };
    const debug = this.config.isDebug ? this.debug : null;
    const gitRawCommitsOpts = Object.assign({}, options.gitRawCommitsOpts || {}, { debug });
    this.debug('conventionalChangelog', { options, context, gitRawCommitsOpts });
    return conventionalChangelog(options, context, gitRawCommitsOpts);
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

    await prependFile(infile, changelog + EOL + EOL);

    if (!hasInfile) {
      await this.exec(`git add ${infile}`);
    }
  }

  getIncrementedVersion(options) {
    const { ignoreRecommendedBump } = this.options;
    return ignoreRecommendedBump ? null : this.getRecommendedVersion(options);
  }

  getIncrementedVersionCI(options) {
    return this.getIncrementedVersion(options);
  }

  async bump(version) {
    const recommendedVersion = this.getContext('version');

    this.setContext({ version });

    if (this.options.ignoreRecommendedBump && recommendedVersion !== version) {
      const changelog = await this.generateChangelog();
      this.config.setContext({ changelog });
    }
  }

  async beforeRelease() {
    const { infile } = this.options;
    const { isDryRun } = this.config;

    this.log.exec(`Writing changelog to ${infile}`, isDryRun);

    if (infile && !isDryRun) {
      await this.writeChangelog();
    }
  }
}

module.exports = ConventionalChangelog;
