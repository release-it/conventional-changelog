const { EOL } = require('os');
const fs = require('fs');
const { Plugin } = require('release-it');
const conventionalRecommendedBump = require('conventional-recommended-bump');
const conventionalChangelog = require('conventional-changelog');
const gitSemverTags = require('git-semver-tags');
const semver = require('semver');
const concat = require('concat-stream');
const prependFile = require('prepend-file');

class ConventionalChangelog extends Plugin {
  static disablePlugin() {
    return 'version';
  }

  getIncrementedVersion({ increment, latestVersion, isPreRelease, preReleaseId }) {
    this.setContext({ increment });
    this.debug({ increment, latestVersion, isPreRelease, preReleaseId });
    if (increment === false) return latestVersion;
    return new Promise((resolve, reject) =>
      conventionalRecommendedBump(this.options, (err, result) => {
        this.debug({ err, result });
        if (err) return reject(err);
        let { releaseType } = result;
        if(increment) {
          this.log.warn(`Recommended bump is "${releaseType}", but is overridden with "${increment}".`)
          releaseType = increment;
        }
        if(increment && semver.valid(increment)) {
          resolve(increment);
        } else if (releaseType) {
          const type = isPreRelease ? `pre${releaseType}` : releaseType;
          resolve(semver.inc(latestVersion, type, preReleaseId));
        } else {
          resolve(null);
        }
      })
    );
  }

  async getChangelogStream(options = {}) {
    const { increment } = this.getContext();
    const gitRawCommitsOpts = {
      debug: this.config.isDebug ? this.debug : null
    };
    if (increment === false) {
      const tags = await new Promise((resolve, reject) => {
        gitSemverTags((err, tags) => {
          if(err){
            reject(err);
          } else {
            resolve(tags);
          }
        });
      });
      gitRawCommitsOpts.from = tags[1] || null;
    }
    return conventionalChangelog(Object.assign(options, this.options), null, gitRawCommitsOpts);
  }

  getChangelog(options) {
    return new Promise((resolve, reject) => {
      const resolver = result => resolve(result.toString().trim());
      this.getChangelogStream(options).then((changelogStream) => {
        changelogStream.pipe(concat(resolver));
        changelogStream.on('error', reject);
      });
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
      changelog = await this.getChangelog({ releaseCount: 0 });
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
    const changelog = await this.getChangelog();
    this.debug({ changelog });
    this.config.setContext({ changelog });

    this.log.exec(`Writing changelog to ${infile}`, isDryRun);

    if (infile && !isDryRun) {
      await this.writeChangelog();
    }
  }
}

module.exports = ConventionalChangelog;
