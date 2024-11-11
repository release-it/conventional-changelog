import { mock, test } from 'node:test';
import { strict as assert } from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';
import { EOL } from 'node:os';
import sh from 'shelljs';
import tmp from 'tmp';
import semver from 'semver';
import runTasks from 'release-it';

sh.config.silent = true;

try {
  fs.unlinkSync('CHANGES.md');
} catch (error) {}

const noop = () => {};
const log = {
  log: noop,
  error: noop,
  verbose: noop,
  info: noop,
  obtrusive: noop,
  exec: noop,
  warn: noop,
  preview: noop
};

const namespace = 'conventional-changelog';
const { pathname } = new URL('./index.js', import.meta.url);
const preset = { name: 'angular' };

const getOptions = (options, git = { commit: false, tag: false }) => [
  {
    ci: true,
    git: { commit: git.commit, tag: git.tag, push: false, requireUpstream: false },
    plugins: { [pathname]: [namespace, options] }
  },
  { log }
];

const mkTmpDir = () => {
  const dir = tmp.dirSync({ prefix: namespace });
  return dir.name;
};

const add = (type, file, opts = { breaking: false }) => {
  sh.ShellString(file).toEnd(file);
  sh.exec(`git add ${file}`);
  sh.exec(`git commit -m "${type}(${file})${opts.breaking ? '!' : ''}: ${type} ${file}"`);
};

const setup = () => {
  const dir = mkTmpDir();
  sh.pushd(dir);
  sh.exec(`git init .`);
  add('fix', 'foo');
  return { dir };
};

const date = /\([0-9]{4}-[0-9]{2}-[0-9]{2}\)/.source;
const sha = /[0-9a-f]{7}/.source;
const level = (from, to) => `${/patch/.test(semver.diff(from, to)) ? '##' : '#'}`;
const header = (from, to, suffix = '') =>
  `${level(from, to)} \\[${to}\\]\\(/compare/${from}${suffix}...${to}${suffix}\\) ${date}`;
const features = EOL + EOL + EOL + '### Features' + EOL;
const fixes = EOL + EOL + EOL + '### Bug Fixes' + EOL;
const commit = (type, name) => EOL + `\\* \\*\\*${name}:\\*\\* ${type} ${name} ${sha}`;

const nl = value => value.split(/\r\n|\r|\n/g).join(EOL);

test('should generate changelog using recommended bump (minor)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('feat', 'baz');

  const options = getOptions({ preset });
  const { changelog } = await runTasks(...options);
  const title = header('1.0.0', '1.1.0');
  const bar = commit('fix', 'bar');
  const baz = commit('feat', 'baz');
  assert.match(nl(changelog), new RegExp('^' + title + fixes + bar + features + baz + '$'));
});

test('should generate changelog using recommended bump (patch)', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('fix', 'baz');

  const options = getOptions({ preset });
  const { changelog } = await runTasks(...options);
  const title = header('1.0.0', '1.0.1');
  const bar = commit('fix', 'bar');
  const baz = commit('fix', 'baz');
  assert.match(nl(changelog), new RegExp('^' + title + fixes + bar + baz + '$'));
});

test('should support tag suffix', async () => {
  setup();

  const latestVersion = '2.0.0';
  const suffix = '-next';
  const latestTag = latestVersion + suffix;

  sh.exec(`git tag ${latestTag}`);
  add('fix', 'bar');

  const [config, container] = getOptions({ preset });
  config.git.tagName = `\${version}${suffix}`;
  const { changelog, version } = await runTasks(config, container);
  assert.match(
    nl(changelog),
    // release-it supports tag suffix/template, but conventional-changelog does not so the title will not contain it:
    /^## \[2\.0\.1\]\(\/compare\/2\.0\.0-next\.\.\.2\.0\.1-next\) \([0-9]{4}-[0-9]{2}-[0-9]{2}\)\s*### Bug Fixes\s*\* \*\*bar:\*\* fix bar [0-9a-f]{7}$/
  );
  const title = header(latestVersion, version, suffix);
  const bar = commit('fix', 'bar');
  assert.match(nl(changelog), new RegExp('^' + title + fixes + bar + '$'));
});

