const { EOL } = require('os');
const fs = require('fs');
const { Plugin } = require('release-it');
const conventionalRecommendedBump = require('conventional-recommended-bump');
const conventionalChangelog = require('conventional-changelog');
const semver = require('semver');
const concat = require('concat-stream');
const prependFile = require('prepend-file');

class ConventionalChangelog extends Plugin {
  getIncrementedVersion() {
    const { latestVersion, isPreRelease, preReleaseId } = this.config.getContext();
    return new Promise((resolve, reject) =>
      conventionalRecommendedBump(this.options, (err, result) => {
        this.debug({ err, result });
        if (err) return reject(err);
        const { releaseType } = result;
        if (releaseType) {
          const type = isPreRelease ? `pre${result.releaseType}` : result.releaseType;
          resolve(semver.inc(latestVersion, type, preReleaseId));
        } else {
          resolve(null);
        }
      })
    );
  }

  getChangelogStream(options) {
    return conventionalChangelog(options);
  }

  getChangelog(options) {
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
      changelog = await this.getChangelog(Object.assign({ releaseCount: 0 }, this.options));
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
    const options = Object.assign({}, this.options);
    const changelog = await this.getChangelog(options);
    this.debug({ changelog });
    this.config.setContext({ changelog });

    if (options.infile) {
      await this.writeChangelog();
    }
  }
}

module.exports = ConventionalChangelog;
