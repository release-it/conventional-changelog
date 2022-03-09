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
    const tagName = options.git ? options.git.tagName : null;
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
          const type =
            releaseType && (options.strictSemVer || !semver.prerelease(latestVersion))
              ? `pre${releaseType}`
              : 'prerelease';
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
    const currentTag = isIncrement ? (tagTemplate ? tagTemplate.replace('${version}', version) : null) : latestTag;
    const previousTag = isIncrement ? latestTag : secondLatestTag;
    const releaseCount = opts.releaseCount === 0 ? 0 : isIncrement ? 1 : 2;
    const options = Object.assign({}, { releaseCount }, this.options);
    const context = Object.assign({ version, previousTag, currentTag }, this.options.context);
    const debug = this.config.isDebug ? this.debug : null;
    const gitRawCommitsOpts = Object.assign({ debug }, this.options.gitRawCommitsOpts);
    const { parserOpts, writerOpts } = options;
    delete options.context;
    delete options.gitRawCommitsOpts;
    delete options.parserOpts;
    delete options.writerOpts;
    this.debug('conventionalChangelog', { options, context, gitRawCommitsOpts, parserOpts, writerOpts });
    return conventionalChangelog(options, context, gitRawCommitsOpts, parserOpts, writerOpts);
  }

  generateChangelog(options) {
    return new Promise((resolve, reject) => {
      const resolver = result => resolve(result.toString().trim());
      const changelogStream = this.getChangelogStream(options);
      changelogStream.pipe(concat(resolver));
      changelogStream.on('error', reject);
    });
  }

  getPreviousChangelog() {
    const { infile } = this.options;
    return new Promise((resolve, reject) => {
      const readStream = fs.createReadStream(infile);
      const resolver = result => resolve(result.toString().trim());
      readStream.pipe(concat(resolver));
      readStream.on('error', reject);
    });
  }

  async writeChangelog() {
    const { infile, header: _header } = this.options;
    let { changelog } = this.config.getContext();
    const header = _header.split(/\r\n|\r|\n/g).join(EOL);

    let hasInfile = false;
    try {
      fs.accessSync(infile);
      hasInfile = true;
    } catch (err) {
      this.debug(err);
    }

    let previousChangelog = '';
    try {
      previousChangelog = await this.getPreviousChangelog();
      previousChangelog = previousChangelog.replace(header, '');
    } catch (err) {
      this.debug(err);
    }

    if (!hasInfile) {
      changelog = await this.generateChangelog({ releaseCount: 0 });
      this.debug({ changelog });
    }

    fs.writeFileSync(infile, header + EOL + EOL + changelog + previousChangelog);

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
