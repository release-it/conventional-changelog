import { EOL } from 'node:os';
import fs from 'node:fs';
import { Plugin } from 'release-it';
import { Bumper } from 'conventional-recommended-bump';
import { ConventionalChangelog as ConventionalChangelogGenerator } from 'conventional-changelog';
import { ConventionalGitClient } from '@conventional-changelog/git-client';
import semver from 'semver';
import concat from 'concat-stream';

// Wrapper function to provide backward compatibility with the old API
async function conventionalChangelog(
  options = {},
  context = {},
  gitRawCommitsOpts = {},
  parserOpts = {},
  writerOpts = {}
) {
  const generator = new ConventionalChangelogGenerator(options.cwd || process.cwd());

  if (options.preset) {
    generator.loadPreset(options.preset);
  }

  if (options.releaseCount !== undefined || options.append !== undefined) {
    generator.options({
      releaseCount: options.releaseCount,
      append: options.append
    });
  }

  if (Object.keys(context).length > 0) {
    generator.context(context);
  }

  if (Object.keys(gitRawCommitsOpts).length > 0 || Object.keys(parserOpts).length > 0) {
    generator.commits(gitRawCommitsOpts, parserOpts);
  }

  if (Object.keys(writerOpts).length > 0) {
    generator.writer(writerOpts);
  }

  try {
    await generator.gitClient.getConfig('remote.origin.url');
    generator.readRepository();
  } catch {}

  return generator.writeStream();
}

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
      const { increment, isPreRelease, preReleaseId, preReleaseBase } = this.config.getContext('version');
      const version = await this.getRecommendedVersion({
        increment,
        latestVersion,
        isPreRelease,
        preReleaseId,
        preReleaseBase
      });
      this.setContext({ version });
    }
    return this.generateChangelog();
  }

  async getRecommendedVersion({ increment, latestVersion, isPreRelease, preReleaseId, preReleaseBase }) {
    const { version } = this.getContext();
    if (version) return version;
    const { options } = this;
    this.debug({ increment, latestVersion, isPreRelease, preReleaseId, preReleaseBase });
    this.debug('conventionalRecommendedBump', { options });
    try {
      const bumper = new Bumper();

      if (options.preset) bumper.loadPreset(options.preset);

      if (options.tagOpts) bumper.tag(options.tagOpts);

      if (options.commitsOpts || options.parserOpts) {
        bumper.commits(options.commitsOpts || {}, options.parserOpts);
      }

      let whatBumpFn;
      if (options.whatBump === false) {
        whatBumpFn = () => ({ releaseType: null });
      } else if (typeof options.whatBump === 'function') {
        whatBumpFn = options.whatBump;
      } else {
        // Use the whatBump from the loaded preset
        whatBumpFn = bumper.whatBump;
      }

      const recommendation = await bumper.bump(whatBumpFn);

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
          return semver.inc(latestVersion, `pre${releaseType}`, preReleaseId, preReleaseBase);
        }

        const gitClient = new ConventionalGitClient(options.cwd || process.cwd());
        const tagsIterable = gitClient.getSemverTags({
          prefix: options.tagPrefix || '',
          skipUnstable: true
        });

        const tags = [];
        for await (const tag of tagsIterable) {
          tags.push(tag);
        }

        bumper.tag({ ...options.tagOpts, skipUnstable: true });

        const { releaseType: releaseTypeToLastNonPrerelease } = await bumper.bump(whatBumpFn);

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
            return semver.inc(latestVersion, `pre${releaseTypeToLastNonPrerelease}`, preReleaseId, preReleaseBase);
          }
        }

        return semver.inc(latestVersion, 'prerelease', preReleaseId, preReleaseBase);
      }

      if (releaseType) {
        return semver.inc(latestVersion, releaseType, preReleaseId, preReleaseBase);
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
      this.getChangelogStream(options).then(changelogStream => {
        changelogStream.pipe(concat(resolver));
        changelogStream.on('error', reject);
      });
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
    const { infile, header: _header = '# Changelog' } = this.options;
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