test('should respect --no-increment and return previous, identical changelog', async () => {
  setup();

  sh.exec(`git tag 1.0.0`);
  add('feat', 'bar');
  add('fix', 'baz');
  sh.exec(`git tag 1.1.0`);
  add('fix', 'bar');
  add('feat', 'baz');
  sh.exec(`git tag 1.2.0`);

  const [config, container] = getOptions({ preset });
  config.increment = false;
  const { changelog } = await runTasks(config, container);
  const title = header('1.1.0', '1.2.0');
  const bar = commit('fix', 'bar');
  const baz = commit('feat', 'baz');
  assert.match(nl(changelog), new RegExp('^' + title + fixes + bar + features + baz + '$'));
});

test('should ignore recommended bump (option)', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('feat', 'baz');

  const options = getOptions({ preset, ignoreRecommendedBump: true });
  const { version } = await runTasks(...options);
  assert.equal(version, '1.0.1');
});

test('should use provided pre-release id', async t => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.1.0-alpha.0');
});

test('should follow conventional commit strategy with prereleaase', async t => {
  setup();
  sh.exec(`git tag 1.2.1`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset: { name: 'conventionalcommits' } }, { commit: true, tag: true });
  config.preRelease = 'alpha';
  const { version: version1 } = await runTasks(config, container);
  assert.equal(version1, '1.3.0-alpha.0');

  add('fix', 'buz');

  const { version: version2 } = await runTasks(config, container);
  assert.equal(version2, '1.3.0-alpha.1');

  add('feat', 'biz', { breaking: true });

  const { version: version3 } = await runTasks(config, container);
  assert.equal(version3, '2.0.0-alpha.0');

  add('fix', 'boz');

  const { version: version4 } = await runTasks(config, container);
  assert.equal(version4, '2.0.0-alpha.1');
});

test('should use provided pre-release id (pre-release continuation)', async t => {
  setup();
  sh.exec(`git tag 1.0.1-alpha.0`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.0.1-alpha.1');
});

test('should use provided pre-release id (next pre-release)', async t => {
  setup();
  sh.exec(`git tag 1.1.0-alpha.1`);

  const [config, container] = getOptions({ preset });
  config.preRelease = 'beta';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.1.0-beta.0');
});

test('should use recommended bump (after pre-rerelease)', async t => {
  setup();
  sh.exec(`git tag 1.0.1-beta.0`);
  add('feat', 'baz');

  const options = getOptions({ preset });
  const { version } = await runTasks(...options);
  assert.equal(version, '1.1.0');
});

test('should follow strict semver (pre-release continuation)', async t => {
  setup();
  sh.exec(`git tag 1.1.0-alpha.0`);
  add('feat', 'baz');

  const [config, container] = getOptions({ preset, strictSemVer: true });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.2.0-alpha.0');
});

test('should follow strict semver (pre-release continuation, conventionalcommits)', async t => {
  setup();
  sh.exec(`git tag 2.0.1-alpha.0`);
  sh.ShellString('file').toEnd('file');
  sh.exec(`git add file`);
  sh.exec(`git commit -m "feat: new feature"`);

  const [config, container] = getOptions({
    preset: { name: 'conventionalcommits' },
    strictSemVer: true,
    writerOpts: {},
    parserOpts: {}
  });
  config.preRelease = 'alpha';
  const { version } = await runTasks(config, container);
  assert.equal(version, '2.1.0-alpha.0');
});

test('should use provided increment', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);

  const [config, container] = getOptions({ preset });
  config.increment = 'major';
  const { version } = await runTasks(config, container);
  assert.equal(version, '2.0.0');
});

test('should use provided version (ignore recommended bump)', async () => {
  setup();

  const [config, container] = getOptions({ preset });
  config.increment = '1.2.3';
  const { version } = await runTasks(config, container);
  assert.equal(version, '1.2.3');
});

test('should not throw with Git plugin disabled', async () => {
  setup();

  const [config, container] = getOptions({ preset });
  config.git = false;
  const { version, changelog } = await runTasks(config, container);
  assert.equal(version, '0.0.1');
  const title = `## 0.0.1 ${date}`;
  const fix = commit('fix', 'foo');
  assert.match(nl(changelog), new RegExp(title + fixes + fix));
});

