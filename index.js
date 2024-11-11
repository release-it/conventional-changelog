import { EOL } from 'node:os';
import fs from 'node:fs';
import { Plugin } from 'release-it';
import { Bumper } from 'conventional-recommended-bump';
import conventionalChangelog from 'conventional-changelog';
import semver from 'semver';
import concat from 'concat-stream';
import { getSemverTags } from 'git-semver-tags';

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
    if (!latestVersion) latestVersion = '0.0.0';
    if (!this.config.isIncrement) {
      this.setContext({ version: latestVersion });
    } else {
      const { increment, isPreRelease, preReleaseId } = this.config.getContext('version');
      const version = await this.getRecommendedVersion({ increment, latestVersion, isPreRelease, preReleaseId });
      this.setContext({ version });
    }
    return this.generateChangelog();
  }

  async getRecommendedVersion({ increment, latestVersion, isPreRelease, preReleaseId }) {
    const { version } = this.getContext();
    if (version) return version;
    const { options } = this;
    this.debug({ increment, latestVersion, isPreRelease, preReleaseId });
    this.debug('conventionalRecommendedBump', { options });
    try {
      const bumper = new Bumper();

      if (options.preset) await bumper.loadPreset(options.preset).preset;

      if (options.tagOpts) bumper.tag(options.tagOpts);

      if (options.commitsOpts) bumper.commits(options.commitsOpts, options.parserOpts);

      async function getWhatBump() {
        if (options.whatBump === false) {
          return () => ({ releaseType: null });
        } else if (typeof options.whatBump === 'function') {
          return options.whatBump;
        }
        const bumperPreset = await bumper.preset;

        if (bumperPreset === null) return () => ({ releaseType: null });

        return bumperPreset.whatBump || bumperPreset.recommendedBumpOpts.whatBump;
      }

      const recommendation = await bumper.bump(await getWhatBump());

      this.debug({ result: recommendation });

      let { releaseType } = recommendation;

      if (increment) {
        this.log.warn(`The recommended bump is "${releaseType}", but is overridden with "${increment}".`);
        releaseType = increment;
      }

      if (increment && semver.valid(increment)) {
        return increment;
      }

      if (isPreRelease) {
        if (releaseType && (options.strictSemVer || !semver.prerelease(latestVersion))) {
          return semver.inc(latestVersion, `pre${releaseType}`, preReleaseId);
        }

        const tags = await getSemverTags({
          lernaTags: !!options.lernaPackage,
          package: options.lernaPackage,
          tagPrefix: options.tagPrefix,
          skipUnstable: true,
          cwd: options.cwd
        });

        bumper.tag({ ...options.tagOpts, skipUnstable: true });

        const { releaseType: releaseTypeToLastNonPrerelease } = await bumper.bump(options.whatBump);

        const lastStableTag = tags.length > 0 ? tags[0] : null;

        if (
          lastStableTag &&
          (releaseTypeToLastNonPrerelease === 'major' ||
            releaseTypeToLastNonPrerelease === 'minor' ||
            releaseTypeToLastNonPrerelease === 'patch')
        ) {
          if (
            semver[releaseTypeToLastNonPrerelease](lastStableTag) ==
            semver[releaseTypeToLastNonPrerelease](latestVersion)
          ) {
            return semver.inc(latestVersion, `pre${releaseTypeToLastNonPrerelease}`, preReleaseId);
          }
        }

        return semver.inc(latestVersion, 'prerelease', preReleaseId);
      }

      if (releaseType) {
        return semver.inc(latestVersion, releaseType, preReleaseId);
      }

      return null;
    } catch (err) {
      this.debug({ err });
      throw err;
    }
  }

  getChangelogStream(rawOptions = {}) {
    const { version } = this.getContext();
    const { isIncrement } = this.config;
    const { latestTag, secondLatestTag, tagTemplate } = this.config.getContext();
    const currentTag = isIncrement ? (tagTemplate ? tagTemplate.replace('${version}', version) : null) : latestTag;
    const previousTag = isIncrement ? latestTag : secondLatestTag;
    const releaseCount = rawOptions.releaseCount === 0 ? 0 : isIncrement ? 1 : 2;
    const debug = this.config.isDebug ? this.debug : null;
    const mergedOptions = Object.assign({}, { releaseCount }, this.options);

    const { context, gitRawCommitsOpts, parserOpts, writerOpts, ...options } = mergedOptions;

    const mergedContext = Object.assign({ version, previousTag, currentTag }, context);
    const mergedGitRawCommitsOpts = Object.assign({ debug, from: previousTag }, gitRawCommitsOpts);

    this.debug('conventionalChangelog', {
      options,
      context: mergedContext,
      gitRawCommitsOpts: mergedGitRawCommitsOpts,
      parserOpts,
      writerOpts
    });

    return conventionalChangelog(options, mergedContext, mergedGitRawCommitsOpts, parserOpts, writerOpts);
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
    const { infile, header: _header = '' } = this.options;
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

    fs.writeFileSync(
      infile,
      header +
        (changelog ? EOL + EOL + changelog.trim() : '') +
        (previousChangelog ? EOL + EOL + previousChangelog.trim() : '') +
        EOL
    );

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

export default ConventionalChangelog;