test(`should write and update infile`, async () => {
  const { dir } = setup();
  sh.exec(`git tag 1.0.0`);
  add('fix', 'foo');
  add('feat', 'bar');

  const h = 'The header' + EOL + EOL + 'The subheader';
  const infile = path.join(dir, 'CHANGES.md');
  const [config, container] = getOptions({ preset, infile, header: h });
  config.git.tag = true;
  await runTasks(config, container);
  const changelog = fs.readFileSync(infile).toString();
  const title = header('1.0.0', '1.1.0');
  const fix1 = commit('fix', 'foo');
  const feat1 = commit('feat', 'bar');
  const first = title + fixes + fix1 + features + feat1;
  assert.match(nl(changelog), new RegExp('^' + h + EOL + EOL + first + EOL + '$'));
  {
    add('fix', 'bar');
    add('fix', 'baz');

    const options = getOptions({ preset, infile, header: h });
    await runTasks(...options);
    const changelog = fs.readFileSync(infile).toString();
    const title2 = header('1.1.0', '1.1.1');
    const fix2 = commit('fix', 'bar');
    const fix3 = commit('fix', 'baz');
    const second = title2 + fixes + fix2 + fix3;
    assert.match(nl(changelog), new RegExp('^' + h + EOL + EOL + second + EOL + EOL + first + EOL + '$'));
  }
});

test('should reject if conventional bump passes error', async () => {
  setup();
  const options = getOptions({ preset: 'what?' });
  await assert.rejects(
    runTasks(...options),
    'Error: Unable to load the "what?" preset package. Please make sure it\'s installed.'
  );
});

test('should reject if conventional changelog has error', async () => {
  setup();
  const options = getOptions({ preset: () => {} });
  await assert.rejects(runTasks(...options), /preset must be string or object with property `name`/i);
});

test('should not write infile in dry run', async () => {
  const { dir } = setup();
  const infile = path.join(dir, 'DRYRUN.md');
  const [config, container] = getOptions({ preset, infile });
  config['dry-run'] = true;
  await runTasks(config, container);
  assert.throws(() => fs.readFileSync(infile), /no such file/);
});

test('should not write infile if set to false', async () => {
  const { dir } = setup();
  const infile = path.join(dir, 'DRYRUN.md');
  const options = getOptions({ preset, infile: false });
  const { version } = await runTasks(...options);
  assert.throws(() => fs.readFileSync(infile), /no such file/);
  assert.equal(version, '0.0.1');
});

test('should not bump when recommended bump returns null', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('feat', 'baz');
  {
    const options = getOptions({ preset: 'angular' });
    const { version } = await runTasks(...options);
    assert.equal(version, '1.1.0');
  }
  add('blorp', 'faz');
  add('faz', 'blorp');
  {
    const options = getOptions({ preset: 'angular' });
    const { version } = await runTasks(...options);
    assert.equal(version, '1.1.0'); // Incorrect result from conventional-recommended-bump
  }
  {
    const whatBump = commits => ({ level: null, reason: 'Parsed commits do not warrant a version bump.' });
    const options = getOptions({ whatBump });
    const { version } = await runTasks(...options);
    assert.equal(version, undefined);
  }
});

test('should not bump when whatBump === false', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  add('feat', 'baz');
  {
    const options = getOptions({ whatBump: false });
    const { version } = await runTasks(...options);
    assert.equal(version, undefined);
  }
});

test('should use given whatBump when provided', async () => {
  setup();
  sh.exec(`git tag 1.0.0`);
  add('fix', 'bar');
  const whatBump = mock.fn();
  {
    const options = getOptions({ whatBump });
    await runTasks(...options);
    assert.ok(whatBump.mock.callCount() > 1);
    const commitHeaders = whatBump.mock.calls[0].arguments[0]?.map(commit => commit.header);
    assert.strictEqual(commitHeaders.length, 1);
    assert.match(commitHeaders[0], /^fix\(bar\):/);
  }
});

// TODO Prepare test and verify results influenced by parserOpts and writerOpts
test.skip('should pass parserOpts and writerOpts', async t => {
  setup();
  const parserOpts = {
    mergePattern: /^Merge pull request #(\d+) from (.*)$/,
    mergeCorrespondence: ['id', 'source']
  };
  const writerOpts = {
    groupBy: 'type'
  };
  const [config, container] = getOptions({ preset, parserOpts, writerOpts });
  await runTasks(config, container);
});
